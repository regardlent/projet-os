/**
 * Cline Project OS — extension entry point.
 */
import * as vscode from "vscode";
import { ArtifactStore } from "./artifacts/ArtifactStore.js";
import { ArtifactRegistry } from "./artifacts/ArtifactRegistry.js";
import { ClineRuntimeAdapter } from "./cline/ClineRuntimeAdapter.js";
import { ArtifactsTreeProvider } from "./views/ArtifactsTreeProvider.js";
import { ControlCenterProvider } from "./views/ControlCenterProvider.js";
import { scanProjectDNA, type ProjectDNA } from "./project/ProjectDNA.js";
import { registerCommands } from "./commands/index.js";
import { registerProjectFactoryCommands } from "./commands/projectFactoryCommands.js";
import { StructuredLogger } from "./observability/OutputChannel.js";
import { TokenLedger } from "./tokens/TokenLedger.js";
import { WorkspaceRegistry } from "./tokens/WorkspaceRegistry.js";
import { formatTokens } from "./tokens/numberFormat.js";
import { CostLedger } from "./budget/CostLedger.js";
import { ProjectBudgetGovernor } from "./budget/BudgetGovernor.js";
import { ModelPerformanceRegistry } from "./routing/ModelPerformanceRegistry.js";
import { buildCatalog, defaultLocalAICandidate } from "./routing/ModelCatalogService.js";

let adapter: ClineRuntimeAdapter;
let registry: ArtifactRegistry;
let tree: ArtifactsTreeProvider;
let controlCenter: ControlCenterProvider;
let statusBar: vscode.StatusBarItem;
let tokenLedger: TokenLedger;
let cachedDna: ProjectDNA | undefined;
let costLedger: CostLedger;
let budgetGovernor: ProjectBudgetGovernor;
let routingPerf: ModelPerformanceRegistry;

function getDna(): ProjectDNA {
	if (cachedDna) return cachedDna;
	const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!root) {
		cachedDna = { root: "", totalFiles: 0, languages: {}, hasPackageJson: false, hasLockfile: false, packageManagers: [], hasPython: false, hasPyproject: false, hasRequirements: false, hasNode: false, hasDockerfile: false, hasCompose: false, hasDevcontainer: false, hasCargo: false, hasGoMod: false, testFiles: 0, scannedAt: Date.now() };
		return cachedDna;
	}
	cachedDna = scanProjectDNA(root);
	return cachedDna;
}

function updateStatusBar(): void {
	if (!statusBar) return;
	const count = registry.count();
	statusBar.text = `$(robot) Cline Project OS · ${count} artifact${count === 1 ? "" : "s"}`;
	statusBar.tooltip = "Cline Project OS: artifact count";
	statusBar.show();
}

export function activate(context: vscode.ExtensionContext): void {
	const artifactDir = vscode.Uri.joinPath(context.globalStorageUri, "artifacts").fsPath;
	const store = new ArtifactStore(artifactDir);
	const loadResult = store.load();
	if (loadResult.error) {
		// Tolerate a corrupt index: registry starts empty, file is preserved.
		console.warn(`[Cline Project OS] Artifact index issue: ${loadResult.error}`);
	}
	registry = new ArtifactRegistry(store);

	adapter = new ClineRuntimeAdapter();
	tree = new ArtifactsTreeProvider(registry);
	controlCenter = new ControlCenterProvider(registry, adapter, getDna);

	statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
	updateStatusBar();

	const outputChannel = vscode.window.createOutputChannel("Cline Project OS");
	const log = new StructuredLogger((line) => outputChannel.appendLine(line));
	context.subscriptions.push(outputChannel);
	context.subscriptions.push({ dispose: () => outputChannel.dispose() });
	log.info("Cline Project OS activated.");

	// --- Token Intelligence (Phase 4) ---
	const tokenDir = vscode.Uri.joinPath(context.globalStorageUri, "tokens").fsPath;
	tokenLedger = new TokenLedger(tokenDir);
	const tokenLoad = tokenLedger.load();
	const workspaceRegistry = new WorkspaceRegistry();
	const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? context.globalStorageUri.fsPath;
	// Canonical project + historical path alias => SAME projectId.
	workspaceRegistry.ensureAlias("prob-reddit-project-os", "C:\\Users\\eiden\\Desktop\\dev\\prob-reddit\\project-os");
	workspaceRegistry.ensureAlias("prob-reddit-project-os", rootPath);
	if (tokenLoad.error) log.warn(`Token ledger load issue: ${tokenLoad.error}`);

	const tokenStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 49);
	const updateTokenStatus = (): void => {
		const mode = vscode.workspace.getConfiguration("clineProjectOS").get<string>("statusBarMode", "project");
		if (mode === "off") {
			tokenStatus.hide();
			return;
		}
		const project = tokenLedger.totals();
		const scope = mode === "session" ? "Session" : mode === "workspace" ? "Workspace" : "Project";
		tokenStatus.text = `$(pulse) ${formatTokens(project.total)} tok · ${scope}`;
		tokenStatus.tooltip = "Cline Project OS: open Token Intelligence";
		tokenStatus.command = "clineProjectOS.tokens.open";
		tokenStatus.show();
	};
	updateTokenStatus();
	context.subscriptions.push(tokenStatus);

	// --- Model Routing / Budget (Phase 5) ---
	costLedger = new CostLedger(vscode.Uri.joinPath(context.globalStorageUri, "cost").fsPath);
	costLedger.load();
	routingPerf = new ModelPerformanceRegistry();
	const rcfg = vscode.workspace.getConfiguration("clineProjectOS");
	budgetGovernor = new ProjectBudgetGovernor({
		projectId: "prob-reddit-project-os",
		dailyPaidBudget: rcfg.get<number>("dailyPaidBudget", 0),
		currency: rcfg.get<string>("budgetCurrency", "USD"),
		paidInferenceMode: rcfg.get<"OFF" | "ASK_EVERY_TIME" | "AUTO_WITHIN_PROJECT_BUDGET">("paidInferenceMode", "OFF"),
		getActualPaidSpend: () => costLedger.paygActual(),
	});

	const budgetStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 48);
	const updateBudgetStatus = (): void => {
		if (!budgetGovernor.canUsePaid()) {
			budgetStatus.text = "$(shield) Free-only";
			budgetStatus.tooltip = "Cline Project OS: AI budget — pay-as-you-go disabled";
		} else {
			const spend = costLedger.paygActual();
			budgetStatus.text = `$(credit-card) ${spend.toFixed(2)}/${rcfg.get<number>("dailyPaidBudget", 0).toFixed(2)}`;
			budgetStatus.tooltip = "Cline Project OS: project daily AI budget";
		}
		budgetStatus.command = "clineProjectOS.budget.status";
		budgetStatus.show();
	};
	updateBudgetStatus();
	context.subscriptions.push(budgetStatus);


	context.subscriptions.push(
		vscode.window.registerTreeDataProvider("clineProjectOS.artifacts", tree),
	);
	const unsubArtifacts = registry.onChange(() => {
		updateStatusBar();
		tree.refresh();
	});
	context.subscriptions.push({ dispose: () => unsubArtifacts() });
	context.subscriptions.push(
		vscode.Disposable.from({ dispose: () => void adapter.dispose() }),
	);

	registerCommands(context, {
		registry,
		adapter,
		tree,
		controlCenter,
		getDna,
		updateStatusBar,
		log,
		tokenLedger,
		workspaceRegistry,
		updateTokenStatus,
		routing: {
			governor: budgetGovernor,
			perf: routingPerf,
			costLedger,
			buildCatalog: () =>
				buildCatalog({
					localCandidates: rcfg.get<boolean>("allowLocalAI", true)
						? [defaultLocalAICandidate()]
						: [],
					clineFree: rcfg.get<boolean>("allowClineFree", true)
						? [{ id: "cline-free-placeholder" }]
						: [],
					clinePass: rcfg.get<boolean>("allowClinePass", true)
						? [{ id: "cline-pass-placeholder" }]
						: [],
					paygCandidates: [], // no fabricated PAYG catalog; only real candidates are used
				}),
		},
	});

	// Phase 13: Project Factory (managed child projects + slash commands).
	registerProjectFactoryCommands(context, log);

	// Phase 1: fast, non-blocking metadata (scanned lazily on demand).
	void getDna();
}

export async function deactivate(): Promise<void> {
	if (tokenLedger) tokenLedger.flush();
	if (adapter) {
		await adapter.dispose();
	}
}
