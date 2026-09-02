import test from "node:test";
import assert from "node:assert";
import { evaluateEndurance } from "../projects/EnduranceLab.js";
import type { GpuObservation } from "../projects/EnduranceLab.js";
import type { QualifiableModel } from "../projects/FleetQualifier.js";

const gates = { gpuLoad: true, gpuOffloadProven: true, smoke: true, correctness: true, stability: true, benchmark: true, vramMeasured: true };

function models(): QualifiableModel[] {
	return [
		{ modelId: "g", alias: "granite-4.2-3b-flash", quantization: "Q4_K_M", license: "apache-2.0", family: "Granite", estimatedVRAMMiB: 2160, requiredHeadroomMiB: 1024, securityPass: true, parameterPass: true, status: "PREPARED_VERIFIED" as const, roleHints: ["CODING", "TOOLS", "GENERAL"], flashGates: gates },
		{ modelId: "d", alias: "deepseek-r1-1.5b-flash", quantization: "Q4_K_M", license: "apache-2.0", family: "DeepSeek", estimatedVRAMMiB: 1700, requiredHeadroomMiB: 1024, securityPass: true, parameterPass: true, status: "MODEL_READY_CPU" as const, roleHints: ["CODING", "REASONING"], flashGates: gates },
	];
}

const provider = { providerId: "openai-compatible", baseUrl: "http://127.0.0.1:8080/v1", modelId: "granite-4.2-3b-flash", hasFallbackProvider: false, cloudCandidates: [] };

function gpu(freeMiB: number): GpuObservation {
	return { device: "RTX 5060", totalMiB: 8151, freeMiB, computeApps: [], localAiBackendsResident: 0, selectedCandidateAlias: null };
}

test("endurance lab: blocked at 118 MiB -> ladderBlocked, evidence not eligible", () => {
	const r = evaluateEndurance(gpu(118), models(), provider, "granite-4.2-3b-flash");
	assert.equal(r.canStart, false);
	assert.equal(r.ladderBlocked, true);
	assert.equal(r.gate.category, "BLOCKED_GPU");
	assert.equal(r.fleet.flashReadyCount, 0);
	assert.equal(r.router.primary, null);
	assert.equal(r.evidenceEligible, false);
	assert.match(r.blockReason ?? "", /OFFLOAD|VRAM/);
});

test("endurance lab: enough VRAM but no proven caps -> canStart but NOT evidence-eligible (router empty)", () => {
	const r = evaluateEndurance(gpu(5000), models(), provider, "granite-4.2-3b-flash");
	assert.equal(r.gate.category, "OK");
	assert.equal(r.canStart, true);
	assert.equal(r.ladderBlocked, false);
	assert.ok(r.fleet.flashReadyCount >= 1);
	assert.equal(r.router.primary, null); // capabilities not PROVEN yet
	assert.equal(r.evidenceEligible, false);
	assert.equal(r.providerOk, true);
	assert.equal(r.routerOk, true);
});

test("endurance lab: provider mismatch fails provider proof", () => {
	const r = evaluateEndurance(gpu(5000), models(), { ...provider, baseUrl: "https://api.openai.com/v1" }, "granite-4.2-3b-flash");
	assert.equal(r.providerOk, false);
	assert.equal(r.evidenceEligible, false);
});
