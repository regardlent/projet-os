import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWriteScope } from "../projects/AutonomyWriteScope.js";
import { evaluateWriteApproval, buildWriteToolPolicies, opFromToolName, pathFromWriteInput } from "../projects/WriteApproval.js";
import { buildWriteLaneConfig, evaluateApproval } from "../projects/AutonomyWriteLane.js";

const scope = buildWriteScope({ runId: "r1", workspaceRoot: "C:/ws", complexity: "small" });

test("evaluateWriteApproval allows in-scope modify/patch, blocks the rest", () => {
	assert.equal(evaluateWriteApproval(scope, { op: "modify", path: "src/a.ts", changedBytes: 100, patchLines: 10, filesTouched: 1 }).allow, true);
	assert.equal(evaluateWriteApproval(scope, { op: "patch", path: "src/a.ts", changedBytes: 100, patchLines: 10, filesTouched: 1 }).allow, true);
	assert.equal(evaluateWriteApproval(scope, { op: "delete", path: "src/a.ts", changedBytes: 0, patchLines: 0, filesTouched: 1 }).allow, false);
	assert.equal(evaluateWriteApproval(scope, { op: "rename", path: "src/a.ts", changedBytes: 0, patchLines: 0, filesTouched: 1 }).allow, false);
	// outside
	assert.equal(evaluateWriteApproval(scope, { op: "modify", path: "../outside.ts", changedBytes: 1, patchLines: 1, filesTouched: 1 }).allow, false);
	// protected
	assert.equal(evaluateWriteApproval(scope, { op: "modify", path: "node_modules/x.js", changedBytes: 1, patchLines: 1, filesTouched: 1 }).allow, false);
	assert.equal(evaluateWriteApproval(scope, { op: "modify", path: ".project-os/autonomy.json", changedBytes: 1, patchLines: 1, filesTouched: 1 }).allow, false);
	// secret
	assert.equal(evaluateWriteApproval(scope, { op: "modify", path: ".env", changedBytes: 1, patchLines: 1, filesTouched: 1 }).allow, false);
	assert.equal(evaluateWriteApproval(scope, { op: "modify", path: "keys/id_rsa", changedBytes: 1, patchLines: 1, filesTouched: 1 }).allow, false);
	// budget
	assert.equal(evaluateWriteApproval(scope, { op: "modify", path: "src/a.ts", changedBytes: 1, patchLines: 1, filesTouched: 6 }).allow, false);
	assert.equal(evaluateWriteApproval(scope, { op: "modify", path: "src/a.ts", changedBytes: 999_999, patchLines: 1, filesTouched: 1 }).allow, false);
});

test("buildWriteToolPolicies: write requires approval, read auto-approves, dangerous disabled", () => {
	const p = buildWriteToolPolicies();
	assert.equal(p.editor?.autoApprove, false);
	assert.equal(p.apply_patch?.autoApprove, false);
	assert.equal(p.run_commands?.autoApprove, false);
	assert.equal(p.read_files?.autoApprove, true);
	assert.equal(p.deploy?.enabled, false);
	assert.equal(p.git_push?.enabled, false);
});

test("opFromToolName + pathFromWriteInput", () => {
	assert.equal(opFromToolName("apply_patch"), "patch");
	assert.equal(opFromToolName("editor"), "modify");
	assert.equal(opFromToolName("write_file"), "create");
	assert.equal(opFromToolName("read_files"), null);
	assert.equal(pathFromWriteInput({ path: "src/a.ts" }), "src/a.ts");
	assert.equal(pathFromWriteInput({ file_path: "b.ts" }), "b.ts");
	assert.equal(pathFromWriteInput("nope"), "");
});

test("buildWriteLaneConfig constructs gated ClineCore config; evaluateApproval gates by scope", () => {
	const cfg = buildWriteLaneConfig({ workspaceRoot: "C:/fixture", modelId: "qwen3-4b", baseUrl: "http://127.0.0.1:8080/v1", runId: "r1", complexity: "small" });
	const createOpts = cfg.createOptions as { toolPolicies: Record<string, { autoApprove?: boolean }> };
	assert.equal(createOpts.toolPolicies.editor?.autoApprove, false);
	assert.equal(createOpts.toolPolicies.apply_patch?.autoApprove, false);
	assert.equal(cfg.startConfig.cwd, "C:/fixture");
	assert.equal((cfg.startConfig.checkpoint as { enabled: boolean }).enabled, true);
	// scope decisions
	assert.equal(evaluateApproval(cfg.scope, "editor", { path: "src/a.ts" }).allow, true);
	assert.equal(evaluateApproval(cfg.scope, "apply_patch", { path: "src/a.ts" }).allow, true);
	assert.equal(evaluateApproval(cfg.scope, "editor", { path: "../x.ts" }).allow, false);
	assert.equal(evaluateApproval(cfg.scope, "editor", { path: ".env" }).allow, false);
	assert.equal(evaluateApproval(cfg.scope, "editor", { path: "node_modules/x.js" }).allow, false);
	assert.equal(evaluateApproval(cfg.scope, "read_files", { path: "src/a.ts" }).allow, false);
});
