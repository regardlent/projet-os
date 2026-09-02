import test from "node:test";
import assert from "node:assert";
import {
	resolveVariant,
	parseVariantsResponse,
	classifyQuant,
	type VariantsResponse,
} from "../projects/LocalAIVariantResolver.js";
import { OfficialDocsGuard, compareDocsRuntime, OfficialDocsWatchlist } from "../projects/OfficialDocsGuard.js";
import { familyOf, familyDiversityPenalty, distinctFamilyCount, diverseFallback } from "../projects/FamilyDiversityAnalyzer.js";
import {
	createPreparation,
	advancePreparation,
	commitDownloadedArtifact,
	finalizePrepared,
	isPrepared,
} from "../projects/ModelPreparationTransaction.js";

// ---- Granite regression (observed runtime) ----
test("Granite: auto Q8 but variants exposes exact Q4 -> select Q4 by exact string", () => {
	const response: VariantsResponse = {
		model: "granite-4.2-3b-q4",
		auto_selected: "granite-4.2-3b-q8",
		variants: [
			{ model: "granite-4.2-3b-q8", backend: "llama-cpp", memory_bytes: 3_200_000_000, is_base: true, quant: "Q8_0" },
			{ model: "granite-4.2-3b-q4", backend: "llama-cpp", memory_bytes: 2_100_000_000, quant: "Q4_K_M" },
		],
	};
	const sel = resolveVariant(response);
	assert.equal(sel.status, "SELECTED");
	assert.equal(sel.exactVariant, "granite-4.2-3b-q4");
	assert.equal(sel.quant, "Q4_K_M");
});

test("Granite empty variants -> EMPTY (policy chooses deterministic fallback)", () => {
	const sel = resolveVariant({ model: "g", auto_selected: "g-q8", variants: [] });
	assert.equal(sel.status, "EMPTY");
	assert.equal(sel.exactVariant, null);
});

test("Granite null payload (endpoint 404/drift) -> ENDPOINT_DRIFT", () => {
	const sel = resolveVariant(null);
	assert.equal(sel.status, "ENDPOINT_DRIFT");
});

test("variant resolver prefers base variant and lower memory", () => {
	const sel = resolveVariant({
		variants: [
			{ model: "granite-4.2-3b-q8", memory_bytes: 3_200_000_000, quant: "Q8_0" },
			{ model: "granite-4.2-3b-q6", memory_bytes: 2_700_000_000, quant: "Q6_K" },
			{ model: "granite-4.2-3b-base", is_base: true, memory_bytes: 2_500_000_000, quant: "Q4_K_M" },
		],
	});
	assert.equal(sel.exactVariant, "granite-4.2-3b-base");
});

test("parseVariantsResponse returns null on malformed JSON", () => {
	assert.equal(parseVariantsResponse("{not-json"), null);
	assert.ok(parseVariantsResponse('{"variants":[]}'));
});

test("classifyQuant is safe (UNKNOWN fallback, never guesses)", () => {
	assert.equal(classifyQuant("granite-4.2-3b-q4_k_m"), "Q4_K_M");
	assert.equal(classifyQuant("granite-4.2-3b-q8"), "Q8_0");
	assert.equal(classifyQuant("some-mystery-model"), "UNKNOWN");
});

// ---- OfficialDocsGuard ----
test("source precedence: runtime override when a doc claim differs", () => {
	assert.equal(compareDocsRuntime("variant=q4", "granite-4.2-3b-q4"), "RUNTIME_OVERRIDE");
	assert.equal(compareDocsRuntime("x", "x"), "CONFIRMED");
	assert.equal(compareDocsRuntime("x", null), "STALE");
	assert.equal(compareDocsRuntime(null, "y"), "RUNTIME_OVERRIDE");
	assert.equal(compareDocsRuntime(null, null), "UNKNOWN");
});

test("official docs guard records and watches uncertain topics", () => {
	const g = new OfficialDocsGuard();
	g.record({ sourceId: "localai-variants", topic: "LOCALAI_VARIANTS", claim: "/api/models/variants", officialSource: "https://localai.io/", result: "CONFIRMED" });
	assert.equal(g.get("localai-variants")?.sourceId, "localai-variants");
	assert.ok(OfficialDocsWatchlist.includes("LOCALAI_VARIANTS"));
	assert.ok(OfficialDocsWatchlist.includes("CLINE_APPROVAL_API"));
});

// ---- FamilyDiversityAnalyzer ----
test("family detection: qwen/minstral/granite/unknown clusters", () => {
	assert.equal(familyOf("qwen3-1.7b-flash").family, "Qwen");
	assert.equal(familyOf("ministral-3b-flash").family, "Mistral");
	assert.equal(familyOf("granite-3.3-2b-flash").family, "Granite");
	assert.equal(familyOf("mystery-x").family, "unknown");
});

test("family diversity penalizes clones (same base model) heavily", () => {
	const pen = familyDiversityPenalty("qwen3.5-4b", ["qwen3-1.7b-flash", "granite-3.3-2b-flash"]);
	assert.ok(pen >= 4, `clone penalty too low: ${pen}`);
	assert.equal(familyDiversityPenalty("minstral-3b", ["granite-3.3-2b-flash", "smollm3-3b-flash"]), 0);
});

test("distinct family count", () => {
	assert.equal(distinctFamilyCount(["qwen3-1.7b", "qwen2-0.5b", "granite-3.3", "smollm3-3b"]), 3);
});

test("diverse fallback prefers a different family when scores close", () => {
	const d = diverseFallback("qwen3-1.7b", [
		{ model: "qwen2-0.5b", score: 9 },
		{ model: "granite-3.3-2b", score: 9.5 },
	], 1);
	assert.equal(d, "granite-3.3-2b");
});

// ---- ModelPreparationTransaction ----
test("transaction lifecycle: plan -> install -> verified (never ready)", () => {
	let tx = createPreparation({ candidate: "deepseek-r1-1.5b-flash", upstream: "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B", license: "MIT", effectiveParameters: 1.5, parameterConfidence: "VERIFIED", trustTier: 3, variant: "Q4_K_M", expectedSha256: "abc", diskBeforeBytes: 100 });
	const advanced = advancePreparation(tx, "INSTALLING");
	assert.ok(advanced);
	tx = advanced;
	tx = commitDownloadedArtifact(tx, { filename: "deepseek.gguf", sizeBytes: 1000, sha256: "abc", security: "PASS" });
	assert.equal(tx.state, "SCANNING");
	tx = finalizePrepared(tx, true);
	assert.equal(tx.state, "PREPARED_VERIFIED");
	assert.ok(isPrepared(tx));
	assert.ok(!("flashReady" in tx));
});

test("hash mismatch blocks preparation", () => {
	let tx = createPreparation({ candidate: "m", upstream: "u", license: "MIT", effectiveParameters: 1, parameterConfidence: "VERIFIED", trustTier: 3, variant: "Q4", expectedSha256: "abc", diskBeforeBytes: 1 });
	const committed = commitDownloadedArtifact(tx, { filename: "m.gguf", sizeBytes: 1, sha256: "def", security: "PASS" });
	assert.equal(committed.state, "FAILED");
	assert.ok(committed.failReasons.includes("HASH_MISMATCH"));
});

test("Defender finding quarantines, never loads", () => {
	let tx = createPreparation({ candidate: "m", upstream: "u", license: "MIT", effectiveParameters: 1, parameterConfidence: "VERIFIED", trustTier: 3, variant: "Q4", diskBeforeBytes: 1 });
	tx = commitDownloadedArtifact(tx, { filename: "m.gguf", sizeBytes: 1, sha256: "x", security: "FINDING" });
	const q = finalizePrepared(tx, true);
	assert.equal(q.state, "QUARANTINED");
	assert.ok(!isPrepared(q));
});

test("illegal backward/skip transition returns null", () => {
	let tx = createPreparation({ candidate: "m", upstream: "u", license: "MIT", effectiveParameters: 1, parameterConfidence: "VERIFIED", trustTier: 3, variant: "Q4", diskBeforeBytes: 1 });
	assert.equal(advancePreparation(tx, "PREPARED_VERIFIED"), null);
	assert.equal(advancePreparation(tx, "PLANNED"), null);
});
