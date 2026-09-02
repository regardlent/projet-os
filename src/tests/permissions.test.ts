import { test } from "node:test";
import assert from "node:assert/strict";
import { buildToolPolicies, classifyTool, unclassifiedTools } from "../cline/PermissionsAdapter.js";

test("read-only tools are auto-approved", () => {
	const p = buildToolPolicies();
	assert.deepEqual(p.read_files, { enabled: true, autoApprove: true });
	assert.equal(p.search_codebase?.autoApprove, true);
});

test("mutating tools require approval", () => {
	const p = buildToolPolicies();
	assert.deepEqual(p.apply_patch, { enabled: true, autoApprove: false });
	assert.deepEqual(p.run_commands, { enabled: true, autoApprove: false });
});

test("dangerous tools are disabled by default", () => {
	const p = buildToolPolicies();
	assert.deepEqual(p.deploy, { enabled: false, autoApprove: false });
	assert.deepEqual(p.force_push, { enabled: false, autoApprove: false });
});

test("disabled wins over conflicting classification", () => {
	const p = buildToolPolicies({
		readOnlyAutoApprove: ["deploy"],
		disabled: ["deploy"],
	});
	assert.deepEqual(p.deploy, { enabled: false, autoApprove: false });
});

test("override-disabled re-enables with approval", () => {
	const p = buildToolPolicies({ allowOverrideDisabled: ["deploy"] });
	assert.equal(p.deploy?.enabled, true);
	assert.equal(p.deploy?.autoApprove, false);
});

test("classifyTool returns the right buckets", () => {
	assert.equal(classifyTool("read_files"), "read");
	assert.equal(classifyTool("apply_patch"), "write");
	assert.equal(classifyTool("deploy"), "disabled");
	assert.equal(classifyTool("something_new"), "unknown");
});

test("unclassifiedTools reports tools without explicit policy", () => {
	const p = buildToolPolicies();
	const unclassified = unclassifiedTools(p, ["read_files", "apply_patch", "brand_new_tool"]);
	assert.deepEqual(unclassified, ["brand_new_tool"]);
});
