import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWriteScope } from "../projects/AutonomyWriteScope.js";
import { decideApproval } from "../projects/ClineCoreApprovalBridge.js";

const scope = buildWriteScope({ runId: "r1", workspaceRoot: "C:/ws", complexity: "small" });

function d(toolName: string, toolInput: unknown) {
	return decideApproval({ approvalId: "a1", sessionId: "s1", runId: "r1", toolName, toolInput, scope });
}

test("bridge approves in-scope editor/apply_patch, denies others fail-closed", () => {
	assert.equal(d("editor", { path: "src/a.ts" }).approved, true);
	assert.equal(d("apply_patch", { path: "src/a.ts" }).approved, true);
	assert.equal(d("write_file", { path: "src/b.ts" }).approved, true);
});

test("bridge auto-denies out-of-scope / protected / secret / shell / unknown", () => {
	assert.equal(d("editor", { path: "../x.ts" }).approved, false);
	assert.equal(d("editor", { path: ".env" }).approved, false);
	assert.equal(d("editor", { path: "node_modules/x.js" }).approved, false);
	assert.equal(d("editor", { path: ".project-os/project.json" }).approved, false);
	assert.equal(d("run_commands", { command: "git status" }).approved, false);
	assert.equal(d("read_files", { files: ["src/a.ts"] }).approved, false);
	assert.equal(d("editor", {}).approved, false);
});
