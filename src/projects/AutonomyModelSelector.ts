/**
 * AutonomyModelSelector — empirically ranks models for autonomy reliability and
 * picks a winner + bounded fallback list (Phase 14). Pure, testable.
 */
export interface ModelReliabilityObservation {
	modelId: string;
	nonEmptyOutputRate: number;
	readToolRate: number;
	searchToolRate: number;
	completionRate: number;
	toolResultConsumptionRate: number;
	avgLatencyMs: number;
	stability: number;
}

export interface AutonomyReliabilityScore {
	total: number;
	components: Record<string, number>;
}

export function autonomyReliabilityScore(o: ModelReliabilityObservation): AutonomyReliabilityScore {
	const total =
		o.nonEmptyOutputRate * 0.3 +
		o.readToolRate * 0.15 +
		o.searchToolRate * 0.1 +
		o.completionRate * 0.2 +
		o.toolResultConsumptionRate * 0.1 +
		o.stability * 0.15 -
		Math.min(0.1, o.avgLatencyMs / 10000);
	return { total: Math.max(0, Math.min(1, total)), components: { nonEmpty: o.nonEmptyOutputRate, read: o.readToolRate, search: o.searchToolRate, complete: o.completionRate, consume: o.toolResultConsumptionRate, stability: o.stability } };
}

export interface AutonomyModelChoice {
	winner: string;
	fallbacks: string[];
	ranked: string[];
	winnerScore: number;
}

/**
 * Select the autonomy model. A model qualifies for the READ pool only if its
 * non-empty output, read and search rates are all above the threshold. Winner =
 * highest score; falls back to the next qualified models (max 2). Unknown/failed
 * models are excluded.
 */
export function selectAutonomyModels(
	obs: ModelReliabilityObservation[],
	opts: { minReadRate?: number; maxFallbacks?: number } = {},
): AutonomyModelChoice {
	const minRead = opts.minReadRate ?? 0.5;
	const maxFallbacks = opts.maxFallbacks ?? 2;
	const qualified = obs
		.filter((o) => o.nonEmptyOutputRate >= 0.5 && o.readToolRate >= minRead && o.searchToolRate >= minRead)
		.map((o) => ({ o, score: autonomyReliabilityScore(o).total }))
		.sort((a, b) => b.score - a.score);
	const winner = qualified[0]?.o.modelId ?? "none";
	const fallbacks = qualified.slice(1, 1 + maxFallbacks).map((q) => q.o.modelId);
	return { winner, fallbacks, ranked: qualified.map((q) => q.o.modelId), winnerScore: qualified[0]?.score ?? 0 };
}
