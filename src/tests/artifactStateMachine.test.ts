import { test } from "node:test";
import assert from "node:assert/strict";
import {
	canTransition,
	assertValidTransition,
	nextStatuses,
	isTerminal,
} from "../artifacts/ArtifactStateMachine.js";

test("valid transitions are allowed", () => {
	assert.equal(canTransition("DRAFT", "READY_FOR_REVIEW"), true);
	assert.equal(canTransition("READY_FOR_REVIEW", "APPROVED"), true);
	assert.equal(canTransition("APPROVED", "APPLYING"), true);
	assert.equal(canTransition("APPLYING", "VERIFYING"), true);
	assert.equal(canTransition("VERIFYING", "VERIFIED"), true);
	assert.equal(canTransition("VERIFIED", "SUPERSEDED"), true);
	assert.equal(canTransition("SUPERSEDED", "ARCHIVED"), true);
});

test("invalid transitions are rejected", () => {
	assert.equal(canTransition("DRAFT", "VERIFIED"), false);
	assert.equal(canTransition("READY_FOR_REVIEW", "DRAFT"), false);
	assert.equal(canTransition("VERIFIED", "APPROVED"), false);
	assert.equal(canTransition("ARCHIVED", "SUPERSEDED"), false);
});

test("assertValidTransition throws on invalid transition", () => {
	assert.throws(() => assertValidTransition("DRAFT", "VERIFIED"), /Invalid artifact transition/);
});

test("nextStatuses lists reachable states", () => {
	assert.deepEqual(nextStatuses("FAILED"), ["DRAFT", "READY_FOR_REVIEW", "ARCHIVED"]);
});

test("ARCHIVED is terminal, READY_FOR_REVIEW is not", () => {
	assert.equal(isTerminal("ARCHIVED"), true);
	assert.equal(isTerminal("VERIFIED"), false);
});
