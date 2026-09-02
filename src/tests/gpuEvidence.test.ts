import test from "node:test";
import assert from "node:assert/strict";
import { buildGpuEvidence, GPU_MIN_FREE_MIB } from "../projects/GpuEvidence.js";

test("offload proof PASS requires delta VRAM + backend + smoke + enough free", () => {
	const ev = buildGpuEvidence({
		gpu: { totalMiB: 8151, freeMiB: 3000, usedMiB: 5151, gpuName: "RTX 5060 Laptop", driver: "616.56" },
		backend: { backend: "llama-cpp", loaded: true, model: "granite-4.2-3b-flash" },
		model: "granite-4.2-3b-flash",
		smokeInferenceOk: true,
		freeVramAfterMiB: 2600,
	});
	assert.equal(ev.offloadProof, true);
	assert.equal(ev.deltaVramMiB, -400);
	assert.equal(ev.evidenceQuality, "MEASURED");
	assert.deepEqual(ev.reasons, []);
});

test("no backend loaded => NOT proven (UNVERIFIED)", () => {
	const ev = buildGpuEvidence({
		gpu: { totalMiB: 8151, freeMiB: 3000, usedMiB: 5151, gpuName: "RTX 5060 Laptop", driver: "616.56" },
		backend: { backend: null, loaded: false, model: null },
		model: null,
		smokeInferenceOk: false,
		freeVramAfterMiB: 3000,
	});
	assert.equal(ev.offloadProof, false);
	assert.ok(ev.reasons.includes("BACKEND_NOT_LOADED"));
	assert.ok(ev.reasons.includes("SMOKE_INFERENCE_FAILED"));
	assert.equal(ev.evidenceQuality, "UNVERIFIED");
});

test("insufficient free VRAM => BLOCKED even if backend loaded", () => {
	const free = GPU_MIN_FREE_MIB - 50;
	const ev = buildGpuEvidence({
		gpu: { totalMiB: 8151, freeMiB: free, usedMiB: 8151 - free, gpuName: "RTX 5060 Laptop", driver: "616.56" },
		backend: { backend: "llama-cpp", loaded: true, model: "granite-4.2-3b-flash" },
		model: "granite-4.2-3b-flash",
		smokeInferenceOk: true,
		freeVramAfterMiB: free,
	});
	assert.equal(ev.offloadProof, false);
	assert.ok(ev.reasons.includes("INSUFFICIENT_FREE_VRAM"));
	assert.equal(ev.evidenceQuality, "BLOCKED");
});

test("no GPU detected => NOT proven", () => {
	const ev = buildGpuEvidence({
		gpu: { totalMiB: 0, freeMiB: 0, usedMiB: 0, gpuName: null, driver: null },
		backend: { backend: null, loaded: false, model: null },
		model: null,
		smokeInferenceOk: false,
		freeVramAfterMiB: 0,
	});
	assert.equal(ev.offloadProof, false);
	assert.ok(ev.reasons.includes("NO_GPU_DETECTED"));
});
