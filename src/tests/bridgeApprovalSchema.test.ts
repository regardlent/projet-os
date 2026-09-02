/**
 * Bridge tests — approval matrix, tool schema validation, tool dispatch.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { evaluateApproval, toolClassOf } from "../integrations/bridge/ApprovalService.js";
import { validateArgs, findTool, BRIDGE_TOOLS, dispatchTool } from "../integrations/bridge/BridgeToolRegistry.js";

function tempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pos-bridge-schema-"));
}

test("approval: FAIL-CLOSED matrix", () => {
	const ctx = { writeEnabled: true, approvalMode: "auto-approve-read" as const, workspaceApproved: true };
	assert.equal(evaluateApproval("health", ctx).decision, "approve");
	assert.equal(evaluateApproval("read", ctx).decision, "approve");
	assert.equal(evaluateApproval("test-run", ctx).decision, "needs-approval");
	assert.equal(evaluateApproval("build-run", ctx).decision, "needs-approval");
	assert.equal(evaluateApproval("antigravity-run", ctx).decision, "needs-approval");
	assert.equal(evaluateApproval("network", ctx).decision, "denied");
	assert.equal(evaluateApproval("dangerous", ctx).decision, "denied");
});

test("approval: unapproved ws denies reads; writes disabled denies exec", () => {
	assert.equal(evaluateApproval("read", { writeEnabled: true, approvalMode: "auto-approve-read" as const, workspaceApproved: false }).decision, "denied");
	assert.equal(evaluateApproval("test-run", { writeEnabled: false, approvalMode: "approval-required" as const, workspaceApproved: true }).decision, "denied");
	assert.equal(evaluateApproval("antigravity-write", { writeEnabled: false, approvalMode: "approval-required" as const, workspaceApproved: true }).decision, "denied");
});

test("approval: unknown tool => dangerous", () => {
	assert.equal(toolClassOf("unknown_tool"), "dangerous");
	assert.equal(toolClassOf("file_write_anything"), "write");
	assert.equal(toolClassOf("file_read"), "read");
	assert.equal(toolClassOf("bridge_health"), "health");
});

test("schema: every tool valid; >=9 tools", () => {
	for (const t of BRIDGE_TOOLS) {
		assert.ok(t.name.length > 0);
		assert.equal(typeof t.handler, "function");
		for (const req of t.required) assert.ok(req in t.properties, `${t.name} missing ${req}`);
	}
	assert.ok(BRIDGE_TOOLS.length >= 9);
});

test("schema: validateArgs rejects missing/unknown/wrong/oversized", () => {
	const tool = findTool("file_read")!;
	assert.deepEqual(validateArgs({}, tool), ["missing required: path"]);
	assert.ok(validateArgs({ path: "a.ts", extra: 1 }, tool).some((e) => e.includes("unknown property")));
	assert.ok(validateArgs({ path: 123 }, tool).some((e) => e.includes("wrong type")));
	assert.ok(validateArgs({ path: "x".repeat(5000) }, tool).some((e) => e.includes("oversized")));
});

test("dispatch: unknown tool fails closed", async () => {
	const r = await dispatchTool({ toolName: "nope", args: {}, workspaceRoot: process.cwd(), readTimeoutMs: 1000, runTimeoutMs: 1000, antigravity: null, allowedScripts: ["test"] });
	assert.equal(r.ok, false);
	assert.match(String(r.error), /unknown tool/);
});

test("dispatch: bridge_health returns JSON text", async () => {
	const r = await dispatchTool({ toolName: "bridge_health", args: {}, workspaceRoot: process.cwd(), readTimeoutMs: 1000, runTimeoutMs: 1000, antigravity: null, allowedScripts: [] });
	assert.equal(r.ok, true);
	const parsed = JSON.parse(r.result!.content[0].text);
	assert.ok(parsed.projectOS && parsed.mcp);
});

test("dispatch: file_read blocks secret path", async () => {
	const root = tempDir();
	fs.writeFileSync(path.join(root, ".env"), "TOKEN=supersecret");
	const r = await dispatchTool({ toolName: "file_read", args: { path: ".env" }, workspaceRoot: root, readTimeoutMs: 1000, runTimeoutMs: 1000, antigravity: null, allowedScripts: [] });
	assert.equal(r.ok, true);
	const parsed = JSON.parse(r.result!.content[0].text);
	assert.equal(parsed.error, "SECRET");
	fs.rmSync(root, { recursive: true, force: true });
});

test("dispatch: file_read traversal blocked", async () => {
	const root = tempDir();
	const r = await dispatchTool({ toolName: "file_read", args: { path: "../x" }, workspaceRoot: root, readTimeoutMs: 1000, runTimeoutMs: 1000, antigravity: null, allowedScripts: [] });
	assert.equal(r.ok, true);
	assert.ok(JSON.parse(r.result!.content[0].text).error);
	fs.rmSync(root, { recursive: true, force: true });
});

test("dispatch: tests_run only allows known scripts", async () => {
	const root = tempDir();
	const r = await dispatchTool({ toolName: "tests_run", args: { script: "rm -rf /" }, workspaceRoot: root, readTimeoutMs: 1000, runTimeoutMs: 1000, antigravity: null, allowedScripts: ["test"] });
	assert.equal(r.ok, true);
	assert.ok(JSON.parse(r.result!.content[0].text).error.includes("not allowed"));
	fs.rmSync(root, { recursive: true, force: true });
});

test("dispatch: antigravity_run unavailable when adapter null", async () => {
	const root = tempDir();
	const r = await dispatchTool({ toolName: "antigravity_run", args: { prompt: "hi" }, workspaceRoot: root, readTimeoutMs: 1000, runTimeoutMs: 1000, antigravity: null, allowedScripts: [] });
	assert.equal(r.ok, true);
	assert.ok(JSON.parse(r.result!.content[0].text).error.includes("antigravity"));
	fs.rmSync(root, { recursive: true, force: true });
});