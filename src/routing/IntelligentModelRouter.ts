/**
 * IntelligentModelRouter (W134).
 *
 * Deterministically selects the cheapest ENOUGH model: filters by required
 * capability/user context, applies the routing policy (free-first /
 * free-until-exhausted / pass-first / quality-with-budget), and gates every
 * pay-as-you-go choice through the ProjectBudgetGovernor (never mutates budget).
 * Pure module, deterministic.
 */
import type { ModelCandidate } from "./ModelCandidate.js";
import {
	classifyTask,
	requirementsToCapabilities,
	type TaskClass,
	type TaskRequirements,
} from "./TaskClassifier.js";
import { isUp, isCapable, hasUsableContext, isZeroMarginalCost, isPaidCost } from "./ModelCandidate.js";
import type { ProjectBudgetGovernor, RoutingPolicy } from "../budget/BudgetGovernor.js";
import type { ModelPerformanceRegistry } from "./ModelPerformanceRegistry.js";
import { estimateCost } from "../budget/CostModel.js";

export interface AlternativeNote {
	modelId: string;
	reason: string;
}

export interface ModelSelectionDecision {
	taskClass: TaskClass;
	requirements: TaskRequirements;
	selected?: ModelCandidate;
	reasons: string[];
	alternatives: AlternativeNote[];
	budgetEffect?: number;
	confidence: number;
}

interface Scored {
	candidate: ModelCandidate;
	score: number;
	notes: string[];
	budgetEffect?: number;
}

export interface RouteOptions {
	taskClass: TaskClass;
	candidates: ModelCandidate[];
	governor: ProjectBudgetGovernor;
	policy?: RoutingPolicy;
	performance?: ModelPerformanceRegistry;
	/** Injectable now for deterministic tests (defaults to Date.now()). */
	now?: number;
}

export function route(opts: RouteOptions): ModelSelectionDecision {
	const policy = opts.policy ?? "FREE_UNTIL_EXHAUSTED";
	const { taskClass } = opts;
	const req = classifyTask(taskClass).requirements;
	const requiredCaps = requirementsToCapabilities(req);
	const now = opts.now ?? Date.now();

	const eligible: Scored[] = [];
	const alternatives: AlternativeNote[] = [];

	for (const c of opts.candidates) {
		if (!isUp(c, now)) {
			alternatives.push({ modelId: c.modelId, reason: "unavailable/cooldown" });
			continue;
		}
		if (!isCapable(c, requiredCaps)) {
			const missing = requiredCaps.filter((k) => !c.capabilities.includes(k)).join(",");
			alternatives.push({ modelId: c.modelId, reason: `missing capability ${missing}` });
			continue;
		}
		if (!hasUsableContext(c, req.requiredContext)) {
			alternatives.push({ modelId: c.modelId, reason: "context window too small" });
			continue;
		}
		if (isPaidCost(c) && !opts.governor.canUsePaid()) {
			alternatives.push({ modelId: c.modelId, reason: "paid inference disabled" });
			continue;
		}
		if (isPaidCost(c) && policy === "FREE_ONLY") {
			alternatives.push({ modelId: c.modelId, reason: "FREE_ONLY policy rejects PAYG" });
			continue;
		}
		const r = rank(c, req, taskClass, opts.performance);
		eligible.push({ candidate: c, score: r.score, notes: r.notes });
	}

	if (eligible.length === 0) {
		return {
			taskClass,
			requirements: req,
			reasons: ["AI_CAPACITY_EXHAUSTED or no eligible candidate"],
			alternatives,
			confidence: 0,
		};
	}

	const ordered = [...eligible].sort((a, b) => {
		if (policy === "LOCAL_FIRST") return orderLocalFirst(a, b) || a.candidate.modelId.localeCompare(b.candidate.modelId);
		if (policy === "PASS_FIRST") return orderPassFirst(a, b) || a.candidate.modelId.localeCompare(b.candidate.modelId);
		if (policy === "FREE_UNTIL_EXHAUSTED" || policy === "FREE_FIRST" || policy === "FREE_ONLY") {
			const aFree = isZeroMarginalCost(a.candidate);
			const bFree = isZeroMarginalCost(b.candidate);
			if (aFree !== bFree) return aFree ? -1 : 1;
			return b.score - a.score || a.candidate.modelId.localeCompare(b.candidate.modelId);
		}
		return b.score - a.score || a.candidate.modelId.localeCompare(b.candidate.modelId); // BALANCED / QUALITY_FIRST / MANUAL
	});

	let selected: Scored | undefined;
	for (const s of ordered) {
		if (isPaidCost(s.candidate)) {
			const cost = estimatedCostOf(s.candidate, req);
			if (cost === undefined || !opts.governor.canAfford(cost)) {
				alternatives.push({
					modelId: s.candidate.modelId,
					reason: cost === undefined ? "COST_UNKNOWN" : "BUDGET",
				});
				continue;
			}
			selected = { ...s, budgetEffect: cost };
			break;
		}
		selected = s;
		break;
	}

	if (!selected) {
		return {
			taskClass,
			requirements: req,
			reasons: ["NO_ELIGIBLE_CANDIDATE_UNDER_POLICY_AND_BUDGET"],
			alternatives,
			confidence: 0,
		};
	}

	return {
		taskClass,
		requirements: req,
		selected: selected.candidate,
		reasons: buildReasons(selected),
		alternatives,
		budgetEffect: selected.budgetEffect,
		confidence: confidenceOf(selected.candidate, taskClass, opts.performance),
	};
}
function rank(
	c: ModelCandidate,
	req: TaskRequirements,
	taskClass: TaskClass,
	perf?: ModelPerformanceRegistry,
): { score: number; notes: string[] } {
	let score = 0;
	const notes: string[] = [];
	if (c.capabilities.length >= (req.toolsRequired ? 2 : 1)) score += 10;
	if (req.reasoningRequired && c.capabilities.includes("reasoning")) score += 4;
	if (req.visionRequired && c.capabilities.includes("vision")) score += 4;
	const stat = perf?.get(c.modelId, taskClass);
	if (stat) {
		if (stat.runs >= 3 && stat.successRate >= 0.8) score += 8;
		notes.push(`${stat.runs} runs, ${(stat.successRate * 100).toFixed(0)}% ok`);
	}
	if (c.observedLatencyMs !== undefined && c.observedLatencyMs <= 2000) score += 3;
	return { score, notes };
}

function estimatedCostOf(c: ModelCandidate, req: TaskRequirements): number | undefined {
	if (c.inputPricePer1M === undefined || c.outputPricePer1M === undefined) return undefined;
	const est = estimateCost({
		inputTokens: req.requiredContext,
		outputTokens: Math.min(c.maxOutputTokens ?? 8192, 4096),
		inputPricePer1M: c.inputPricePer1M,
		outputPricePer1M: c.outputPricePer1M,
	});
	return est.cost;
}

function buildReasons(s: Scored): string[] {
	const c = s.candidate;
	const reasons: string[] = [];
	reasons.push(`billing=${c.billingClass}`);
	if (isZeroMarginalCost(c)) reasons.push("zero-marginal cost (free / subscription-covered)");
	if (c.capabilities.includes("tools")) reasons.push("coding tools");
	if (c.capabilities.includes("reasoning")) reasons.push("reasoning");
	if (s.budgetEffect !== undefined) reasons.push(`est cost $${s.budgetEffect.toFixed(2)}`);
	return reasons;
}

function confidenceOf(
	c: ModelCandidate,
	taskClass: TaskClass,
	perf?: ModelPerformanceRegistry,
): number {
	const stat = perf?.get(c.modelId, taskClass);
	return Math.round((stat?.confidence ?? 0.5) * 100) / 100;
}

function orderLocalFirst(a: Scored, b: Scored): number {
	const aLocal = a.candidate.billingClass === "LOCAL_FREE" ? 1 : 0;
	const bLocal = b.candidate.billingClass === "LOCAL_FREE" ? 1 : 0;
	if (aLocal !== bLocal) return bLocal - aLocal;
	return b.score - a.score;
}

function orderPassFirst(a: Scored, b: Scored): number {
	const aPass = a.candidate.billingClass === "SUBSCRIPTION_INCLUDED" ? 1 : 0;
	const bPass = b.candidate.billingClass === "SUBSCRIPTION_INCLUDED" ? 1 : 0;
	if (aPass !== bPass) return bPass - aPass;
	return b.score - a.score;
}

