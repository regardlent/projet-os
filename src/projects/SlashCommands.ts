/**
 * Slash command parsing + registry + /goal,/create,/addon handlers (Phase 13).
 * Pure service layer (no vscode import) — dispatchable and unit-testable.
 */
import fs from "node:fs";
import path from "node:path";
import type { CommandResult, ManagedProjectManifest, ProjectType } from "./projectTypes.js";
import { GoalService, makeGoal } from "./GoalService.js";
import { AddonManager } from "./AddonManager.js";
import { AutonomyService } from "./AutonomyService.js";
import { resolveAutonomyMinutes, buildAutonomyPlan, summarizeAutonomy, type AutonomyComplexity } from "./autonomy.js";
import { AutonomyRunner } from "./AutonomyRunner.js";
import { buildWritePlan, buildWriteScope } from "./AutonomyWriteScope.js";
import type { ProjectFactory } from "./ProjectFactory.js";
import type { ManagedProjectRegistry } from "./ManagedProjectRegistry.js";
import { TodoTracker, FsTodoIO } from "./TodoTracker.js";

export interface ActiveProjectRef {
	slug: string;
	projectId: string;
	workspaceRoot: string;
}

export interface SlashCommandContext {
	factory: ProjectFactory;
	registry: ManagedProjectRegistry;
	/** Resolve the active managed project for an implicit target. */
	resolveActiveProject: () => ActiveProjectRef | null;
	/** Optional LocalAI runtime for autonomy runs (modelId/baseUrl). */
	runtime?: { modelId: string; baseUrl: string; apiKey?: string };
}

export interface ParsedSlash {
	name: string;
	args: string[];
	flags: Record<string, string>;
	raw: string;
}

/** Tokenize respecting single/double quotes, then split into args + --flags. */
export function parseSlash(line: string): ParsedSlash | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith("/")) return null;
	const tokens = tokenize(trimmed.slice(1));
	if (tokens.length === 0) return null;
	const name = tokens[0];
	const args: string[] = [];
	const flags: Record<string, string> = {};
	for (let i = 1; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.startsWith("--")) {
			let key = t.slice(2);
			let val = "";
			const eq = key.indexOf("=");
			if (eq >= 0) {
				val = key.slice(eq + 1);
				key = key.slice(0, eq);
			} else if (i + 1 < tokens.length && !tokens[i + 1].startsWith("--")) {
				val = tokens[++i];
			}
			flags[key] = val;
		} else {
			args.push(t);
		}
	}
	return { name, args, flags, raw: trimmed };
}

function tokenize(s: string): string[] {
	const out: string[] = [];
	let cur = "";
	let quote: string | null = null;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (quote) {
			if (ch === quote) quote = null;
			else cur += ch;
		} else if (ch === '"' || ch === "'") {
			quote = ch;
		} else if (/\s/.test(ch)) {
			if (cur) {
				out.push(cur);
				cur = "";
			}
		} else {
			cur += ch;
		}
	}
	if (cur) out.push(cur);
	return out;
}

export type SlashHandler = (parsed: ParsedSlash, ctx: SlashCommandContext) => Promise<CommandResult>;

export class SlashCommandRegistry {
	private readonly handlers = new Map<string, SlashHandler>();
	private readonly help = new Map<string, { usage: string; description: string }>();

	register(name: string, handler: SlashHandler, meta?: { usage?: string; description?: string }): void {
		this.handlers.set(name, handler);
		if (meta) this.help.set(name, { usage: meta.usage ?? `/${name}`, description: meta.description ?? "" });
	}

	has(name: string): boolean {
		return this.handlers.has(name);
	}

	names(): string[] {
		return [...this.handlers.keys()];
	}

	/** Describe a command (usage + description) or all commands when no name given. */
	describe(name?: string): { usage: string; description: string }[] {
		if (name) {
			const m = this.help.get(name) ?? { usage: `/${name}`, description: "(no description)" };
			return [m];
		}
		return [...this.help.entries()].map(([n, m]) => ({ usage: m.usage, description: `${m.description} (/${n})` }));
	}

	async dispatch(line: string, ctx: SlashCommandContext): Promise<CommandResult> {
		const parsed = parseSlash(line);
		if (!parsed) {
			return fail("(none)", "NOT_A_SLASH_COMMAND", "input is not a slash command");
		}
		const handler = this.handlers.get(parsed.name);
		if (!handler) {
			const known = this.help.size ? `Known: ${this.names().map((n) => "/" + n).join(", ")}` : "";
			return fail(parsed.name, "UNKNOWN_COMMAND", `Unknown command /${parsed.name}. ${known}`);
		}
		return handler(parsed, ctx);
	}
}

function fail(command: string, status: string, message: string): CommandResult {
	return { command, ok: false, status, message, warnings: [], actions: [], artifacts: [] };
}

function resolveTarget(parsed: ParsedSlash, ctx: SlashCommandContext): ActiveProjectRef | null {
	if (parsed.flags["project"]) {
		const m = ctx.registry.get(parsed.flags["project"]);
		if (m) return { slug: m.slug, projectId: m.projectId, workspaceRoot: m.workspaceRoot };
	}
	return ctx.resolveActiveProject();
}

export function goalHandler(parsed: ParsedSlash, ctx: SlashCommandContext): Promise<CommandResult> {
	const target = resolveTarget(parsed, ctx);
	if (!target) {
		return Promise.resolve(fail("goal", "NO_ACTIVE_PROJECT", "No active managed project. Use --project=<slug> or /create first."));
	}
	const objective = parsed.args.join(" ") || parsed.flags["objective"] || "";
	if (!objective) {
		return Promise.resolve(fail("goal", "OBJECTIVE_REQUIRED", "A goal objective is required."));
	}
	const gs = new GoalService(target.workspaceRoot);
	const previous = gs.load();
	let goal = makeGoal({
		projectId: target.projectId,
		objective,
		acceptanceCriteria: splitCsv(parsed.flags["accept"]),
		constraints: splitCsv(parsed.flags["constraints"]),
		priority: (parsed.flags["priority"] as "low" | "normal" | "high") || "normal",
	});
	if (previous) goal = { ...goal, goalId: previous.goalId, createdAt: previous.createdAt };
	gs.save(goal);
	gs.appendHistory(goal);
	ctx.registry.update(target.slug, { goal, updatedAt: Date.now() } as Partial<ManagedProjectManifest>);
	return Promise.resolve({
		command: "goal",
		ok: true,
		projectId: target.projectId,
		status: goal.status,
		message: `Goal set for ${target.slug}`,
		warnings: [],
		actions: ["handoff"],
		artifacts: [".project-os/goal.json"],
		next: "/create",
	});
}

export async function createHandler(parsed: ParsedSlash, ctx: SlashCommandContext): Promise<CommandResult> {
	const name = parsed.args[0] ?? "";
	if (!name) {
		return fail("create", "NAME_REQUIRED", "Usage: /create <name> [--type=<t>] [--goal=\"...\"] [--git=false]");
	}
	const type = (parsed.flags["type"] ?? "auto") as ProjectType;
	const goalf = parsed.flags["goal"] || parsed.flags["objective"] || "";
	const result = await ctx.factory.createProject({
		name,
		type,
		goal: goalf,
		objective: goalf,
		git: parsed.flags["git"] !== "false",
	});
	// Seed a persistent TODO (barré) for the freshly created project.
	if (result.ok && result.workspaceRoot) {
		const tracker = new TodoTracker(new FsTodoIO(result.workspaceRoot));
		tracker.seed(goalf || type);
		return {
			command: "create",
			ok: result.ok,
			projectId: result.projectId,
			status: result.status,
			message: result.message + " | Todo seeded (TODO.md + .project-os/todo.json)",
			warnings: result.warnings,
			actions: result.ok ? ["goal", "addon", "open", "todo"] : [],
			artifacts: result.ok ? [".project-os/project.json", ".project-os/goal.json", ".project-os/todo.json", "TODO.md"] : [],
			next: result.ok ? "/goal <objective> · /todo list" : undefined,
		};
	}
	return {
		command: "create",
		ok: result.ok,
		projectId: result.projectId,
		status: result.status,
		message: result.message,
		warnings: result.warnings,
		actions: result.ok ? ["goal", "addon", "open"] : [],
		artifacts: result.ok ? [".project-os/project.json", ".project-os/goal.json"] : [],
		next: result.ok ? "/goal <objective>" : undefined,
	};
}

export function todoHandler(parsed: ParsedSlash, ctx: SlashCommandContext): Promise<CommandResult> {
	const target = resolveTarget(parsed, ctx);
	if (!target) {
		return Promise.resolve(fail("todo", "NO_ACTIVE_PROJECT", "No active managed project. Use --project=<slug> or /create first."));
	}
	const tracker = new TodoTracker(new FsTodoIO(target.workspaceRoot));
	const sub = parsed.args[0] ?? "list";
	if (sub === "list") {
		return Promise.resolve({ command: "todo", ok: true, projectId: target.projectId, status: "LIST", message: tracker.render(), warnings: [], actions: ["todo.done", "todo.add"], artifacts: [".project-os/todo.json", "TODO.md"], next: "/todo done <key>" });
	}
	if (sub === "done") {
		const key = parsed.args[1] ?? "";
		if (!key) return Promise.resolve(fail("todo", "KEY_REQUIRED", "Usage: /todo done <key>"));
		tracker.setState(key, "done");
		return Promise.resolve({ command: "todo", ok: true, projectId: target.projectId, status: "DONE", message: tracker.render(), warnings: [], actions: ["todo.list"], artifacts: [".project-os/todo.json", "TODO.md"], next: "/todo list" });
	}
	if (sub === "add") {
		const label = parsed.args.slice(1).join(" ") || parsed.flags["label"] || "";
		if (!label) return Promise.resolve(fail("todo", "LABEL_REQUIRED", "Usage: /todo add <label>"));
		tracker.setState(`custom-${Date.now()}`, "pending");
		return Promise.resolve({ command: "todo", ok: true, projectId: target.projectId, status: "ADDED", message: label + " added\n" + tracker.render(), warnings: [], actions: ["todo.list"], artifacts: [".project-os/todo.json", "TODO.md"], next: "/todo list" });
	}
	return Promise.resolve(fail("todo", "UNKNOWN_SUBCOMMAND", `Unknown /todo ${sub}`));
}


export function addonHandler(parsed: ParsedSlash, ctx: SlashCommandContext): Promise<CommandResult> {

	const target = resolveTarget(parsed, ctx);
	if (!target) {
		return Promise.resolve(fail("addon", "NO_ACTIVE_PROJECT", "No active managed project."));
	}
	const mgr = new AddonManager(target.workspaceRoot);
	const sub = parsed.args[0] ?? "list";
	const arg = parsed.args[1] ?? "";
	switch (sub) {
		case "list": {
			const entries = mgr.list();
			const addons = entries.length
				? entries.map((e) => `${e.addonId} ${e.enabled ? "(enabled)" : "(disabled)"}`).join(", ")
				: "none";
			return Promise.resolve({
				command: "addon",
				ok: true,
				projectId: target.projectId,
				status: "INSTALLED",
				message: `Workspace addons: ${addons}`,
				warnings: [],
				actions: ["addon.install", "addon.health"],
				artifacts: [".project-os/addons.lock.json"],
			});
		}
		case "recommended": {
			const manifest = ctx.registry.get(target.slug);
			const rec = AddonManager.defaultSet(manifest?.projectType ?? "auto");
			return Promise.resolve({
				command: "addon",
				ok: true,
				projectId: target.projectId,
				status: "AVAILABLE",
				message: `Recommended for ${manifest?.projectType ?? "auto"}: ${rec.join(", ")}`,
				warnings: [],
				actions: ["addon.install"],
				artifacts: [],
			});
		}
		case "install": {
			const r = mgr.install(arg);
			const err = (r as { error?: string }).error;
			if (err) return Promise.resolve(fail("addon", err, `install ${arg}: ${err}`));
			return Promise.resolve({
				command: "addon",
				ok: true,
				projectId: target.projectId,
				status: "ENABLED",
				message: `Installed ${arg}.`,
				warnings: mgr.conflicts(),
				actions: ["addon.enable", "addon.health"],
				artifacts: [".project-os/addons.lock.json"],
			});
		}
		case "disable": {
			const r = mgr.disable(arg);
			return Promise.resolve({
				command: "addon",
				ok: r.ok,
				projectId: target.projectId,
				status: r.ok ? "DISABLED" : "ERROR",
				message: `${arg}: ${r.message}`,
				warnings: [],
				actions: ["addon.enable"],
				artifacts: [".project-os/addons.lock.json"],
			});
		}
		case "enable": {
			const r = mgr.enable(arg);
			return Promise.resolve({
				command: "addon",
				ok: r.ok,
				projectId: target.projectId,
				status: r.ok ? "ENABLED" : "ERROR",
				message: `${arg}: ${r.message}`,
				warnings: [],
				actions: ["addon.health"],
				artifacts: [".project-os/addons.lock.json"],
			});
		}
		case "uninstall": {
			const r = mgr.uninstall(arg);
			return Promise.resolve({
				command: "addon",
				ok: r.ok,
				projectId: target.projectId,
				status: r.ok ? "REMOVED" : "ERROR",
				message: `${arg}: ${r.message}`,
				warnings: [],
				actions: ["addon.list"],
				artifacts: [".project-os/addons.lock.json"],
			});
		}
		case "health": {
			const h = mgr.health();
			const conflicts = mgr.conflicts();
			return Promise.resolve({
				command: "addon",
				ok: conflicts.length === 0,
				projectId: target.projectId,
				status: conflicts.length ? "CONFLICT" : "HEALTHY",
				message: conflicts.length ? `Conflicts: ${conflicts.join("; ")}` : `${h.length} addon(s) healthy`,
				warnings: conflicts,
				actions: ["addon.list"],
				artifacts: [".project-os/addons.lock.json"],
			});
		}
		default:
			return Promise.resolve(
				fail("addon", "ADDON_MANAGER_PENDING", `/addon ${sub} — unknown subcommand. Use list/recommended/install/disable/enable/uninstall/health.`),
			);
	}
}

export async function autonomyHandler(parsed: ParsedSlash, ctx: SlashCommandContext): Promise<CommandResult> {
	const target = resolveTarget(parsed, ctx);
	if (!target) {
		return fail("autonomy", "NO_ACTIVE_PROJECT", "No active managed project. Use --project=<slug> or /create first.");
	}
	const svc = new AutonomyService(target.workspaceRoot);
	const sub = parsed.args[0] ?? "plan";

	if (sub === "summary") {
		const plan = svc.load();
		if (!plan) return fail("autonomy", "NO_PLAN", "No autonomy plan yet (run /autonomy first).");
		return { command: "autonomy", ok: true, projectId: target.projectId, status: "SUMMARY", message: summarizeAutonomy(plan, []), warnings: [], actions: [], artifacts: [".project-os/autonomy.json"], next: "run" };
	}

	if (sub === "run") {
		const plan = svc.load();
		if (!plan) return fail("autonomy", "NO_PLAN", "No autonomy plan yet (run /autonomy first).");
		if (!ctx.runtime) return fail("autonomy", "RUNTIME_UNCONFIGURED", "LocalAI runtime not configured.");
		const runner = new AutonomyRunner({
			projectRoot: target.workspaceRoot,
			modelId: ctx.runtime.modelId,
			baseUrl: ctx.runtime.baseUrl,
			apiKey: ctx.runtime.apiKey,
		});
		const res = await runner.run(plan);
		svc.save({ ...plan, status: res.status });
		fs.writeFileSync(path.join(target.workspaceRoot, ".project-os", "autonomy-summary.md"), res.summary, "utf8");
		return {
			command: "autonomy",
			ok: res.status !== "FAILED",
			projectId: target.projectId,
			status: res.status,
			message: `Autonomy ${res.status}: ${res.iterations} iterations · outcome=${res.outcome}.`,
			warnings: res.errors,
			actions: ["qa", "handoff"],
			artifacts: [".project-os/autonomy-summary.md"],
			next: "handoff",
		};
	}

	// default: plan
	const gs = new GoalService(target.workspaceRoot);
	const goal = gs.load();
	if (!goal) return fail("autonomy", "NO_GOAL", "Set a goal first (/goal <objective>).");
	const manifest = ctx.registry.get(target.slug);
	const projectType = manifest?.projectType ?? "auto";
	const minutesFlag = Number(parsed.flags["minutes"] ?? "");
	const complexity = (parsed.flags["complexity"] ?? "auto") as AutonomyComplexity;
	const fileCount = countWorkspaceFiles(target.workspaceRoot);
	const minutes =
		Number.isFinite(minutesFlag) && minutesFlag > 0
			? Math.min(480, Math.round(minutesFlag))
			: resolveAutonomyMinutes({ complexity, projectType, goal: goal.objective, fileCount });
	const plan = buildAutonomyPlan({
		projectId: target.projectId,
		goalId: goal.goalId,
		objective: goal.objective,
		projectType,
		minutes,
		complexity,
	});
	svc.save(plan);
	svc.writeHandoff(makeHandoffStarter(plan));

	if (parsed.flags["write"]) {
		// WRITE lane: bounded scope + plan, gated on explicit approval. No blind write.
		const writePlan = buildWritePlan({
			runId: `run-${Date.now()}`,
			projectId: target.projectId,
			workspaceRoot: target.workspaceRoot,
			goal: goal.objective,
			minutes,
			model: (ctx.runtime?.modelId ?? "qwen3-4b"),
			allowedOperations: ["create", "modify", "patch"],
		});
		const scope = buildWriteScope({ runId: writePlan.runId, workspaceRoot: target.workspaceRoot, complexity: complexity === "auto" ? "medium" : complexity });
		fs.writeFileSync(path.join(target.workspaceRoot, ".project-os", "write-plan.json"), JSON.stringify(writePlan, null, 2), "utf8");
		fs.writeFileSync(path.join(target.workspaceRoot, ".project-os", "write-scope.json"), JSON.stringify(scope, null, 2), "utf8");
		return {
			command: "autonomy",
			ok: true,
			projectId: target.projectId,
			status: "WRITE_PLAN",
			message: `Write plan/scoped (${minutes} min, complexity=${complexity}): CREATE/MODIFY/PATCH only, maxFiles=${scope.maxFiles}, delete=blocked, secrets=blocked. Explicit approval required before any mutation.`,
			warnings: [],
			actions: ["autonomy.approve", "autonomy.run"],
			artifacts: [".project-os/write-plan.json", ".project-os/write-scope.json"],
			next: "Approve the write mission, then run the ClineCore write lane.",
		};
	}

	return {
		command: "autonomy",
		ok: true,
		projectId: target.projectId,
		status: "PLANNED",
		message: `Autonomy plan: ${minutes} min (complexity=${complexity}, ${fileCount} files) → /autonomy run`,
		warnings: [],
		actions: ["autonomy.run", "qa", "handoff"],
		artifacts: [".project-os/autonomy.json", ".project-os/handoff.md"],
		next: "run",
	};
}

/** Bounded count of non-ignored files under a project workspace. */
function countWorkspaceFiles(root: string): number {
	const skip = new Set(["node_modules", ".git", "dist", "build", ".project-os", ".agents"]);
	let count = 0;
	const walk = (dir: string): void => {
		let entries: import("node:fs").Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true }) as import("node:fs").Dirent[];
		} catch {
			return;
		}
		for (const e of entries) {
			if (skip.has(e.name)) continue;
			if (e.isDirectory()) walk(path.join(dir, e.name));
			else if (++count > 2000) return;
		}
	};
	walk(root);
	return count;
}

function makeHandoffStarter(plan: ReturnType<typeof buildAutonomyPlan>): string {
	return [
		`# HANDOFF — ${plan.objective}`,
		"",
		`- Mode: ${plan.mode}`,
		`- Budget autonomie: ${plan.minutes} min (complexity=${plan.complexity})`,
		`- Deadline: ${new Date(plan.deadline).toISOString()}`,
		`- Checkpoints: tous les ${plan.checkpointEveryMinutes} min`,
		"",
		"## Étapes",
		...plan.steps.map((s) => `- ${s}`),
		"",
		"## Prochaine action",
		"Lancer l'agent autonome sur ce plan, puis résumer via /autonomy summary.",
	].join("\n");
}

function splitCsv(v?: string): string[] {
	if (!v) return [];
	return v.split(",").map((s) => s.trim()).filter(Boolean);
}

