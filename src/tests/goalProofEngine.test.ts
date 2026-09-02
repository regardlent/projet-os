import test from "node:test";
import assert from "node:assert/strict";
import { satisfyCriterion, evaluateGoalProof, revokeCriterion, type CriterionEvidence } from "../projects/GoalProofEngine.js";

test("goal never REACHED without all criteria satisfied", () => {
	let c: CriterionEvidence[] = [];
	c = satisfyCriterion(c, "standings", "Show standings", "shows-standings OK");
	const proof = evaluateGoalProof("g1", ["Show standings", "Show scorers"], c);
	assert.equal(proof.goalReached, false);
	assert.equal(proof.allSatisfied, false);
	assert.deepEqual(proof.unsatisfied, ["Show scorers"]);
});

test("goal REACHED only when ALL criteria have evidence", () => {
	let c: CriterionEvidence[] = [];
	c = satisfyCriterion(c, "standings", "Show standings", "shows-standings OK");
	c = satisfyCriterion(c, "scorers", "Show scorers", "shows-scorers OK");
	const proof = evaluateGoalProof("g1", ["Show standings", "Show scorers"], c);
	assert.equal(proof.goalReached, true);
	assert.equal(proof.allSatisfied, true);
	assert.deepEqual(proof.unsatisfied, []);
});

test("satisfying an existing criterion updates evidence (no dup)", () => {
	let c: CriterionEvidence[] = [];
	c = satisfyCriterion(c, "a", "A", "first");
	c = satisfyCriterion(c, "a", "A", "second");
	assert.equal(c.length, 1);
	assert.equal(c[0].evidenceText, "second");
});

test("revoking a criterion marks it unsatisfied again", () => {
	let c: CriterionEvidence[] = [];
	c = satisfyCriterion(c, "a", "A", "evidence");
	const proofBefore = evaluateGoalProof("g", ["A"], c);
	assert.equal(proofBefore.goalReached, true); // single criterion, satisfied => reached
	c = revokeCriterion(c, "a");
	const proof = evaluateGoalProof("g", ["A"], c);
	assert.equal(proof.goalReached, false);
	assert.deepEqual(proof.unsatisfied, ["A"]);
});
