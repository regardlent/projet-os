import { test } from "node:test";
import assert from "node:assert/strict";
import {
	classifyWorkspaceRoots,
	isCanonicalRoot,
	CANONICAL_PROJECT_ROOT,
} from "../workspace/WorkspaceTopology.js";
import { isOperationAllowed, trustDenialReason } from "../workspace/WorkspaceTrustGuard.js";

test("classifies empty / single / multi root workspaces", () => {
	assert.equal(classifyWorkspaceRoots([]), "EMPTY");
	assert.equal(classifyWorkspaceRoots(["C:\\x"]), "SINGLE_ROOT");
	assert.equal(classifyWorkspaceRoots(["C:\\x", "C:\\y"]), "MULTI_ROOT");
});

test("canonical root detection is case/trailing-slash insensitive", () => {
	assert.equal(isCanonicalRoot(CANONICAL_PROJECT_ROOT), true);
	assert.equal(isCanonicalRoot("c:\\users\\eiden\\desktop\\dev\\projet-os\\"), true);
	assert.equal(isCanonicalRoot("C:\\elsewhere"), false);
});

test("trusted workspace allows all operations", () => {
	assert.equal(isOperationAllowed(true, "shell"), true);
	assert.equal(isOperationAllowed(true, "write"), true);
});

test("untrusted workspace allows only analysis", () => {
	assert.equal(isOperationAllowed(false, "analysis"), true);
	assert.equal(isOperationAllowed(false, "write"), false);
	assert.equal(isOperationAllowed(false, "shell"), false);
	assert.equal(isOperationAllowed(false, "serviceStart"), false);
	assert.equal(isOperationAllowed(false, "agentWriteTools"), false);
});

test("denial reasons are explicit", () => {
	assert.match(trustDenialReason("shell"), /untrusted/i);
	assert.match(trustDenialReason("write"), /untrusted/i);
});
