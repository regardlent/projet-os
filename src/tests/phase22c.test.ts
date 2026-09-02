import test from "node:test";
import assert from "node:assert";
import { decideFailover, classifyFailoverRun, type CandidateModel } from "../projects/EnduranceFailover.js";
import { aggregateBenchmark, throughput, type BenchmarkRun } from "../projects/GpuBenchmark.js";

const validFallback: CandidateModel = { alias: "granite-4.0-micro-flash", flashReady: true, gpuOffloadProven: true, provenCapabilities: ["CODING", "TOOLS", "GENERAL"] };

// ---- failover decisions ----
test("failover: healthy primary -> PRIMARY_HEALTHY, no finding", () => {
	const d = decideFailover(false, null, "CODING");
	assert.equal(d.outcome, "PRIMARY_HEALTHY");
	assert.equal(d.finding, false);
	assert.equal(d.allowed, true);
});

test("failover: no fallback -> FALLBACK_UNAVAILABLE + finding", () => {
	const d = decideFailover(true, null, "CODING");
	assert.equal(d.outcome, "FALLBACK_UNAVAILABLE");
	assert.equal(d.finding, true);
	assert.equal(d.allowed, false);
});

test("failover: fallback must be FLASH_READY, GPU-offload-proven and capability-proven", () => {
	assert.equal(decideFailover(true, { ...validFallback, flashReady: false }, "CODING").outcome, "FALLBACK_REFUSED");
	assert.equal(decideFailover(true, { ...validFallback, gpuOffloadProven: false }, "CODING").outcome, "FALLBACK_REFUSED");
	assert.equal(decideFailover(true, { ...validFallback, provenCapabilities: ["JSON"] }, "CODING").reason, "FALLBACK_CAPABILITY_NOT_PROVEN");
	assert.equal(decideFailover(true, validFallback, "CODING").outcome, "FALLBACK_SELECTED");
	assert.equal(decideFailover(true, validFallback, "CODING").finding, true);
});

// ---- classification ----
test("strict clean endurance: primary failure FAILS the rung regardless of fallback", () => {
	const d = decideFailover(true, validFallback, "CODING");
	const c = classifyFailoverRun("CLEAN_ENDURANCE", d);
	assert.equal(c.rungResult, "FAIL");
	assert.equal(c.classification, "PRIMARY_FAILURE_FAILED_RUNG");
});

test("dedicated failover test: valid GPU fallback that continues yields FAILOVER_TEST_PASS (separate from clean)", () => {
	const d = decideFailover(true, validFallback, "CODING");
	const c = classifyFailoverRun("GPU_MODEL_FAILOVER_TEST", d);
	assert.equal(c.rungResult, "PASS");
	assert.match(c.classification, /FAILOVER_TEST_PASS/);
	assert.equal(c.finding, true);
});

test("dedicated failover test: invalid fallback -> FAIL", () => {
	const d = decideFailover(true, { ...validFallback, gpuOffloadProven: false }, "CODING");
	assert.equal(classifyFailoverRun("GPU_MODEL_FAILOVER_TEST", d).rungResult, "FAIL");
});

// ---- benchmark ----
function run(over: Partial<BenchmarkRun> = {}): BenchmarkRun {
	return { firstTokenMs: 500, tokens: 200, durationMs: 2000, vramPeakMiB: 3000, correct: true, ...over };
}

test("benchmark: throughput = tokens/duration in tokens/sec", () => {
	assert.equal(throughput(run({ tokens: 200, durationMs: 2000 })), 100);
	assert.equal(throughput(run({ durationMs: 0 })), null);
});

test("benchmark: PASS with >=3 measured, correct, stable", () => {
	const res = aggregateBenchmark("granite-4.2-3b-flash", run(), [run(), run({ tokens: 198, durationMs: 1980 }), run({ tokens: 202, durationMs: 2050 })]);
	assert.equal(res.passes, true);
	assert.ok(res.vramPeakMiB === 3000);
	assert.ok((res.tokensPerSec ?? 0) > 0);
});

test("benchmark: insufficient measured runs -> not pass", () => {
	const res = aggregateBenchmark("m", null, [run(), run()]);
	assert.equal(res.passes, false);
	assert.ok(res.reasons.includes("NOT_ENOUGH_MEASURED_RUNS"));
});

test("benchmark: an incorrect run -> not pass", () => {
	const res = aggregateBenchmark("m", null, [run(), run(), run({ correct: false })]);
	assert.equal(res.passes, false);
	assert.ok(res.reasons.includes("INCORRECT_RUN"));
	assert.ok(res.correctness < 1);
});

test("benchmark: unstable throughput -> not pass", () => {
	const res = aggregateBenchmark("m", null, [run({ tokens: 100, durationMs: 2000 }), run({ tokens: 200, durationMs: 2000 }), run({ tokens: 10, durationMs: 2000 })]);
	assert.equal(res.passes, false);
	assert.ok(res.reasons.includes("UNSTABLE"));
});
