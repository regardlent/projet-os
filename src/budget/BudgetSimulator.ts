/**
 * BudgetSimulator (W89/W90).
 *
 * Simulates what routing WOULD pick if paid were enabled, WITHOUT making any
 * request. Uses the real catalog + a fresh in-memory AUTO governor; NEVER
 * mutates the real budget. Pure module.
 */
import { ProjectBudgetGovernor, type RoutingPolicy } from "./BudgetGovernor.js";
import { route, type ModelSelectionDecision } from "../routing/IntelligentModelRouter.js";
import type { ModelCandidate } from "../routing/ModelCandidate.js";
import type { TaskClass } from "../routing/TaskClassifier.js";
import type { ModelPerformanceRegistry } from "../routing/ModelPerformanceRegistry.js";

export interface SimulationResult {
	taskClass: TaskClass;
	decision: ModelSelectionDecision;
	estimatedPaidCost?: number;
	dailyRemainingAfter?: number;
	wouldBlock: boolean;
}

export function simulatePaidRouting(opts: {
	taskClass: TaskClass;
	candidates: ModelCandidate[];
	governor: ProjectBudgetGovernor;
	policy?: RoutingPolicy;
	performance?: ModelPerformanceRegistry;
}): SimulationResult {
	// Simulation always assumes AUTO_WITHIN_PROJECT_BUDGET, but reads the real
	// budget (spent + daily) so the projection is truthful.
	const simGov = new ProjectBudgetGovernor(
		{
			projectId: opts.governor.id,
			dailyPaidBudget: opts.governor.dailyBudget,
			currency: opts.governor.dailyBudgetCurrency,
			paidInferenceMode: "AUTO_WITHIN_PROJECT_BUDGET",
			getActualPaidSpend: () => opts.governor.spent(),
		},
		() => Date.now(),
	);
	const decision = route({
		taskClass: opts.taskClass,
		candidates: opts.candidates,
		governor: simGov,
		policy: opts.policy ?? "FREE_UNTIL_EXHAUSTED",
		performance: opts.performance,
	});
	const est = decision.budgetEffect;
	const remaining = simGov.remaining();
	const remainingAfter = est !== undefined ? Math.max(0, remaining - est) : undefined;
	return {
		taskClass: opts.taskClass,
		decision,
		estimatedPaidCost: est,
		dailyRemainingAfter: remainingAfter,
		wouldBlock: decision.selected === undefined,
	};
}

