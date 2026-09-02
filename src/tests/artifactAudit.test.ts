import test from "node:test";
import assert from "node:assert/strict";
import { auditArtifactEnums, EXPECTED_ARTIFACT_TYPES, EXPECTED_ARTIFACT_STATUSES } from "../projects/ArtifactAudit.js";

test("expected artifact declaration has 28 types and 11 statuses", () => {
	assert.equal(EXPECTED_ARTIFACT_TYPES.length, 28);
	assert.equal(EXPECTED_ARTIFACT_STATUSES.length, 11);
});

test("audit matches when real enum covers the expected set", () => {
	const audit = auditArtifactEnums(EXPECTED_ARTIFACT_TYPES);
	assert.equal(audit.typesMatch, true);
	assert.equal(audit.statusesMatch, true);
	assert.equal(audit.actualTypeCount, 28);
	assert.equal(audit.actualStatusCount, 11);
	assert.deepEqual(audit.missingTypes, []);
	assert.deepEqual(audit.missingStatuses, []);
});

test("audit detects missing types as drift", () => {
	const partial = EXPECTED_ARTIFACT_TYPES.slice(0, 10);
	const audit = auditArtifactEnums(partial);
	assert.equal(audit.typesMatch, false);
	assert.ok(audit.missingTypes.length > 0);
	assert.equal(audit.actualTypeCount, 10);
});
