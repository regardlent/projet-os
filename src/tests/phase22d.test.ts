import test from "node:test";
import assert from "node:assert";
import { qualifyFleet, PROJECT_CREATION_ROLES, type QualifiableModel, type FlashGates } from "../projects/FleetQualifier.js";

const gates = (over: Partial<FlashGates> = {}): FlashGates => ({ gpuLoad: true, gpuOffloadProven: true, smoke: true, correctness: true, stability: true, benchmark: true, vramMeasured: true, ...over });

function model(over: Partial<QualifiableModel> = {}): QualifiableModel {
	return {
		modelId: "id", alias: "m", quantization: "Q4_K_M", license: "apache-2.0", family: "Granite",
		estimatedVRAMMiB: 2000, requiredHeadroomMiB: 1024, securityPass: true, parameterPass: true,
		status: "PREPARED_VERIFIED", roleHints: ["CODING", "TOOLS"], flashGates: gates(), ...over,
	};
}

test("fleet: all gates + fits VRAM -> FLASH_READY", () => {
	const q = qualifyFleet([model({ alias: "granite-4.2-3b-flash", estimatedVRAMMiB: 2000, requiredHeadroomMiB: 1024 })], 5000);
	assert.deepEqual(q.flashReady.map((x) => x.alias), ["granite-4.2-3b-flash"]);
	assert.equal(q.flashReadyCount, 1);
});

test("fleet: CPU-only model is NEVER FLASH_READY", () => {
	const q = qualifyFleet([model({ status: "MODEL_READY_CPU", alias: "deepseek-r1-1.5b-flash", estimatedVRAMMiB: 1000 })], 5000);
	assert.equal(q.flashReadyCount, 0);
	assert.equal(q.qualified[0].eligibility, "NOT_READY");
	assert.match(q.qualified[0].reason, /CPU_ONLY/);
});

test("fleet: gates pending -> WAITING_GPU; security/parameter fail -> NOT_READY", () => {
	const q = qualifyFleet([
		model({ alias: "g-pending", flashGates: gates({ smoke: false }) }),
		model({ alias: "g-sec", securityPass: false }),
		model({ alias: "g-param", parameterPass: false }),
	], 5000);
	assert.equal(q.qualified.find((x) => x.alias === "g-pending")?.eligibility, "WAITING_GPU");
	assert.equal(q.qualified.find((x) => x.alias === "g-sec")?.eligibility, "NOT_READY");
	assert.equal(q.qualified.find((x) => x.alias === "g-param")?.eligibility, "NOT_READY");
});

test("fleet: gates pass but VRAM insufficient -> GPU_PRESSURE_BLOCK, nextEligible = smallest need", () => {
	const q = qualifyFleet([
		model({ alias: "big", estimatedVRAMMiB: 3000, requiredHeadroomMiB: 1024 }),
		model({ alias: "small", estimatedVRAMMiB: 1500, requiredHeadroomMiB: 512 }),
	], 118);
	assert.equal(q.flashReadyCount, 0);
	assert.ok(q.qualified.every((x) => x.eligibility === "GPU_PRESSURE_BLOCK"));
	assert.equal(q.nextEligible?.alias, "small");
	assert.equal(q.nextEligible?.neededMiB, 2012);
});

test("fleet: project-creation selection ranks coding/tool higher and penalizes family clones", () => {
	const q = qualifyFleet([
		model({ alias: "granite-4.0-micro-flash", family: "Granite", roleHints: ["CODING", "TOOLS", "GENERAL"], estimatedVRAMMiB: 1800 }),
		model({ alias: "granite-clone", family: "Granite", roleHints: ["CODING", "TOOLS"], estimatedVRAMMiB: 1800 }),
		model({ alias: "qwen3-vl-4b-flash", family: "Qwen", roleHints: ["VISION", "JSON", "MULTILINGUAL"], estimatedVRAMMiB: 2100 }),
	], 5000);
	const top = q.projectCreationSelection[0];
	assert.equal(top.alias, "granite-4.0-micro-flash");
	assert.ok(top.score > q.projectCreationSelection.find((x) => x.alias === "granite-clone")!.score);
	assert.deepEqual(PROJECT_CREATION_ROLES, ["CODING", "FAST_TOOL", "GENERAL", "JSON", "AUTONOMY_READ"]);
});

test("fleet: flashReady waitingGpu lists are correct", () => {
	const q = qualifyFleet([
		model({ alias: "ready-1", estimatedVRAMMiB: 1000, requiredHeadroomMiB: 512 }),
		model({ alias: "wait-1", flashGates: gates({ gpuOffloadProven: false }) }),
		model({ alias: "block-1", estimatedVRAMMiB: 4000, requiredHeadroomMiB: 1024 }),
	], 3000);
	assert.deepEqual(q.flashReady.map((x) => x.alias), ["ready-1"]);
	assert.ok(q.waitingGpu.some((m) => m.alias === "wait-1"));
	assert.ok(q.waitingGpu.some((m) => m.alias === "block-1"));
});
