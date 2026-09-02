/**
 * GoalService — persistence for a managed project's goal (Phase 13).
 * Uses node fs and is unit-testable under node (storage path injected).
 */
import fs from "node:fs";
import path from "node:path";
import type { GoalContract } from "./projectTypes.js";

export class GoalService {
	constructor(private readonly projectRoot: string) {}

	private goalFile(): string {
		return path.join(this.projectRoot, ".project-os", "goal.json");
	}

	private historyFile(): string {
		return path.join(this.projectRoot, ".project-os", "goal-history.jsonl");
	}

	load(): GoalContract | undefined {
		try {
			const raw = fs.readFileSync(this.goalFile(), "utf8");
			const parsed = JSON.parse(raw) as GoalContract;
			if (parsed && typeof parsed.objective === "string") return parsed;
		} catch {
			// missing/corrupt -> undefined
		}
		return undefined;
	}

	save(goal: GoalContract): void {
		fs.mkdirSync(path.dirname(this.goalFile()), { recursive: true });
		fs.writeFileSync(this.goalFile(), JSON.stringify(goal, null, 2), "utf8");
	}

	appendHistory(goal: GoalContract): void {
		const line = JSON.stringify({ at: Date.now(), goal });
		fs.mkdirSync(path.dirname(this.historyFile()), { recursive: true });
		fs.appendFileSync(this.historyFile(), line + "\n", "utf8");
	}

	history(): GoalContract[] {
		try {
			const lines = fs.readFileSync(this.historyFile(), "utf8").split("\n").filter(Boolean);
			return lines.map((l) => (JSON.parse(l) as { goal: GoalContract }).goal);
		} catch {
			return [];
		}
	}
}

/** Factory helper to build a fresh GoalContract. */
export function makeGoal(input: {
	projectId: string;
	objective: string;
	acceptanceCriteria?: string[];
	constraints?: string[];
	nonGoals?: string[];
	priority?: "low" | "normal" | "high";
}): GoalContract {
	const now = Date.now();
	return {
		goalId: `goal-${now}-${Math.random().toString(36).slice(2, 8)}`,
		projectId: input.projectId,
		objective: input.objective,
		acceptanceCriteria: input.acceptanceCriteria ?? [],
		constraints: input.constraints ?? [],
		nonGoals: input.nonGoals ?? [],
		priority: input.priority ?? "normal",
		status: "ACTIVE",
		createdAt: now,
		updatedAt: now,
		progress: 0,
	};
}
