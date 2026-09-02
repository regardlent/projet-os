import test from "node:test";
import assert from "node:assert";
import { reportUsage, sumTokens, sumCost, throughputOf } from "../tokens/UsageReport.js";
import type { UsageObservation } from "../tokens/UsageObservation.js";

function obs(over: Partial<UsageObservation> = {}): UsageObservation {
	return {
		observationId: "o", projectId: "demo", workspaceId: "w", workspacePath: "p",
		providerId: "openai-compatible", modelId: "granite-4.2-3b-flash", inputTokens: 100, outputTokens: 50,
		totalTokens: 150, cacheReadTokens: 0, cacheWriteTokens: 0, source: "LOCALAI_REQUEST_USAGE",
		quality: "EXACT", scope: "PROJECT_OS", timestamp: Date.now(), ...over,
	};
}

test("sumTokens totals input/output/total", () => {
	const t = sumTokens([obs({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }), obs({ inputTokens: 200, outputTokens: 300, totalTokens: 500 })]);
	assert.deepEqual(t, { input: 300, output: 350, total: 650 });
});

test("sumCost: LocalAI EXACT_ZERO counts as free, never fake pricing", () => {
	const c = sumCost([
		{ costId: "c1", projectId: "demo", workspaceId: "w", providerId: "openai-compatible", modelId: "granite-4.2-3b-flash", billingClass: "LOCAL_FREE", coveredBySubscription: false, source: "LOCALAI", quality: "EXACT_ZERO", timestamp: 1 },
		{ costId: "c2", projectId: "demo", workspaceId: "w", providerId: "openai-compatible", modelId: "gpt-x", billingClass: "PAY_AS_YOU_GO", actualCost: 1.25, coveredBySubscription: false, source: "SDK_BILLED", quality: "EXACT_BILLED", timestamp: 1 },
	]);
	assert.equal(c.free, 1);
	assert.equal(c.paygActual, 1.25);
	assert.equal(c.paygEstimated, 0);
});

test("throughputOf computes mean TTFT, tps, correctness, stability", () => {
	const th = throughputOf([
		{ firstTokenMs: 339, tokens: 24, durationMs: 339, vramPeakMiB: 7427, correct: true },
		{ firstTokenMs: 336, tokens: 24, durationMs: 336, vramPeakMiB: 7427, correct: true },
		{ firstTokenMs: 342, tokens: 24, durationMs: 342, vramPeakMiB: 7427, correct: true },
	]);
	assert.equal(th.runsMeasured, 3);
	assert.equal(th.correctness, 1);
	assert.ok(Math.abs((th.ttftMs ?? 0) - 339) < 1.5);
	assert.ok((th.tokensPerSec ?? 0) > 0);
	assert.ok((th.stability ?? 0) > 0.9);
	assert.equal(th.vramPeakMiB, 7427);
});

test("reportUsage consolidates job totals", () => {
	const rep = reportUsage({ jobId: "run-5min", projectId: "demo", runId: "project-os-endurance-1", tokenObservations: [obs(), obs({ inputTokens: 400, outputTokens: 200, totalTokens: 600 })], costObservations: [{ costId: "c", projectId: "demo", workspaceId: "w", providerId: "openai-compatible", modelId: "granite-4.2-3b-flash", billingClass: "LOCAL_FREE", coveredBySubscription: false, source: "LOCALAI", quality: "EXACT_ZERO", timestamp: 1 }], measuredRuns: [{ firstTokenMs: 339, tokens: 24, durationMs: 339, correct: true }] });
	assert.equal(rep.tokens.total, 750);
	assert.equal(rep.jobId, "run-5min");
	assert.equal(rep.cost.free, 1);
	assert.equal(rep.throughput.runsMeasured, 1);
	assert.equal(rep.observationCount, 2);
});
