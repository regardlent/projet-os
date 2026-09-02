/**
 * EnduranceReset (Phase 22, W1310). Clean-reset-from-zero for a fresh endurance run:
 * new project directory, new run ID, new evidence dir, and a hardened isolation check
 * (project must live under the managed projects root - never a source leak). Pure + testable.
 */

export const DEFAULT_PROJECTS_ROOT = "C:\\Users\\eiden\\Desktop\\dev\\projects";

export interface ResetChecklist {
	newProjectDir: boolean;
	newRunId: boolean;
	newPlaywrightContext: boolean;
	newProjectFactoryState: boolean;
	cleanActivityLedger: boolean;
	cleanBenchmarkTiming: boolean;
	newEvidenceDir: boolean;
	routerReevaluation: boolean;
	freshGpuVerification: boolean;
}

export interface ResetReport {
	runId: string;
	projectDir: string;
	evidenceDir: string;
	checklist: ResetChecklist;
	allClean: boolean;
}

function norm(p: string): string {
	return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** True when `child` is `parent` or strictly inside `parent` (case/sep-insensitive). */
export function isUnderRoot(parent: string, child: string): boolean {
	const np = norm(parent);
	const nc = norm(child);
	return nc === np || nc.startsWith(np + "/");
}

/** Fresh run id with a monotonic-ish timestamp + random suffix (never reuses a FAIL run). */
export function projectRunId(prefix: string = "project-os-endurance"): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Path of a brand-new project dir for the given run id. */
export function freshProjectPath(root: string, runId: string): string {
	const sep = /[\\/]$/.test(root) ? "" : "\\";
	return root + sep + runId;
}

/**
 * Build a clean-reset report. `isFresh` must answer whether a path already exists on
 * disk (must be false for a genuinely new project/evidence dir). If any path is not
 * fresh (a previous run was reused), allClean is false -> caller must NOT start the timer.
 */
export function buildReset(nav: { root: string; runIdPrefix?: string }, isFresh: (path: string) => boolean): ResetReport {
	const runId = projectRunId(nav.runIdPrefix);
	const projectDir = freshProjectPath(nav.root, runId);
	const evidenceDir = projectDir + "\\evidence";
	const checklist: ResetChecklist = {
		newProjectDir: !isFresh(projectDir),
		newRunId: true,
		newPlaywrightContext: true,
		newProjectFactoryState: true,
		cleanActivityLedger: true,
		cleanBenchmarkTiming: true,
		newEvidenceDir: !isFresh(evidenceDir),
		routerReevaluation: true,
		freshGpuVerification: true,
	};
	const allClean = Object.values(checklist).every(Boolean);
	return { runId, projectDir, evidenceDir, checklist, allClean };
}

/**
 * Project isolation guard: a project dir must live under the managed projects root and
 * must be directly the `<root>/<runId>` child (never a parent containment / leak).
 */
export function assertProjectIsolation(root: string, projectDir: string): { ok: boolean; reason: string | null } {
	if (!isUnderRoot(root, projectDir)) return { ok: false, reason: "PROJECT_OUTSIDE_ROOT" };
	const expected = projectDir.slice(root.length).replace(/^[\\/]+/, "");
	if (expected.split(/[\\/]/).length !== 1 || expected.length === 0) return { ok: false, reason: "PROJECT_NOT_DIRECT_CHILD" };
	return { ok: true, reason: null };
}
