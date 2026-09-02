import { test } from "node:test";
import assert from "node:assert/strict";
import { autonomyReliabilityScore, selectAutonomyModels, type ModelReliabilityObservation } from "../projects/AutonomyModelSelector.js";
import { resolveMirrorName, commandHasCollision } from "../projects/poNamespace.js";

test("autonomyReliabilityScore rewards non-empty + tool use, penalizes latent latency", () => {
	const good: ModelReliabilityObservation = { modelId: "m", nonEmptyOutputRate: 1, readToolRate: 1, searchToolRate: 0.9, completionRate: 1, toolResultConsumptionRate: 1, avgLatencyMs: 2000, stability: 1 };
	const bad: ModelReliabilityObservation = { modelId: "m2", nonEmptyOutputRate: 0, readToolRate: 0, searchToolRate: 0, completionRate: 0.2, toolResultConsumptionRate: 0, avgLatencyMs: 9000, stability: 0.2 };
	assert.ok(autonomyReliabilityScore(good).total > autonomyReliabilityScore(bad).total);
});

test("selectAutonomyModels picks empirically best winner + bounded fallbacks, excludes non-qualifying", () => {
	const obs: ModelReliabilityObservation[] = [
		{ modelId: "qwen3-4b", nonEmptyOutputRate: 0.3, readToolRate: 0.2, searchToolRate: 0.1, completionRate: 0.5, toolResultConsumptionRate: 0.2, avgLatencyMs: 5000, stability: 0.4 },
		{ modelId: "smollm3", nonEmptyOutputRate: 1, readToolRate: 1, searchToolRate: 1, completionRate: 1, toolResultConsumptionRate: 1, avgLatencyMs: 1500, stability: 1 },
		{ modelId: "granite332", nonEmptyOutputRate: 0.9, readToolRate: 1, searchToolRate: 0.9, completionRate: 0.9, toolResultConsumptionRate: 0.9, avgLatencyMs: 2200, stability: 0.9 },
	];
	const choice = selectAutonomyModels(obs);
	assert.equal(choice.winner, "smollm3");
	assert.ok(choice.fallbacks.length <= 2);
	assert.ok(!choice.ranked.includes("qwen3-4b"));
	assert.ok(choice.ranked[0] === "smollm3");
});

test("poNamespace mirrors colliding commands with /po-* and never overwrites native", () => {
	assert.equal(resolveMirrorName("/goal", ["/goal", "/create"]), "/po-goal");
	assert.equal(resolveMirrorName("/create", ["/goal"]), "/create");
	assert.equal(resolveMirrorName("/projects", []), "/projects");
	assert.equal(commandHasCollision("/goal", ["/goal"]), true);
	assert.equal(commandHasCollision("/goal", ["/status"]), false);
});
