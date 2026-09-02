/**
 * Command registration for Cline Project OS.
 */
import * as vscode from "vscode";
import type { ArtifactRegistry } from "../artifacts/ArtifactRegistry.js";
import type { ArtifactType } from "../artifacts/Artifact.js";
import type { ClineRuntimeAdapter } from "../cline/ClineRuntimeAdapter.js";
import type { ArtifactsTreeProvider } from "../views/ArtifactsTreeProvider.js";
import type { ControlCenterProvider } from "../views/ControlCenterProvider.js";
import type { ProjectDNA } from "../project/ProjectDNA.js";
import type { StructuredLogger } from "../observability/OutputChannel.js";
import { runProviderPreflight, type ProviderProfile } from "../runtime/ProviderPreflight.js";
import {
	classifyWorkspaceRoots,
	isCanonicalRoot,
	type WorkspaceKind,
} from "../workspace/WorkspaceTopology.js";
import { isOperationAllowed } from "../workspace/WorkspaceTrustGuard.js";
import {
	validateWorkspace,
	isIdeRestartAllowed,
} from "../workspace/AntigravityIDERestartGuard.js";
import type { TokenLedger } from "../tokens/TokenLedger.js";
import type { WorkspaceRegistry } from "../tokens/WorkspaceRegistry.js";
import { formatTokens } from "../tokens/numberFormat.js";
import { importHistoricalSessions } from "../tokens/HistoricalUsageImporter.js";
import type { ProjectBudgetGovernor, RoutingPolicy } from "../budget/BudgetGovernor.js";
import type { CostLedger } from "../budget/CostLedger.js";
import type { ModelPerformanceRegistry } from "../routing/ModelPerformanceRegistry.js";
import type { ModelCandidate } from "../routing/ModelCandidate.js";
import { route } from "../routing/IntelligentModelRouter.js";
import { type TaskClass } from "../routing/TaskClassifier.js";

export interface RoutingDeps {
	governor: ProjectBudgetGovernor;
	perf: ModelPerformanceRegistry;
	costLedger: CostLedger;
	buildCatalog: () => ModelCandidate[];
}

export interface CommandDeps {
	registry: ArtifactRegistry;
	adapter: ClineRuntimeAdapter;
	tree: ArtifactsTreeProvider;
	controlCenter: ControlCenterProvider;
	getDna: () => ProjectDNA;
	updateStatusBar: () => void;
	log: StructuredLogger;
	tokenLedger: TokenLedger;
	workspaceRegistry: WorkspaceRegistry;
	updateTokenStatus: () => void;
	routing: RoutingDeps;
}

const ARTIFACT_TYPES: readonly ArtifactType[] = [
	"implementation_plan",
	"change_contract",
	"project_dna",
	"architecture",
	"dependency_graph",
	"code_diff",
	"changed_files",
	"markdown",
	"documentation",
	"test_report",
	"bug_report",
	"benchmark",
	"build_report",
	"qa_report",
	"security_report",
	"performance_report",
	"release_report",
	"checkpoint",
	"ADR",
];

export function registerCommands(ctx: vscode.ExtensionContext, deps: CommandDeps): void {
	const { registry, adapter, controlCenter, getDna, updateStatusBar, log, tokenLedger, workspaceRegistry, updateTokenStatus, routing } = deps;

	ctx.subscriptions.push(
		vscode.commands.registerCommand("clineProjectOS.controlcenter.open", () => controlCenter.show()),
		vscode.commands.registerCommand("clineProjectOS.artifact.create", async () => {
			const type = (await vscode.window.showQuickPick([...ARTIFACT_TYPES], {
				placeHolder: "Artifact type",
			})) as ArtifactType | undefined;
			if (!type) return;
			const title = await vscode.window.showInputBox({ prompt: "Artifact title", value: "New artifact" });
			if (!title) return;
			const content = await vscode.window.showInputBox({ prompt: "Content (markdown)", value: "# " + title + "\n" });
			if (content === undefined) return;
			const rec = registry.create({ type, title, content });
			updateStatusBar();
			void openArtifact(registry, rec.id);
		}),
		vscode.commands.registerCommand("clineProjectOS.artifact.open", (id?: unknown) =>
			openArtifact(registry, typeof id === "string" ? id : undefined),
		),
		vscode.commands.registerCommand("clineProjectOS.artifact.search", async () => {
			const rec = await pickArtifact(registry);
			if (rec) void openArtifact(registry, rec.id);
		}),
		vscode.commands.registerCommand("clineProjectOS.agent.start", async () => {
			const prompt = await vscode.window.showInputBox({ prompt: "Mission for the agent" });
			if (!prompt) return;
			const cfg = vscode.workspace.getConfiguration("clineProjectOS");
			const providerId = cfg.get<string>("providerType", "openai-compatible");
			const modelId = cfg.get<string>("providerModelId", "qwen3-4b");
			const enableTools = cfg.get<boolean>("enableTools", true);
			try {
				await ensureAdapterCreated(adapter);
				const session = await adapter.startSession({
					prompt,
					providerId,
					modelId,
					enableTools,
					baseUrl: cfg.get<string>("providerBaseUrl", "").trim() || undefined,
					cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
				});
				registry.create({
					type: "implementation_plan",
					title: prompt.slice(0, 60),
					content: `# Plan\n\n${prompt}\n\n- agent: \`${session.sessionId}\`\n- model: \`${providerId}/${modelId}\`\n`,
					agentId: session.sessionId,
					sessionId: session.sessionId,
				});
				updateStatusBar();
				void vscode.window.showInformationMessage(`Agent started: ${session.sessionId}`);
			} catch (err) {
				void vscode.window.showErrorMessage(`Agent failed to start: ${errorMessage(err)}`);
			}
		}),
		vscode.commands.registerCommand("clineProjectOS.agent.abort", async () => {
			const sessions = adapter.getSessions();
			if (sessions.length === 0) {
				void vscode.window.showInformationMessage("No active agent sessions.");
				return;
			}
			const pick = await vscode.window.showQuickPick(
				sessions.map((s) => ({
					label: s.sessionId,
					description: `${s.providerId}/${s.modelId} — ${s.status}`,
					id: s.sessionId,
				})),
				{ placeHolder: "Agent session to abort" },
			);
			if (!pick) return;
			await adapter.abort(pick.id);
			updateStatusBar();
			void vscode.window.showInformationMessage(`Aborted ${pick.id}`);
		}),
		vscode.commands.registerCommand("clineProjectOS.project.scan", async () => {
			const dna = scanInWorkspace(getDna);
			void vscode.window.showInformationMessage(
				`Project DNA: ${dna.totalFiles} files, ${Object.keys(dna.languages).length} languages, ${dna.packageManagers.join(", ") || "no pkg mgr"}.`,
			);
		}),
		vscode.commands.registerCommand("clineProjectOS.workspace.report", async () => {
			const fsPaths = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
			const kind: WorkspaceKind = classifyWorkspaceRoots(fsPaths);
			const canonical = fsPaths.some((p) => isCanonicalRoot(p));
			const trusted = vscode.workspace.isTrusted;
			const canWrite = isOperationAllowed(trusted, "write");
			log.info(`Workspace topology=${kind} roots=${fsPaths.length} canonical=${canonical} trusted=${trusted}`);
			void vscode.window.showInformationMessage(
				`Workspace: ${kind} · roots=${fsPaths.length} · canonical=${canonical} · trusted=${trusted} · write=${canWrite ? "allowed" : "blocked"}`,
			);
		}),
		vscode.commands.registerCommand("clineProjectOS.provider.preflight", async () => {
			const profile = readProviderProfile();
			const result = await runProviderPreflight(profile);
			log.info(`Provider preflight: ${result.health} — ${result.summary}`);
			if (result.health === "UNAVAILABLE" || result.health === "MISCONFIGURED") {
				void vscode.window.showWarningMessage(`Provider preflight: ${result.health}. ${result.summary}`);
			} else {
				void vscode.window.showInformationMessage(
					`Provider preflight: ${result.health}. ${result.summary} (toolCalling: ${result.compatibility.toolCalling ? "validated" : "not validated"})`,
				);
			}
		}),
		vscode.commands.registerCommand("clineProjectOS.tokens.open", () => {
			void vscode.window.showInformationMessage(buildTokenSummary(tokenLedger), { modal: true });
		}),
		vscode.commands.registerCommand("clineProjectOS.tokens.refresh", async () => {
			try {
				await ensureAdapterCreated(adapter);
				const sessions = await adapter.list(50);
				const hist = sessions.map((s) => ({
					sessionId:
						typeof s === "object" && s && "sessionId" in s
							? (s as { sessionId: string }).sessionId
							: String(s),
					cwd: sessionCwd(s),
					providerId: "openai-compatible",
					modelId: "qwen3-4b",
					startedAt: sessionStartedAt(s),
					hasExactUsage: false,
				}));
				const { observations } = importHistoricalSessions(
					workspaceRegistry,
					"legacy-project-os",
					hist,
				);
				for (const o of observations) tokenLedger.record(o);
				updateTokenStatus();
				void vscode.window.showInformationMessage(`Token ledger: ${observations.length} historical session(s) recorded (usage UNKNOWN — SDK usage gap).`);
			} catch (err) {
				void vscode.window.showErrorMessage(`Token refresh failed: ${errorMessage(err)}`);
			}
		}),
		vscode.commands.registerCommand("clineProjectOS.tokens.export", async () => {
			const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!root) return;
			const dir = vscode.Uri.joinPath(vscode.Uri.file(root), ".cline-control-center", "usage");
			await vscode.workspace.fs.createDirectory(dir);
			const jsonPath = vscode.Uri.joinPath(dir, "export.json");
			const mdPath = vscode.Uri.joinPath(dir, "export.md");
			await vscode.workspace.fs.writeFile(
				jsonPath,
				Buffer.from(JSON.stringify(tokenLedger.entries(), null, 2), "utf8"),
			);
			await vscode.workspace.fs.writeFile(
				mdPath,
				Buffer.from(buildTokenSummary(tokenLedger), "utf8"),
			);
			void vscode.window.showInformationMessage(`Token report exported to ${dir.path}`);
		}),
		vscode.commands.registerCommand("clineProjectOS.mode.route", async () => {
			const classes: TaskClass[] = ["MICRO_EDIT", "DOCUMENTATION", "UNIT_TEST", "SMALL_BUG", "SMALL_FEATURE", "MEDIUM_FEATURE", "REFACTOR", "ARCHITECTURE"];
			const pick = (await vscode.window.showQuickPick(classes, { placeHolder: "Task class to route" })) as TaskClass | undefined;
			if (!pick) return;
			const policy = vscode.workspace.getConfiguration("clineProjectOS").get<RoutingPolicy>("routingPolicy", "FREE_UNTIL_EXHAUSTED");
			const decision = route({
				taskClass: pick,
				candidates: routing.buildCatalog(),
				governor: routing.governor,
				policy,
				performance: routing.perf,
			});
			void vscode.window.showInformationMessage(buildRouteSummary(decision, policy, routing.governor), { modal: true });
		}),
		vscode.commands.registerCommand("clineProjectOS.budget.status", () => {
			const g = routing.governor;
			const status = g.status();
			void vscode.window.showInformationMessage(
				[
					"AI BUDGET — Cline Project OS",
					`Daily: ${g.dailyBudgetCurrency} ${g.dailyBudget.toFixed(2)}`,
					`Actual paid: ${g.spent().toFixed(2)}`,
					`Reserved: ${g.reservedTotal().toFixed(2)}`,
					`Remaining: ${g.remaining().toFixed(2)}`,
					`Status: ${status}`,
				].join("\n"),
				{ modal: true },
			);
		}),
		vscode.commands.registerCommand("clineProjectOS.antigravity.verifyWorkspace", () => {
			const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const v = validateWorkspace(root);
			const allowed = isIdeRestartAllowed("ANTIGRAVITY_IDE", root);
			void vscode.window.showInformationMessage(
				`Antigravity IDE workspace: ${v}${v === "CANONICAL" ? " (canonical)" : ""}\nIDE restart allowed: ${allowed}\nWindows will NEVER be restarted by this gate.`,
				{ modal: true },
			);
		}),
	);
}

function buildRouteSummary(
	decision: import("../routing/IntelligentModelRouter.js").ModelSelectionDecision,
	policy: RoutingPolicy,
	g: ProjectBudgetGovernor,
): string {
	const lines: string[] = [];
	lines.push(`ROUTE (${decision.taskClass}) — policy ${policy}`);
	if (decision.selected) {
		const s = decision.selected;
		lines.push(`SELECTED: ${s.displayName} (${s.billingClass})`);
		lines.push(`Provider: ${s.providerId}`);
		lines.push("Why:");
		for (const r of decision.reasons) lines.push(`  ✓ ${r}`);
		if (decision.budgetEffect !== undefined) lines.push(`  est cost ${g.dailyBudgetCurrency} ${decision.budgetEffect.toFixed(2)}`);
	} else {
		lines.push("SELECTED: none (AI_CAPACITY_EXHAUSTED / budget)");
	}
	if (decision.alternatives.length) {
		lines.push("Alternatives considered:");
		for (const a of decision.alternatives.slice(0, 6)) lines.push(`  • ${a.modelId}: ${a.reason}`);
	}
	lines.push(`Budget remaining: ${g.dailyBudgetCurrency} ${g.remaining().toFixed(2)}`);
	return lines.join("\n");
}

/** Build a compact, honest token summary for display/export. */
function buildTokenSummary(ledger: TokenLedger): string {
	const all = ledger.totals();
	const byAgent = ledger.byAgent();
	const agentNames = Object.keys(byAgent).map((a) => `  ${a}: ${formatTokens(byAgent[a].total)}`);
	const quality = ledger.qualityCounts();
	const sessions = Object.keys(ledger.bySession()).length;
	const raw = ledger.rawProbeTotals();
	return [
		"TOKEN INTELLIGENCE — Cline Project OS",
		"",
		`Project lifetime (known)   ${formatTokens(all.total)}`,
		`  input            ${formatTokens(all.input)}`,
		`  output           ${formatTokens(all.output)}`,
		`Session count     ${sessions}`,
		`Raw probes (excluded)  ${formatTokens(raw.total)}`,
		"",
		"Quality",
		`  EXACT      ${quality.EXACT ?? 0}`,
		`  DERIVED    ${quality.DERIVED ?? 0}`,
		`  ESTIMATED  ${quality.ESTIMATED ?? 0}`,
		`  UNKNOWN    ${quality.UNKNOWN ?? 0}`,
		"",
		"Per agent",
		...(agentNames.length ? agentNames : ["  (none)"]),
		"",
		"Note: LocalAI stream reports usage=0 (SDK usage gap) → most sessions are UNKNOWN.",
	].join("\n");
}

function sessionCwd(session: unknown): string | undefined {
	if (typeof session === "object" && session && "cwd" in session) {
		const cwd = (session as { cwd?: unknown }).cwd;
		if (typeof cwd === "string") return cwd;
	}
	if (typeof session === "object" && session && "manifest" in session) {
		const m = (session as { manifest?: { cwd?: unknown } }).manifest;
		if (m && typeof m.cwd === "string") return m.cwd;
	}
	return undefined;
}

function sessionStartedAt(session: unknown): number | undefined {
	if (typeof session === "object" && session && "createdAt" in session) {
		const v = (session as { createdAt?: unknown }).createdAt;
		if (typeof v === "number") return v;
		if (typeof v === "string") {
			const d = Date.parse(v);
			if (!Number.isNaN(d)) return d;
		}
	}
	return undefined;
}

function readProviderProfile(): ProviderProfile {
	const cfg = vscode.workspace.getConfiguration("clineProjectOS");
	const baseUrl = cfg.get<string>("providerBaseUrl", "").trim();
	const modelId = cfg.get<string>("providerModelId", "qwen3-4b");
	const type = cfg.get<string>("providerType", "openai-compatible");
	return {
		type,
		providerId: type,
		modelId,
		baseUrl,
		hasCredential: hasProviderCredential(),
	};
}

function hasProviderCredential(): boolean {
	const env = process.env;
	return Boolean(
		env.OPENAI_API_KEY ||
			env.ANTHROPIC_API_KEY ||
			env.AZURE_OPENAI_API_KEY ||
			env.LOCALAI_API_KEY ||
			env.X_API_KEY,
	);
}

function scanInWorkspace(getDna: () => ProjectDNA): ProjectDNA {
	return getDna();
}

async function ensureAdapterCreated(adapter: ClineRuntimeAdapter): Promise<void> {
	// ClineRuntimeAdapter.create() is idempotent-safe via a flag inside the class.
	await adapter.create();
}

async function pickArtifact(registry: ArtifactRegistry) {
	const arts = registry.list();
	if (arts.length === 0) {
		void vscode.window.showInformationMessage("No artifacts yet.");
		return undefined;
	}
	const pick = await vscode.window.showQuickPick(
		arts.map((a) => ({
			label: a.title,
			description: `${a.type} · ${a.status} · v${a.version}`,
			id: a.id,
		})),
		{ placeHolder: "Select an artifact" },
	);
	return pick ? registry.get(pick.id) : undefined;
}

async function openArtifact(registry: ArtifactRegistry, id?: string): Promise<void> {
	const target = id ? registry.get(id) : await pickArtifact(registry);
	if (!target) return;
	const content = registry.readContent(target);
	const doc = await vscode.workspace.openTextDocument({ content, language: "markdown" });
	await vscode.window.showTextDocument(doc, {
		preview: false,
		viewColumn: vscode.ViewColumn.One,
	});
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
