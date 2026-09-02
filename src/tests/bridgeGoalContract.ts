/**
 * BridgeGoalContract — characterization snapshot of the /goal contract as the
 * bridge mission must preserve it. Read-only; does NOT execute or modify /goal.
 */
import { makeGoal } from "../projects/GoalService.js";

export function goalContractShape(): { hasObjective: boolean; statusDefault: string; progressDefault: number; fields: string[] } {
	const g = makeGoal({ projectId: "p1", objective: "the objective" });
	return {
		hasObjective: typeof g.objective === "string" && g.objective.length > 0,
		statusDefault: g.status,
		progressDefault: g.progress,
		fields: ["goalId", "projectId", "objective", "acceptanceCriteria", "constraints", "nonGoals", "priority", "status", "createdAt", "updatedAt", "progress"],
	};
}