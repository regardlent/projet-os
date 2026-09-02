/**
 * ControlCenterCockpit (Phase 24, W10). Pure, type-safe cockpit snapshot that assembles the
 * real signals available to Project OS (active project, goal, todo progress, LocalAI model
 * inventory, GPU evidence, budget, tokens). It renders no metric that was not supplied as
 * evidence — unknown/absent signals are reported as null, never invented.
 */
import type { GoalProof } from "./GoalProofEngine.js";
import type { GpuEvidence } from "./GpuEvidence.js";

export interface CockpitSignals {
	activeProject: { slug: string; status: string; projectType: string } | null;
	goal: { objective: string; proof: GoalProof } | null;
	todoProgress: { done: number; total: number } | null;
	localAiModels: string[];
	gpu: GpuEvidence | null;
	budget: { dailyPaidBudget: number; actualPaidSpend: number; mode: string } | null;
}

export interface CockpitView {
	activeProject: string;
	goalStatus: string;
	goalUnsatisfied: string[];
	todoProgress: string;
	localAiModelCount: number;
	gpu: { offloadProof: boolean; quality: string; freeVramMiB: number } | null;
	budget: { remaining: number; mode: string } | null;
}

/** Build a display-friendly (but evidence-backed) cockpit view. */
export function cockpitView(s: CockpitSignals): CockpitView {
	const goalStatus = s.goal?.proof.goalReached === true ? "GOAL_REACHED" : s.goal ? "IN_PROGRESS" : "NO_GOAL";
	const goalUnsatisfied = s.goal ? s.goal.proof.unsatisfied : [];
	const todoProgress = s.todoProgress ? `${s.todoProgress.done}/${s.todoProgress.total}` : "n/a";
	const budget = s.budget
		? { remaining: Math.max(0, s.budget.dailyPaidBudget - s.budget.actualPaidSpend), mode: s.budget.mode }
		: null;
	return {
		activeProject: s.activeProject ? `${s.activeProject.slug} (${s.activeProject.status})` : "(none)",
		goalStatus,
		goalUnsatisfied,
		todoProgress,
		localAiModelCount: s.localAiModels.length,
		gpu: s.gpu ? { offloadProof: s.gpu.offloadProof, quality: s.gpu.evidenceQuality, freeVramMiB: s.gpu.freeVramAfterMiB } : null,
		budget,
	};
}
