/**
 * GoalProofEngine (Phase 24, W07). Mature goal completion: an acceptance criterion can only be
 * marked satisfied by explicit evidence (a check + timestamp), never by an arbitrary percentage.
 * GOAL_REACHED is only emitted when ALL criteria carry linked evidence. Pure + testable.
 */
export interface CriterionEvidence {
	criteriaId: string;
	criteriaText: string;
	satisfied: boolean;
	evidenceText: string;
	checkedAt: number;
}

export interface GoalProof {
	goalId: string;
	criteria: CriterionEvidence[];
	allSatisfied: boolean;
	goalReached: boolean;
	unsatisfied: string[];
}

function now(): number {
	return Date.now();
}

/** Register evidence that a criterion is satisfied. Returns a new criteria list. */
export function satisfyCriterion(list: CriterionEvidence[], criteriaId: string, criteriaText: string, evidenceText: string): CriterionEvidence[] {
	const t = now();
	const existing = list.find((c) => c.criteriaId === criteriaId);
	if (existing) {
		return list.map((c) => (c.criteriaId === criteriaId ? { ...c, satisfied: true, evidenceText, checkedAt: t } : c));
	}
	return [...list, { criteriaId, criteriaText, satisfied: true, evidenceText, checkedAt: t }];
}

/**
 * Build the proof verdict. `expectedCriteria` is the ordered list of the goal's acceptance
 * criteria (the TARGET). goalReached only when EVERY expected criterion is satisfied via
 * evidence. Missing evidence => the criterion shows up in `unsatisfied`.
 */
export function evaluateGoalProof(goalId: string, expectedCriteria: string[], criteria: CriterionEvidence[]): GoalProof {
	const unsatisfied: string[] = [];
	for (const expected of expectedCriteria) {
		const found = criteria.find((c) => c.criteriaText === expected && c.satisfied);
		if (!found) unsatisfied.push(expected);
	}
	const allSatisfied = expectedCriteria.length > 0 && unsatisfied.length === 0;
	return { goalId, criteria, allSatisfied, goalReached: allSatisfied, unsatisfied };
}

/** Reset a criterion to unsatisfied (evidence revoked). */
export function revokeCriterion(list: CriterionEvidence[], criteriaId: string): CriterionEvidence[] {
	return list.map((c) => (c.criteriaId === criteriaId ? { ...c, satisfied: false, evidenceText: "", checkedAt: c.checkedAt } : c));
}
