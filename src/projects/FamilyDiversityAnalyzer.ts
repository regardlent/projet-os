/**
 * FamilyDiversityAnalyzer (Phase 21, W1133-1135).
 * Avoids a fleet of N same-family models that all fail similarly. After hard
 * gates, an overrepresented family earns a soft diversity penalty. Pure + testable.
 */

export interface FamilyRef {
	vendor: string;
	family: string;
	architecture: string;
	baseModel: string;
	tokenizerFamily: string;
}

const FAMILY_HINTS: Array<{ re: RegExp; ref: FamilyRef }> = [
	{ re: /granite/i, ref: { vendor: "IBM", family: "Granite", architecture: "llama", baseModel: "granite", tokenizerFamily: "ibm" } },
	{ re: /qwen/i, ref: { vendor: "Alibaba", family: "Qwen", architecture: "qwen", baseModel: "qwen", tokenizerFamily: "qwen" } },
	{ re: /mistral|ministral/i, ref: { vendor: "Mistral", family: "Mistral", architecture: "mistral", baseModel: "mistral", tokenizerFamily: "mistral" } },
	{ re: /smollm|smol/i, ref: { vendor: "HuggingFace", family: "SmolLM", architecture: "llama", baseModel: "smollm", tokenizerFamily: "hf" } },
	{ re: /lfm|liquid/i, ref: { vendor: "LiquidAI", family: "LFM", architecture: "lfm", baseModel: "lfm", tokenizerFamily: "liquid" } },
	{ re: /phi/i, ref: { vendor: "Microsoft", family: "Phi", architecture: "phi", baseModel: "phi", tokenizerFamily: "ms" } },
	{ re: /olmo/i, ref: { vendor: "Ai2", family: "OLMo", architecture: "llama", baseModel: "olmo", tokenizerFamily: "ai2" } },
	{ re: /deepseek/i, ref: { vendor: "DeepSeek", family: "DeepSeek", architecture: "deepseek", baseModel: "deepseek", tokenizerFamily: "deepseek" } },
	{ re: /llama/i, ref: { vendor: "Meta", family: "Llama", architecture: "llama", baseModel: "llama", tokenizerFamily: "llama" } },
	{ re: /gemma/i, ref: { vendor: "Google", family: "Gemma", architecture: "gemma", baseModel: "gemma", tokenizerFamily: "google" } },
];

/** Infer a family ref from a model alias/name. Unknown -> `unknown` family bucket. */
export function familyOf(name: string): FamilyRef {
	const lower = name.toLowerCase();
	for (const { re, ref } of FAMILY_HINTS) {
		if (re.test(lower)) return ref;
	}
	return { vendor: "unknown", family: "unknown", architecture: "unknown", baseModel: "unknown", tokenizerFamily: "unknown" };
}

/**
 * FamilyDiversityPenalty: returns a penalty applied to a candidate scoring pass.
 * Each additional same-family member (beyond 1) adds penalty; capped so it never
 * overrides a hard gate. Mirror models sharing an upstream/weight identity return
 * a large penalty so clones are never selected to inflate the fleet count.
 */
export function familyDiversityPenalty(candidateName: string, currentNames: readonly string[]): number {
	const fam = familyOf(candidateName);
	const sameFamily = currentNames.filter((n) => familyOf(n).family === fam.family);
	const duplicates = sameFamily.filter((n) => familyOf(n).baseModel === fam.baseModel);
	// clones (same base model) are heavily penalised
	if (duplicates.length > 0) return 4;
	// a second independent-slot same-family member is mildly penalised
	return Math.min(2, sameFamily.length * 0.5);
}

/** Count of distinct families in a set — used for a diversity audit. */
export function distinctFamilyCount(names: readonly string[]): number {
	return new Set(names.map((n) => familyOf(n).family)).size;
}

/** Pick a fallback that prefers a different family than the primary when scores are close. */
export function diverseFallback(primary: string, candidates: readonly { model: string; score: number }[], maxDistance: number): string | null {
	const primaryFam = familyOf(primary).family;
	const prefer = candidates.filter((c) => c.model !== primary && familyOf(c.model).family !== primaryFam).sort((a, b) => b.score - a.score);
	const same = candidates.filter((c) => c.model !== primary && familyOf(c.model).family === primaryFam).sort((a, b) => b.score - a.score);
	if (prefer.length && prefer[0].score + maxDistance >= (same[0]?.score ?? -Infinity)) return prefer[0].model;
	return same[0]?.model ?? null;
}
