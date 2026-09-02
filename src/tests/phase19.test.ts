import { test } from "node:test";
import assert from "node:assert/strict";
import { GpuQualificationQueue, classifyEligibility, requiredFreeVRAM, makeGpuBlockState, type ModelQueueEntry } from "../projects/GpuQualificationQueue.js";
import { normalizeThinkingEnvelope, parseJsonFinal, overReasoningScore } from "../projects/ReasoningResponseNormalizer.js";
import { evaluateCandidate, buildReplacementRadar, trustTier, inferParamsFromTags, roleHints, type CatalogEntry } from "../projects/ReplacementRadar.js";
import { isModelEligible, selectRoute, explainRoute, type RouterModel } from "../projects/DeterministicRouter.js";

test("GPU queue: eligibility uses estimate+headroom; pressure when insufficient", () => {
	const e: ModelQueueEntry = { modelId: "m", alias: "m-flash", variant: "q4", requiredContext: 8192, estimatedVRAMMiB: 1500, requiredHeadroomMiB: 500, priority: 1, status: "WAITING_GPU", securityStatus: "PASS", parameterStatus: "PASS" };
	assert.equal(requiredFreeVRAM(e), 2000);
	assert.equal(classifyEligibility(e, 2500), "ELIGIBLE");
	assert.equal(classifyEligibility(e, 1000), "GPU_PRESSURE_BLOCK");
	const q = new GpuQualificationQueue();
	q.add(e);
	assert.equal(q.blockedCount(1000), 1);
	assert.equal(q.nextEligible(2500)?.modelId, "m");
	assert.equal(q.nextEligible(1000), null);
	const b = makeGpuBlockState({ totalMiB: 8151, usedMiB: 8077, freeMiB: 74, localAiResidentBackends: 0 });
	assert.equal(b.status, "EXTERNAL_VRAM_PRESSURE");
	assert.equal(b.externalPressure, true);
});

test("ReasoningResponseNormalizer extracts final answer after </think> and parses JSON", () => {
	const raw = "<think>Let me compute 17*23.</think>{\"status\":\"ok\",\"value\":391}";
	const n = normalizeThinkingEnvelope(raw);
	assert.equal(n.rawHadThinkingEnvelope, true);
	assert.equal(n.finalContent, "{\"status\":\"ok\",\"value\":391}");
	assert.equal(n.parserStatus, "json_after_think");
	const p = parseJsonFinal(raw);
	assert.equal(p.ok, true);
	assert.deepEqual(p.value, { status: "ok", value: 391 });
	// over-reasoning on trivial task
	const o = overReasoningScore("<think>" + "x".repeat(1200) + "</think>391");
	assert.ok(o.score > 0.5);
	assert.equal(o.hadThinkingEnvelope, true);
});

test("Deterministic router routes only READY + PROVEN; excludes CPU/prepared", () => {
	const models: RouterModel[] = [
		{ modelId: "smollm3", alias: "smollm3-flash", status: "FLASH_READY", capability: { chat: "PROVEN", coding: "PROVEN" } },
		{ modelId: "qwen31", alias: "qwen3-1.7b-flash", status: "FLASH_READY", capability: { chat: "PROVEN", coding: "FAILED" } },
		{ modelId: "deepseek", alias: "deepseek-flash", status: "MODEL_READY_CPU", capability: { reasoning: "PROVEN" } },
		{ modelId: "granite332", alias: "granite-3.3-2b-flash", status: "PREPARED_VERIFIED", capability: { coding: "PROVEN" } },
	];
	assert.equal(isModelEligible(models[0], ["chat", "coding"]), true);
	assert.equal(isModelEligible(models[1], ["chat", "coding"]), false);
	const r = selectRoute(models, "CODING", ["coding"]);
	assert.equal(r.primary, "smollm3");
	assert.deepEqual(r.excluded.filter((x) => x.modelId === "deepseek").map((x) => x.reason), ["GPU_BLOCKED"]);
	const ex = explainRoute(models, "CODING", ["coding"]);
	assert.equal(ex.selected, "smollm3");
	assert.ok(ex.excluded.some((x) => x.modelId === "qwen31"));
});

test("ReplacementRadar hard filters + trust tiers + role hints", () => {
	const catalog: CatalogEntry[] = [
		{ name: "ibm-granite_granite-4.2-3b-q4", license: "apache-2.0", backend: "llama-cpp", tags: ["3b", "gguf", "tool", "coding"], files: [{ filename: "g-Q4_K_M.gguf" }] },
		{ name: "qwen_qwen3.5-4b", license: "apache-2.0", backend: "llama-cpp", tags: ["4b", "gguf", "vision", "tool"], files: [{ filename: "Q4.gguf" }] },
		{ name: "some-unknown-30b", license: "", backend: "llama-cpp", tags: ["30b"], files: [{ filename: "x.gguf" }] },
		{ name: "community-fine-tune-3b", license: "apache-2.0", backend: "llama-cpp", tags: ["3b", "gguf", "fable"], files: [{ filename: "c.gguf" }] },
	];
	assert.equal(trustTier(catalog[0]), 1);
	assert.equal(inferParamsFromTags(catalog[0].tags), 3);
	assert.ok(roleHints(catalog[0]).includes("CODING"));
	const ev = evaluateCandidate(catalog[0]);
	assert.equal(ev.eligible, true);
	assert.equal(ev.trustTier, 1);
	const evBad = evaluateCandidate(catalog[2]);
	assert.equal(evBad.eligible, false);
	assert.ok(evBad.failReasons.includes("OVER_4B") || evBad.failReasons.includes("LICENSE_UNKNOWN"));
	const evTier4 = evaluateCandidate(catalog[3]);
	assert.equal(evTier4.eligible, false);
	const radar = buildReplacementRadar(catalog);
	assert.ok(radar[0].score >= radar[radar.length - 1].score);
});
