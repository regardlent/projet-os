/**
 * WorkspaceTopology (W23)
 *
 * Classifies the current workspace layout from the set of workspace root URIs.
 * Pure module: no `vscode` import (roots are passed as strings).
 */

export type WorkspaceKind = "SINGLE_ROOT" | "MULTI_ROOT" | "EMPTY";

export function classifyWorkspaceRoots(roots: readonly string[]): WorkspaceKind {
	const real = roots.filter((r) => typeof r === "string" && r.length > 0);
	if (real.length === 0) return "EMPTY";
	return real.length === 1 ? "SINGLE_ROOT" : "MULTI_ROOT";
}

/** Canonical Project OS development root (expected during this phase). */
export const CANONICAL_PROJECT_ROOT = "C:\\Users\\eiden\\Desktop\\dev\\projet-os";

/**
 * Report whether a given workspace root is the canonical development root.
 * Used to detect stale workspaces without hardcoding the string everywhere.
 */
export function isCanonicalRoot(fsPath: string): boolean {
	const normalized = fsPath.replace(/[\\/]+$/, "").toLowerCase();
	return normalized === CANONICAL_PROJECT_ROOT.toLowerCase();
}
