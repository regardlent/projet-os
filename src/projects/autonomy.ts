/**
 * Autonomy — time-budgeted autonomous development planning (Phase 13).
 *
 * Lets the user parameterize a `minutes` budget for an autonomous run against
 * a managed project's goal. Bigger / more complex projects get more minutes.
 * Produces a plan (checkpoints, deadline) and a summary generator.
 */
import type { ProjectType } from "./projectTypes.js";

export type AutonomyComplexity = "small" | "medium" | "large" | "auto";

export interface AutonomyPlan {
	projectId: string;
	goalId: string;
	objective: string;
	mode: "AUTONOMY";
	minutes: number;
	complexity: AutonomyComplexity;
	steps: string[];
	checkpointEveryMinutes: number;
	createdAt: number;
	deadline: number;
	status: "PLANNED" | "RUNNING" | "COMPLETED" | "FAILED" | "STOPPED";
}

/** Heuristic complexity score from goal + project hints (bigger = more work). */
export function scoreComplexity(
	projectType: ProjectType,
	goal: string,
	fileCount: number,
): number {
	const g = goal.toLowerCase();
	let s = 0;
	if (/refactor|architect|migrat|multi|distribut|platform|rewrite|framework|cms|ecommerce/.test(g)) s += 2;
	if (/complete|end.to.end|production|release|security|hardening/.test(g)) s += 1;
	if (/bug|fix|typo|small|quick|cleanup|readme/.test(g)) s -= 1;
	if (fileCount > 80) s += 3;
	else if (fileCount > 40) s += 2;
	else if (fileCount > 12) s += 1;
	if (["web", "desktop", "cpp", "rust", "go"].includes(projectType)) s += 1;
	if (["localai", "docker"].includes(projectType)) s += 0;
	return s;
}

/** Resolve a minutes budget from an explicit/auto complexity. Clamped to safe bounds. */
export function resolveAutonomyMinutes(input: {
	complexity: AutonomyComplexity;
	projectType: ProjectType;
	goal: string;
	fileCount: number;
}): number {
	switch (input.complexity) {
		case "small":
			return 15;
		case "medium":
			return 45;
		case "large":
			return 120;
		default: {
			const base = 30;
			const sc = scoreComplexity(input.projectType, input.goal, input.fileCount);
			return Math.min(480, Math.max(10, base + sc * 30));
		}
	}
}

/** Build an autonomous plan for a managed project goal. */
export function buildAutonomyPlan(input: {
	projectId: string;
	goalId: string;
	objective: string;
	projectType: ProjectType;
	minutes: number;
	complexity: AutonomyComplexity;
	now?: number;
}): AutonomyPlan {
	const now = input.now ?? Date.now();
	const objective = input.objective;
	const steps = [
		`Analyse l'objectif: "${objective}".`,
		`Bootstrap + confirme le stack (projectType=${input.projectType}).`,
		"Implémente par petites unités validées (axe itératif).",
		"Test + typecheck à chaque checkpoint.",
		"Documente + produit un handoff/summary final.",
	];
	return {
		projectId: input.projectId,
		goalId: input.goalId,
		objective,
		mode: "AUTONOMY",
		minutes: input.minutes,
		complexity: input.complexity,
		steps,
		checkpointEveryMinutes: Math.max(5, Math.round(input.minutes / 4)),
		createdAt: now,
		deadline: now + input.minutes * 60_000,
		status: "PLANNED",
	};
}

/** Produce a concise markdown summary from a plan + observed activity. */
export function summarizeAutonomy(
	plan: AutonomyPlan,
	activity: { phase: string; note: string }[],
): string {
	const lines = [
		`# AUTONOMY SUMMARY — ${plan.objective}`,
		"",
		`- Budget: ${plan.minutes} min (complexity=${plan.complexity})`,
		`- Statut: ${plan.status}`,
		`- Checkpoints: tous les ${plan.checkpointEveryMinutes} min`,
		`- Deadline: ${new Date(plan.deadline).toISOString()}`,
		"",
		"## Étape / avancement",
	];
	if (activity.length === 0) {
		lines.push("- (aucune activité observée)");
	} else {
		for (const a of activity) lines.push(`- ${a.phase}: ${a.note}`);
	}
	lines.push("", "## Recommandation", "- Poursuivre sur les prochaines unités, puis QA + handoff.");
	return lines.join("\n");
}
