/**
 * vscode wiring for the Project Factory slash commands (Phase 13).
 * Reads config, builds services, registers /goal /create /addon /slash.
 */
import * as vscode from "vscode";
import { ManagedProjectRegistry } from "../projects/ManagedProjectRegistry.js";
import { ProjectFactory } from "../projects/ProjectFactory.js";
import {
	SlashCommandRegistry,
	goalHandler,
	createHandler,
	addonHandler,
	autonomyHandler,
	todoHandler,
	type ActiveProjectRef,
	type SlashCommandContext,
} from "../projects/SlashCommands.js";
import { docsHandler, projectHandler } from "../projects/ProductCommands.js";
import { bridgeHandler } from "../integrations/bridge/bridgeCommand.js";
import { bridgeConfigFromEnv } from "../integrations/bridge/config.js";
import { AntigravityCliAdapter } from "../integrations/bridge/AntigravityCliAdapter.js";
import type { StructuredLogger } from "../observability/OutputChannel.js";
import { ProjectsTreeProvider } from "../views/ProjectsTreeProvider.js";

/** Bridge runtime config from env (loopback, approval-required by default). */
function bridgeRuntimeConfig() {
	const { cfg, errors } = bridgeConfigFromEnv(process.env as Record<string, string | undefined>);
	if (errors.length) {
		// Fail-closed: keep loopback defaults but surface a sane value.
		return bridgeConfigFromEnv({}).cfg;
	}
	return cfg;
}

/** Antigravity CLI adapter (detects `agy`; read-only detection, never dangerous). */
function bridgeAntigravityAdapter() {
	const known = process.env.PROJECT_OS_AGY_PATH;
	if (known) return new AntigravityCliAdapter(known);
	return new AntigravityCliAdapter(null);
}

const DEFAULT_PROJECTS_ROOT = "C:\\Users\\eiden\\Desktop\\dev\\projects";

export function registerProjectFactoryCommands(ctx: vscode.ExtensionContext, log: StructuredLogger): void {
	const cfg = vscode.workspace.getConfiguration("clineProjectOS");
	const projectsRoot = cfg.get<string>("projectsRoot", DEFAULT_PROJECTS_ROOT).trim() || DEFAULT_PROJECTS_ROOT;
	const controlPlaneRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? projectsRoot;
	const registryFile = vscode.Uri.joinPath(ctx.globalStorageUri, "managed-projects.json").fsPath;
	const registry = new ManagedProjectRegistry(registryFile);
	const factory = new ProjectFactory({ projectsRoot, controlPlaneRoot }, registry);
	const projectsTree = new ProjectsTreeProvider(registry);

	const slash = new SlashCommandRegistry();
	slash.register("goal", goalHandler);
	slash.register("create", createHandler);
	slash.register("addon", addonHandler);
	slash.register("autonomy", autonomyHandler);
	slash.register("todo", todoHandler);
	// product commands (adapt to SlashCommandContext)
	slash.register("docs", async (parsed) => docsHandler(parsed, { activeProject: resolveActiveProject() }));
	slash.register("project", async (parsed) => projectHandler(parsed, { activeProject: resolveActiveProject(), registry }));
	// MCP bridge (chatgpt-antigravity-bridge): additive /bridge subcommands.
	slash.register("bridge", async (parsed) => bridgeHandler(parsed, {
		registry: registry as never,
		config: bridgeRuntimeConfig(),
		antigravity: bridgeAntigravityAdapter(),
	}));

	const resolveActiveProject = (): ActiveProjectRef | null => {
		const active = cfg.get<string>("activeProjectSlug", "").trim();
		if (active) {
			const m = registry.get(active);
			if (m) return { slug: m.slug, projectId: m.projectId, workspaceRoot: m.workspaceRoot };
		}
		const list = registry.list();
		if (list.length) {
			const m = list[list.length - 1];
			return { slug: m.slug, projectId: m.projectId, workspaceRoot: m.workspaceRoot };
		}
		return null;
	};

	const slashCtx: SlashCommandContext = {
		factory,
		registry,
		resolveActiveProject,
		runtime: {
			modelId: cfg.get<string>("providerModelId", "qwen3-4b"),
			baseUrl: cfg.get<string>("providerBaseUrl", "").trim() || "http://127.0.0.1:8080/v1",
			apiKey: cfg.get<string>("providerApiKey", "") || "localai",
		},
	};

	const showResult = async (line: string): Promise<void> => {
		const r = await slash.dispatch(line, slashCtx);
		const out = [`${r.command} ${r.ok ? "OK" : "FAIL"} · ${r.status}`, r.message];
		if (r.warnings.length) out.push(`  warnings: ${r.warnings.join("; ")}`);
		if (r.actions.length) out.push(`  next: ${r.actions.join(", ")}`);
		if (r.artifacts.length) out.push(`  artifacts: ${r.artifacts.join(", ")}`);
		log.info(out.join("\n"));
		void vscode.window.showInformationMessage(out.join("\n"));
	};

	ctx.subscriptions.push(
		vscode.commands.registerCommand("clineProjectOS.goal", async (line?: string) => {
			const l = typeof line === "string" && line ? line : await vscode.window.showInputBox({ prompt: "Goal objective (e.g. Build a fast portable C++ IDE)" });
			if (!l) return;
			await showResult(`/goal ${l}`);
		}),
		vscode.commands.registerCommand("clineProjectOS.create", async (line?: string) => {
			const l = typeof line === "string" && line ? line : await vscode.window.showInputBox({ prompt: "Project name (e.g. demo)" });
			if (!l) return;
			await showResult(`/create ${l}`);
			projectsTree.refresh();
		}),
		vscode.commands.registerCommand("clineProjectOS.addon", async (sub?: string) => {
			const s = typeof sub === "string" && sub ? sub : await vscode.window.showQuickPick(["list", "recommended"], { placeHolder: "addon subcommand" });
			if (!s) return;
			await showResult(`/addon ${s}`);
		}),
		vscode.commands.registerCommand("clineProjectOS.autonomy", async (minutes?: string) => {
			const m = typeof minutes === "string" && minutes ? minutes : await vscode.window.showInputBox({ prompt: "Autonomy minutes (blank = auto by complexity)" });
			if (m === undefined) return;
			await showResult(`/autonomy${m ? ` --minutes=${m}` : ""}`);
		}),
		vscode.commands.registerCommand("clineProjectOS.slash", async (line: string) => {
			if (line) await showResult(line);
		}),
		vscode.window.registerTreeDataProvider("clineProjectOS.projects", projectsTree),
		vscode.commands.registerCommand("clineProjectOS.projects.refresh", () => projectsTree.refresh()),
		vscode.commands.registerCommand("clineProjectOS.project.status", async (slug: string) => {
			const m = registry.get(typeof slug === "string" ? slug : "");
			if (!m) {
				void vscode.window.showInformationMessage("Project not found.");
				return;
			}
			const lines = [
				`${m.name} (${m.slug})`,
				`Status: ${m.status}`,
				`Type: ${m.projectType}`,
				`Workspace: ${m.workspaceRoot}`,
				`Git: ${m.git.initialized ? "initialized" : "none"}`,
				`Addons: ${m.addons.join(", ")}`,
				`Goal: ${m.goal?.objective ?? "(none)"}`,
			];
			void vscode.window.showInformationMessage(lines.join("\n"));
		}),
	);
}
