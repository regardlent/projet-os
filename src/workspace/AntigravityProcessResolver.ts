/**
 * AntigravityProcessResolver (Phase 15, W592-596).
 * Pure, testable resolution of the real Antigravity IDE top-level window from a
 * process snapshot + workspace evidence. NEVER treats N electron child
 * processes as N instances. No I/O here; callers supply the snapshot.
 */
export interface AntigravityProcessInfo {
	pid: number;
	ppid: number;
	exe: string;
	cmdline: string;
	windowHandle: number;
	windowTitle: string;
	startTime: number;
}

export type WorkspaceProof = "CANONICAL" | "OTHER" | "UNKNOWN";

export type ResolveConfidence = "PROVEN" | "STRONG" | "WEAK" | "AMBIGUOUS" | "NOT_FOUND";

export interface ProcessResolution {
	status: "SELECT" | "AMBIGUOUS" | "NOT_FOUND";
	confidence: ResolveConfidence;
	ambiguity: boolean;
	pid?: number;
	title?: string;
	topLevelCandidates: string[];
}

export interface ResolveOptions {
	/** The proven, exact Antigravity IDE executable path. */
	executablePath: string;
	/** Workspace proof for a PID (from storage.json / LSP / hook). */
	workspaceOf: (pid: number) => WorkspaceProof;
	/** Canonical workspace expected (for title evidence). */
	canonicalWorkspace: string;
}

const ELECTRON_TYPES = /--type=(renderer|gpu-process|utility|crashpad-handler)/;
const AGENT_EXTENSION = /language_server_windows_x64|eslintServer|jsonServerMain|main\.cjs/;

/** Is this process an Electron child (not a standalone IDE window)? */
export function isElectronChild(proc: AntigravityProcessInfo): boolean {
	return ELECTRON_TYPES.test(proc.cmdline) || AGENT_EXTENSION.test(proc.cmdline);
}

/** A true top-level IDE window: verified exe + a real window handle. */
export function isTopLevelIdeaCandidate(proc: AntigravityProcessInfo, exePath: string): boolean {
	return proc.exe.toLowerCase() === exePath.toLowerCase() && proc.windowHandle !== 0;
}

export function resolveTopLevelWindow(
	processes: readonly AntigravityProcessInfo[],
	opts: ResolveOptions,
): ProcessResolution {
	const candidates = processes.filter((p) => isTopLevelIdeaCandidate(p, opts.executablePath));
	const titles = candidates.map((c) => c.windowTitle).filter(Boolean);
	if (candidates.length === 0) {
		return { status: "NOT_FOUND", confidence: "NOT_FOUND", ambiguity: false, topLevelCandidates: [] };
	}
	if (candidates.length === 1) {
		const c = candidates[0];
		const ws = opts.workspaceOf(c.pid);
		const titleOk = c.windowTitle.toLowerCase().includes(opts.canonicalWorkspace.toLowerCase()) || c.windowTitle.toLowerCase().includes("projet-os");
		const confidence: ResolveConfidence = ws === "CANONICAL" || (titleOk && ws !== "OTHER") ? "PROVEN" : ws === "OTHER" ? "WEAK" : "STRONG";
		return { status: "SELECT", confidence, ambiguity: false, pid: c.pid, title: c.windowTitle, topLevelCandidates: titles };
	}
	// Multiple top-level windows: pick the one whose workspace is canonical if unique.
	const canonical = candidates.filter((c) => opts.workspaceOf(c.pid) === "CANONICAL");
	if (canonical.length === 1) {
		return { status: "SELECT", confidence: "PROVEN", ambiguity: false, pid: canonical[0].pid, title: canonical[0].windowTitle, topLevelCandidates: titles };
	}
	return { status: "AMBIGUOUS", confidence: "AMBIGUOUS", ambiguity: true, topLevelCandidates: titles };
}

/** Group a snapshot into process trees, keyed by the root (browser) PID. */
export function buildProcessTrees(processes: readonly AntigravityProcessInfo[], exePath: string): Map<number, AntigravityProcessInfo[]> {
	const byRoot = new Map<number, AntigravityProcessInfo[]>();
	for (const p of processes) {
		if (p.exe.toLowerCase() !== exePath.toLowerCase()) continue;
		// Root = an Antigravity process that is NOT an Electron child and whose
		// parent is not another Antigravity process.
		const parentIsAntigravity = processes.some((q) => q.pid === p.ppid && q.exe.toLowerCase() === exePath.toLowerCase());
		const isChild = isElectronChild(p) || parentIsAntigravity;
		let root = p.pid;
		if (isChild) {
			let parent = processes.find((q) => q.pid === p.ppid);
			while (parent && (parent.exe.toLowerCase() === exePath.toLowerCase() || ELECTRON_TYPES.test(parent.cmdline))) {
				root = parent.pid;
				if (parent.ppid === 0) break;
				parent = processes.find((q) => q.pid === parent!.ppid);
			}
		}
		if (!byRoot.has(root)) byRoot.set(root, []);
		byRoot.get(root)!.push(p);
	}
	return byRoot;
}
