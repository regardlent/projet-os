import test from "node:test";
import assert from "node:assert/strict";
import { compareSnapshots, type FacetSnapshot } from "../projects/WorkspaceDrift.js";

function snap(over: Partial<FacetSnapshot> = {}): FacetSnapshot {
	return {
		label: "s",
		filesHash: {},
		dependencies: [],
		goal: null,
		todo: null,
		addons: [],
		dna: null,
		takenAt: 0,
		...over,
	};
}

test("identical snapshots => no drift", () => {
	const s = snap({ filesHash: { "src/a.ts": "x" }, dependencies: ["lodash"] });
	const r = compareSnapshots(s, s);
	assert.equal(r.unchanged, true);
	assert.equal(r.count, 0);
});

test("detects file add/modify/remove", () => {
	const before = snap({ filesHash: { "a": "s1", "b": "s1" } });
	const after = snap({ filesHash: { "a": "s2", "c": "s1" } });
	const r = compareSnapshots(before, after);
	const kinds = r.drifts.map((d) => d.kind);
	assert.ok(kinds.includes("FILE_MODIFIED"));
	assert.ok(kinds.includes("FILE_ADDED"));
	assert.ok(kinds.includes("FILE_REMOVED"));
	assert.ok(r.drifts.some((d) => d.detail === "c"));
});

test("detects dependency and addon changes", () => {
	const before = snap({ dependencies: ["a"], addons: ["core"] });
	const after = snap({ dependencies: ["a", "b"], addons: ["core", "cpp"] });
	const r = compareSnapshots(before, after);
	assert.ok(r.drifts.some((d) => d.kind === "DEPENDENCY_CHANGED"));
	assert.ok(r.drifts.some((d) => d.kind === "ADDON_CHANGED"));
});

test("detects goal objective change and todo change", () => {
	const b = snap({ goal: { objective: "Build", proof: { goalId: "g", criteria: [], allSatisfied: false, goalReached: false, unsatisfied: [] } }, todo: { done: 1, total: 3 } });
	const a = snap({ goal: { objective: "Build better", proof: { goalId: "g", criteria: [], allSatisfied: false, goalReached: false, unsatisfied: [] } }, todo: { done: 2, total: 3 } });
	const r = compareSnapshots(b, a);
	assert.ok(r.drifts.some((d) => d.kind === "GOAL_CHANGED"));
	assert.ok(r.drifts.some((d) => d.kind === "TODO_CHANGED"));
});
