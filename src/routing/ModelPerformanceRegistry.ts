/**
 * ModelPerformanceRegistry (W133/W38/W40).
 *
 * Tracks factual per-(model, task-class) run outcomes. No single run is enough
 * to declare a model good/bad; success score is reported with sample count and
 * a confidence that rises with samples.
 *
 * Pure module (in-memory; persistence via project storage when wired).
 */
import type { TaskClass } from "./TaskClassifier.js";

export interface ModelRunOutcome {
	providerId: string;
	modelId: string;
	taskClass: TaskClass;
	success: boolean;
	toolFailures?: number;
	contextOverflow?: boolean;
	latencyMs?: number;
	tokens?: number;
}

export interface ModelStat {
	modelId: string;
	providerId: string;
	taskClass: TaskClass;
	runs: number;
	successes: number;
	failures: number;
	toolFailures: number;
	contextOverflows: number;
	totalTokens: number;
	totalLatencyMs: number;
	successRate: number;
	confidence: number; // 0..1
}

export class ModelPerformanceRegistry {
	private readonly key = new Map<string, ModelStat>();

	record(outcome: ModelRunOutcome): ModelStat {
		const k = `${outcome.providerId}|${outcome.modelId}|${outcome.taskClass}`;
		let s = this.key.get(k);
		if (!s) {
			s = {
				modelId: outcome.modelId,
				providerId: outcome.providerId,
				taskClass: outcome.taskClass,
				runs: 0,
				successes: 0,
				failures: 0,
				toolFailures: 0,
				contextOverflows: 0,
				totalTokens: 0,
				totalLatencyMs: 0,
				successRate: 0,
				confidence: 0,
			};
			this.key.set(k, s);
		}
		s.runs++;
		if (outcome.success) s.successes++;
		else s.failures++;
		s.toolFailures += outcome.toolFailures ?? 0;
		if (outcome.contextOverflow) s.contextOverflows++;
		s.totalTokens += outcome.tokens ?? 0;
		s.totalLatencyMs += outcome.latencyMs ?? 0;
		s.successRate = s.successes / s.runs;
		s.confidence = Math.min(1, Math.sqrt(s.runs / 30));
		return s;
	}

	get(modelId: string, taskClass: TaskClass): ModelStat | undefined {
		for (const s of this.key.values()) {
			if (s.modelId === modelId && s.taskClass === taskClass) return s;
		}
		return undefined;
	}

	statsForTask(taskClass: TaskClass): ModelStat[] {
		return [...this.key.values()].filter((s) => s.taskClass === taskClass && s.runs > 0);
	}

	list(): ModelStat[] {
		return [...this.key.values()];
	}
}

