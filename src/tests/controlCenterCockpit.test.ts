import test from "node:test";
import assert from "node:assert/strict";
import { cockpitView } from "../projects/ControlCenterCockpit.js";

test("cockpit view summarizes real signals", () => {
	const view = cockpitView({
		activeProject: { slug: "sfl-observatory", status: "READY", projectType: "cpp" },
		goal: { objective: "Observe league", proof: { goalId: "g", criteria: [], allSatisfied: false, goalReached: false, unsatisfied: ["Show scorers"] } },
		todoProgress: { done: 3, total: 5 },
		localAiModels: ["qwen3-4b", "granite-4.2-3b-flash"],
		gpu: null,
		budget: { dailyPaidBudget: 2, actualPaidSpend: 0.5, mode: "AUTO_WITHIN_PROJECT_BUDGET" },
	});
	assert.equal(view.activeProject, "sfl-observatory (READY)");
	assert.equal(view.goalStatus, "IN_PROGRESS");
	assert.deepEqual(view.goalUnsatisfied, ["Show scorers"]);
	assert.equal(view.todoProgress, "3/5");
	assert.equal(view.localAiModelCount, 2);
	assert.equal(view.gpu, null);
	assert.equal(view.budget?.remaining, 1.5);
});

test("goal reached is reported only from evidence", () => {
	const view = cockpitView({
		activeProject: null,
		goal: { objective: "x", proof: { goalId: "g", criteria: [], allSatisfied: true, goalReached: true, unsatisfied: [] } },
		todoProgress: null,
		localAiModels: [],
		gpu: null,
		budget: null,
	});
	assert.equal(view.goalStatus, "GOAL_REACHED");
	assert.deepEqual(view.goalUnsatisfied, []);
	assert.equal(view.todoProgress, "n/a");
	assert.equal(view.budget, null);
});

test("gpu signal surfaces offload proof with quality", () => {
	const view = cockpitView({
		activeProject: null, goal: null, todoProgress: null, localAiModels: [],
		gpu: { offloadProof: false, evidenceQuality: "BLOCKED", freeVramAfterMiB: 422, timestamp: 0, gpuName: "RTX 5060", driver: "616", totalVramMiB: 8151, freeVramBeforeMiB: 422, deltaVramMiB: 0, model: null, backend: null, smokeInference: false, reasons: ["INSUFFICIENT_FREE_VRAM"] },
		budget: null,
	});
	assert.equal(view.gpu?.offloadProof, false);
	assert.equal(view.gpu?.quality, "BLOCKED");
	assert.equal(view.gpu?.freeVramMiB, 422);
});
