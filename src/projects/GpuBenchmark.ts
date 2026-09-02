/**
 * GpuBenchmark (Phase 22). Pre-ladder GPU benchmark aggregation: 1 warmup + >=3 measured runs.
 * Captures TTFT (first-token latency), throughput (tokens/s), peak VRAM, correctness, stability.
 * A benchmark PASS requires >= requiredMeasured runs, all correct, positive throughput and stable
 * (low coefficient of variation). Pure + testable; never invents measurements.
 */

export interface BenchmarkRun {
	firstTokenMs: number;
	tokens: number;
	durationMs: number;
	vramPeakMiB: number | null;
	correct: boolean;
}

export interface BenchmarkResult {
	modelAlias: string;
	warmup: BenchmarkRun | null;
	measured: BenchmarkRun[];
	ttftMs: number | null;
	tokensPerSec: number | null;
	vramPeakMiB: number | null;
	correctness: number;
	stability: number | null;
	passes: boolean;
	reasons: string[];
}

function mean(xs: number[]): number | null {
	if (xs.length === 0) return null;
	return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[]): number | null {
	if (xs.length < 2) return null;
	const m = mean(xs)!;
	return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}

/** Throughput (tokens/s) for a single run. */
export function throughput(run: BenchmarkRun): number | null {
	if (run.durationMs <= 0) return null;
	return (run.tokens / run.durationMs) * 1000;
}

export function aggregateBenchmark(modelAlias: string, warmup: BenchmarkRun | null, measured: BenchmarkRun[], requiredMeasured = 3): BenchmarkResult {
	const tps = measured.map(throughput).filter((v): v is number => v !== null && v > 0);
	const stability = (() => {
		if (tps.length < 2) return null;
		const m = mean(tps)!;
		const s = stdev(tps)!;
		return m > 0 ? Math.max(0, 1 - s / m) : null;
	})();
	const ttft = mean(measured.map((r) => r.firstTokenMs));
	const tokensPerSec = mean(tps);
	const vramPeak = measured.reduce<number | null>((m, r) => (r.vramPeakMiB === null ? m : m === null ? r.vramPeakMiB : Math.max(m, r.vramPeakMiB)), null);
	const correctCount = measured.filter((r) => r.correct).length;
	const correctness = measured.length ? correctCount / measured.length : 0;

	const reasons: string[] = [];
	if (measured.length < requiredMeasured) reasons.push("NOT_ENOUGH_MEASURED_RUNS");
	if (correctCount !== measured.length) reasons.push("INCORRECT_RUN");
	if (tokensPerSec === null || tokensPerSec <= 0) reasons.push("NO_THROUGHPUT");
	if (stability === null || stability < 0.7) reasons.push("UNSTABLE");
	if (measured.some((r) => r.vramPeakMiB === null)) reasons.push("VRAM_NOT_MEASURED");

	const passes = reasons.length === 0;
	return { modelAlias, warmup, measured, ttftMs: ttft, tokensPerSec, vramPeakMiB: vramPeak, correctness, stability, passes, reasons };
}
