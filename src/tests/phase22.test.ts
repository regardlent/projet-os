import test from "node:test";
import assert from "node:assert";
import {
	RUNG_SEQUENCE,
	EnduranceLadder,
	evaluateLadderGate,
	createRunRecord,
	type LadderGate,
} from "../projects/EnduranceLadder.js";
import { createBugEntry, createGpuEntry } from "../projects/EnduranceLedger.js";

function passGate(overrides: Partial<LadderGate> = {}): LadderGate {
	return {
		gpuDetected: true,
		nvidiaRuntimeAvailable: true,
		localAiGpuBackendAvailable: true,
		freeVramMiB: 3000,
		neededVramMiB: 2000,
		modelEligible: true,
		securityPass: true,
		parameterPass: true,
		modelFlashReady: true,
		gpuOffloadProof: "PASS",
		runtimeAvailable: true,
		...overrides,
	};
}

// ---- gate evaluation ----
test("ladder gate: no GPU offload proof -> BLOCKED_GPU (timer must not start)", () => {
	const v = evaluateLadderGate(passGate({ gpuOffloadProof: "BLOCKED_GPU_INSUFFICIENT_VRAM", freeVramMiB: 118 }));
	assert.equal(v.canStart, false);
	assert.equal(v.category, "BLOCKED_GPU");
	assert.match(v.reason ?? "", /OFFLOAD/);
});

test("ladder gate: insufficient free VRAM -> BLOCKED_GPU / INSUFFICIENT_FREE_VRAM", () => {
	const v = evaluateLadderGate(passGate({ freeVramMiB: 118, neededVramMiB: 3000 }));
	assert.equal(v.canStart, false);
	assert.equal(v.category, "BLOCKED_GPU");
	assert.match(v.reason ?? "", /VRAM/);
});

test("ladder gate: all gates pass -> OK", () => {
	const v = evaluateLadderGate(passGate());
	assert.equal(v.canStart, true);
	assert.equal(v.category, "OK");
	assert.equal(v.reason, null);
});

test("ladder gate: security fail -> BLOCKED_SECURITY; parameter fail -> BLOCKED_PARAMETER; not flash-ready -> BLOCKED_NOT_FLASH_READY", () => {
	assert.equal(evaluateLadderGate(passGate({ securityPass: false })).category, "BLOCKED_SECURITY");
	assert.equal(evaluateLadderGate(passGate({ parameterPass: false })).category, "BLOCKED_PARAMETER");
	assert.equal(evaluateLadderGate(passGate({ modelFlashReady: false })).category, "BLOCKED_NOT_FLASH_READY");
});

// ---- ladder state machine ----
test("ladder: rungs are strictly sequential, no skip", () => {
	const l = new EnduranceLadder();
	assert.equal(l.nextRungMinutes(), 5);
	assert.equal(RUNG_SEQUENCE.join(","), "5,10,20,30,60");
});

test("ladder: PASS advances the rung; next rung increments", () => {
	const l = new EnduranceLadder();
	const started = l.startRun({ runId: "r5-1", rungMinutes: 5, projectId: "p5", modelAlias: "granite-4.2-3b-flash", gate: passGate() });
	assert.ok(started.ok);
	assert.equal(started.record?.attempt, 1);
	assert.equal(l.completeRun("r5-1", "PASS", [], ["timer", "gpu"]).advanced, true);
	assert.equal(l.nextRungMinutes(), 10);
});

test("ladder: FAIL does not advance and forces reset (same rung from 00:00)", () => {
	const l = new EnduranceLadder();
	const s1 = l.startRun({ runId: "r5-bad", rungMinutes: 5, projectId: "p5a", modelAlias: "granite-4.2-3b-flash", gate: passGate() });
	assert.ok(s1.ok);
	const done = l.completeRun("r5-bad", "FAIL", ["gpu-oom"]);
	assert.equal(done.advanced, false);
	assert.equal(done.record?.resetPerformed, true);
	assert.equal(l.nextRungMinutes(), 5); // still rung 5
	const s2 = l.startRun({ runId: "r5-good", rungMinutes: 5, projectId: "p5b", modelAlias: "granite-4.2-3b-flash", gate: passGate() });
	assert.ok(s2.ok);
	assert.equal(s2.record?.attempt, 2); // incremented attempt on same rung
});

test("ladder: blocked by GPU gate -> no record, BLOCKED_GPU verdict", () => {
	const l = new EnduranceLadder();
	const r = l.startRun({ runId: "r5-x", rungMinutes: 5, projectId: null, modelAlias: null, gate: passGate({ gpuOffloadProof: "BLOCKED_GPU_INSUFFICIENT_VRAM", freeVramMiB: 118 }) });
	assert.equal(r.ok, false);
	assert.equal(r.record, null);
	assert.equal(r.verdict.category, "BLOCKED_GPU");
	assert.equal(l.allRuns.length, 0);
});

test("ladder: resumes from a persisted strict-prefix snapshot (anti-skip)", () => {
	const l = new EnduranceLadder({}, [5, 10]);
	assert.equal(l.nextRungMinutes(), 20);
	// skip attempt: passing [5,20] must be truncated to just [5] (no skip allowed)
	const l2 = new EnduranceLadder({}, [5, 20]);
	assert.equal(l2.nextRungMinutes(), 10);
});

test("ladder: toSnapshot/round-trip preserves progress", () => {
	const l = new EnduranceLadder();
	l.startRun({ runId: "r5", rungMinutes: 5, projectId: "p", modelAlias: "m", gate: passGate() });
	l.completeRun("r5", "PASS", [], ["timer"]);
	const snap = l.toSnapshot();
	const l2 = new EnduranceLadder(snap.policy, snap.completed);
	assert.equal(l2.nextRungMinutes(), 10);
	assert.equal(l2.completedRungs[0], 5);
});


test("ladder: CPU fallback is forbidden by policy", () => {
	const l = new EnduranceLadder({ allowCpuFallback: true });
	assert.equal(l.evaluateGate(passGate()).category, "BLOCKED_POLICY");
	assert.equal(l.startRun({ runId: "r5-cpu", rungMinutes: 5, projectId: "p", modelAlias: "m", gate: passGate() }).verdict.reason, "CPU_FALLBACK_FORBIDDEN");
});

test("run record factory starts NOT_STARTED with localai provider", () => {
	const rec = createRunRecord({ runId: "r", rungMinutes: 10, attempt: 1, projectId: "p", modelAlias: "m", gpuOffloadProof: "PASS", vramBeforeMiB: 1000 });
	assert.equal(rec.result, "NOT_STARTED");
	assert.equal(rec.provider, "localai");
	assert.equal(rec.durationMs, 0);
});

// ---- ledgers ----
test("bug ledger entry records boundary + reset-from-zero semantics", () => {
	const b = createBugEntry({ bugId: "B1", rung: 10, attempt: 2, elapsedMs: 5 * 60_000, severity: "high", boundary: "GPU_RUNTIME", symptom: "gpu fallback", rootCause: "vram oom", retestedFromZero: true, finalStatus: "FIXED" });
	assert.equal(b.boundary, "GPU_RUNTIME");
	assert.equal(b.retestedFromZero, true);
	assert.equal(b.finalStatus, "FIXED");
	assert.deepEqual(b.filesChanged, []);
});

test("gpu ledger entry records offload proof + failure", () => {
	const g = createGpuEntry({ runId: "r", model: "granite-4.2-3b-flash", runtime: "localai", gpu: "RTX 5060", vramTotal: 8151, vramBefore: 118, offloadProof: "BLOCKED_GPU_INSUFFICIENT_VRAM", backendState: "NONE", failure: "INSUFFICIENT_FREE_VRAM" });
	assert.equal(g.offloadProof, "BLOCKED_GPU_INSUFFICIENT_VRAM");
	assert.equal(g.failure, "INSUFFICIENT_FREE_VRAM");
	assert.equal(g.vramAfterLoad, null);
});
