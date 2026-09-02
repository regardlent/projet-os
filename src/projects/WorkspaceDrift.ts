/**
 * WorkspaceDrift (Phase 24, W15). Detects what changed since a known good state across
 * facets: file index, dependencies, goal, todo, addons, dna. Pure + testable. Reports
 * ACTUAL differences; it never guesses a re-scan that did not happen (timestamps are
 * compared, not assumed). Never auto-repairs.
 */
import type { ProjectDNA } from "../project/ProjectDNA.js";
import type { GoalProof } from "./GoalProofEngine.js";

export interface FileHashIndex {
	path: string;
	sha256: string;
	size: number;
}

export interface FacetSnapshot {
	label: string;
	filesHash: Record<string, string>;
	dependencies: string[];
	goal: { objective: string; proof: GoalProof } | null;
	todo: { done: number; total: number } | null;
	addons: string[];
	dna: Omit<ProjectDNA, "scannedAt"> | null;
	takenAt: number;
}

export type DriftKind = "FILE_ADDED" | "FILE_REMOVED" | "FILE_MODIFIED" | "DEPENDENCY_CHANGED" | "GOAL_CHANGED" | "TODO_CHANGED" | "ADDON_CHANGED" | "DNA_CHANGED";

export interface DriftItem {
	kind: DriftKind;
	facet: string;
	detail: string;
}

export interface DriftReport {
	drifts: DriftItem[];
	count: number;
	unchanged: boolean;
}

/** Compare two snapshots and enumerate every observed drift. */
export function compareSnapshots(before: FacetSnapshot, after: FacetSnapshot): DriftReport {
	const drifts: DriftItem[] = [];

	// Files
	const allFiles = new Set([...Object.keys(before.filesHash), ...Object.keys(after.filesHash)]);
	for (const f of allFiles) {
		if (!(f in after.filesHash)) drifts.push({ kind: "FILE_REMOVED", facet: "files", detail: f });
		else if (!(f in before.filesHash)) drifts.push({ kind: "FILE_ADDED", facet: "files", detail: f });
		else if (before.filesHash[f] !== after.filesHash[f]) drifts.push({ kind: "FILE_MODIFIED", facet: "files", detail: f });
	}

	// Dependencies
	const depsBefore = new Set(before.dependencies);
	const depsAfter = new Set(after.dependencies);
	for (const d of after.dependencies) if (!depsBefore.has(d)) drifts.push({ kind: "DEPENDENCY_CHANGED", facet: "dependencies", detail: `+ ${d}` });
	for (const d of before.dependencies) if (!depsAfter.has(d)) drifts.push({ kind: "DEPENDENCY_CHANGED", facet: "dependencies", detail: `- ${d}` });

	// Goal
	if (before.goal?.objective !== after.goal?.objective) drifts.push({ kind: "GOAL_CHANGED", facet: "goal", detail: "objective changed" });
	else if (before.goal?.proof.goalReached !== after.goal?.proof.goalReached) drifts.push({ kind: "GOAL_CHANGED", facet: "goal", detail: "completion state changed" });

	// Todo
	if (JSON.stringify(before.todo) !== JSON.stringify(after.todo)) drifts.push({ kind: "TODO_CHANGED", facet: "todo", detail: "todo progress changed" });

	// Addons
	const addBefore = [...before.addons].sort().join(",");
	const addAfter = [...after.addons].sort().join(",");
	if (addBefore !== addAfter) drifts.push({ kind: "ADDON_CHANGED", facet: "addons", detail: "addon set changed" });

	// DNA
	if (JSON.stringify(before.dna) !== JSON.stringify(after.dna)) drifts.push({ kind: "DNA_CHANGED", facet: "dna", detail: "project DNA changed" });

	return { drifts, count: drifts.length, unchanged: drifts.length === 0 };
}
