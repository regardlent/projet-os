/**
 * UsageReport (Phase 23, W-usage). Consolidated token + cost + performance telemetry for a
 * "job" (a generation run / project-creation run / autonomy run). Given the token and cost
 * observations captured for a jobId, it produces the honest TOTAL tokens and TOTAL cost that
 * the usage-report runs were missing, plus throughput metrics from measured inference runs.
 * Pure + testable; LocalAI marginal cost is EXACT_ZERO (never a fake price).
 */
import type { UsageObservation } from "./UsageObservation.js";
import type { CostObservation } from "../budget/CostModel.js";

export interface TokenTotals { input: number; output: number; total: number }

export interface CostTotals { paygActual: number; paygEstimated: number; subscriptionCovered: number; free: number; unknown: number; currency?: string }

export interface ThroughputMetrics {
	ttftMs: number | null;      // mean first-token latency
	tokensPerSec: number | null;
	vramPeakMiB: number | null;
	correctness: number | null; // fraction of correct runs
	stability: number | null;
	runsMeasured: number;
}

export interface UsageReport {
	jobId: string;
	projectId: string | null;
	runId: string | null;
	modelId: string | null;
	providerId: string | null;
	tokens: TokenTotals;
	cost: CostTotals;
	throughput: ThroughputMetrics;
	observationCount: number;
	costObservationCount: number;
}

export interface MeasuredInference {
	runId?: string;
	modelId?: string;
	firstTokenMs?: number | null;
	tokens?: number;
	durationMs?: number | null;
	vramPeakMiB?: number | null;
	correct?: boolean;
}

function t0(): TokenTotals { return { input: 0, output: 0, total: 0 }; }
function c0(): CostTotals { return { paygActual: 0, paygEstimated: 0, subscriptionCovered: 0, free: 0, unknown: 0 }; }

export function sumTokens(obs: readonly UsageObservation[]): TokenTotals {
	const t = t0();
	for (const o of obs) { t.input += o.inputTokens; t.output += o.outputTokens; t.total += o.totalTokens; }
	return t;
}

export function sumCost(obs: readonly CostObservation[]): CostTotals {
	const c = c0();
	for (const o of obs) {
		if (o.quality === "EXACT_BILLED") c.paygActual += o.actualCost ?? 0;
		else if (o.quality === "ESTIMATED") c.paygEstimated += o.estimatedCost ?? 0;
		else if (o.quality === "SUBSCRIPTION_COVERED") c.subscriptionCovered += o.estimatedCost ?? 0;
		else if (o.quality === "EXACT_ZERO") c.free++;
		else c.unknown++;
		c.currency = c.currency ?? o.currency;
	}
	return c;
}

export function throughputOf(runs: readonly MeasuredInference[]): ThroughputMetrics {
	const tps: number[] = [];
	const ttft: number[] = [];
	let vram = null; let correct = 0;
	for (const r of runs) {
		if (r.durationMs && r.durationMs > 0 && r.tokens) tps.push((r.tokens / r.durationMs) * 1000);
		if (typeof r.firstTokenMs === "number") ttft.push(r.firstTokenMs);
		if (r.vramPeakMiB) vram = vram === null ? r.vramPeakMiB : Math.max(vram, r.vramPeakMiB);
		if (r.correct === true) correct++;
	}
	const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
	const ttftMs = mean(ttft);
	const tokensPerSec = mean(tps);
	const correctness = runs.length ? correct / runs.length : null;
	let stability: number | null = null;
	if (tps.length >= 2) {
		const m = mean(tps)!;
		const sd = Math.sqrt(tps.reduce((a, v) => a + (v - m) * (v - m), 0) / (tps.length - 1));
		stability = m > 0 ? Math.max(0, 1 - sd / m) : null;
	}
	return { ttftMs, tokensPerSec, vramPeakMiB: vram, correctness, stability, runsMeasured: runs.length };
}

export function reportUsage(input: {
	jobId: string;
	tokenObservations: readonly UsageObservation[];
	costObservations?: readonly CostObservation[];
	measuredRuns?: readonly MeasuredInference[];
	projectId?: string | null;
	runId?: string | null;
	modelId?: string | null;
	providerId?: string | null;
}): UsageReport {
	return {
		jobId: input.jobId,
		projectId: input.projectId ?? null,
		runId: input.runId ?? null,
		modelId: input.modelId ?? (input.tokenObservations[0]?.modelId ?? null),
		providerId: input.providerId ?? (input.tokenObservations[0]?.providerId ?? null),
		tokens: sumTokens(input.tokenObservations),
		cost: sumCost(input.costObservations ?? []),
		throughput: throughputOf(input.measuredRuns ?? []),
		observationCount: input.tokenObservations.length,
		costObservationCount: (input.costObservations ?? []).length,
	};
}
