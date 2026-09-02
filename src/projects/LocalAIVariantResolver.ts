/**
 * LocalAIVariantResolver (Phase 21, W1118-1120).
 * Generalizes the Granite 4.2 fix into product logic: given a LocalAI gallery
 * /api/models/variants response, select the EXACT runtime-provided variant string
 * under the fleet variant policy. Never invents a variant name. Pure + testable.
 */

export type VariantQuant = "Q4_K_M" | "Q4" | "Q5_K_M" | "Q8_0" | "UNKNOWN";

export interface LocalAIVariant {
	model: string; // exact runtime-provided variant string (e.g. "granite-4.2-3b-q4")
	backend?: string;
	memory_bytes?: number;
	fits?: boolean;
	is_base?: boolean;
	quant?: string;
}

export interface VariantsResponse {
	model?: string;
	auto_selected?: string;
	variants?: LocalAIVariant[];
}

export interface VariantSelection {
	status: "SELECTED" | "EMPTY" | "ENDPOINT_DRIFT" | "POLICY_BLOCK";
	exactVariant: string | null;
	quant: VariantQuant;
	reason: string;
	failReasons: string[];
}

export interface VariantPolicy {
	maxParamsGte?: number; // models are pre-filtered elsewhere; kept for completeness
	preferredQuant?: VariantQuant;
	preferBaseVariant?: boolean;
}

const DEFAULT_POLICY: VariantPolicy = { preferredQuant: "Q4_K_M", preferBaseVariant: false };

/** Heuristic quantization classifier from a variant name / metadata. Safe fallback = UNKNOWN. */
export function classifyQuant(modelName: string, explicitQuant?: string): VariantQuant {
	const hay = `${modelName} ${explicitQuant ?? ""}`.toUpperCase();
	if (hay.includes("Q4_K_M") || /Q4[\s_.-]K_M/.test(hay)) return "Q4_K_M";
	if (/(^|[_\s.-])Q4([_\s.-]|$)/.test(hay) || hay.includes("Q4_0") || hay.includes("Q4_K_S")) return "Q4";
	if (hay.includes("Q5_K_M")) return "Q5_K_M";
	if (hay.includes("Q8")) return "Q8_0";
	return "UNKNOWN";
}

/**
 * Resolve the exact variant to install. Order of precedence (never guess):
 *  SECURITY (hard: only known-format, base-or-verified) → BACKEND → QUANT → MEMORY/FITS → PERF.
 * If the runtime response is missing/empty it reports EMPTY; if the endpoint is
 * conceptually absent we cannot tell here (caller passes a flag) -> ENDPOINT_DRIFT.
 */
export function resolveVariant(
	response: VariantsResponse | null,
	policy: VariantPolicy = DEFAULT_POLICY,
): VariantSelection {
	if (!response) {
		return { status: "ENDPOINT_DRIFT", exactVariant: null, quant: "UNKNOWN", reason: "Variants endpoint returned no payload", failReasons: ["ENDPOINT_DRIFT"] };
	}
	const variants = response.variants ?? [];
	if (variants.length === 0) {
		return { status: "EMPTY", exactVariant: null, quant: "UNKNOWN", reason: "Runtime reports no variants for this gallery id", failReasons: ["VARIANTS_EMPTY"] };
	}

	const preferred = policy.preferredQuant ?? "Q4_K_M";
	// Rank variants: prefer a base variant + a quant close to preferred + positive fits.
	const ranked = variants
		.map((v) => ({
			v,
			quant: classifyQuant(v.model, v.quant),
			fits: v.fits !== false,
			base: v.is_base === true,
		}))
		.sort((a, b) => {
			// 1. quant closeness to preferred dominates (Q4_K_M must win over an is_base Q8)
			const rank = (q: VariantQuant) => (q === preferred ? 0 : q.startsWith(preferred.slice(0, 2)) ? 1 : q === "UNKNOWN" ? 4 : 2);
			const d = rank(a.quant) - rank(b.quant);
			if (d !== 0) return d;
			// 2. base variant wins among equal quant
			if (a.base !== b.base) return a.base ? -1 : 1;
			// 3. lower memory (more likely to fit 8 GB) when known
			const am = a.v.memory_bytes ?? Infinity;
			const bm = b.v.memory_bytes ?? Infinity;
			return am - bm;
		});

	const best = ranked[0];
	const failReasons: string[] = [];
	if (best.quant === "UNKNOWN") failReasons.push("QUANT_UNKNOWN");

	const selected: VariantSelection = {
		status: failReasons.length ? "POLICY_BLOCK" : "SELECTED",
		exactVariant: best.v.model,
		quant: best.quant,
		reason: best.base
			? `Selected base variant "${best.v.model}" (${best.quant})`
			: `Selected variant "${best.v.model}" (${best.quant})`,
		failReasons,
	};
	return selected;
}

/** Convenience: parse a raw JSON string into VariantsResponse (returns null on parse failure). */
export function parseVariantsResponse(raw: string): VariantsResponse | null {
	try {
		const j = JSON.parse(raw) as VariantsResponse;
		return j && typeof j === "object" ? j : null;
	} catch {
		return null;
	}
}
