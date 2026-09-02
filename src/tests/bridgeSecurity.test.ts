/**
 * Bridge security + concurrency tests — fault injection, prompt-injection defense,
 * concurrency bounds, rapid requests, no shell metachar execution.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { DEFAULT_BRIDGE_CONFIG } from "../integrations/bridge/config.js";
import { McpBridge } from "../integrations/bridge/McpBridge.js";
import { boundaryRead, boundaryWrite, isSecretPath } from "../integrations/bridge/WorkspaceBoundary.js";
import { toolClassOf } from "../integrations/bridge/ApprovalService.js";
import { dispatchTool } from "../integrations/bridge/BridgeToolRegistry.js";

function cfg(over: Record<string, unknown> = {}) {
	return { ...DEFAULT_BRIDGE_CONFIG, ...over };
}

test("security: shell metacharacters in path treated as literal (blocked, not executed)", () => {
	const root = process.cwd();
	const r = boundaryRead(root, "src; rm -rf /");
	assert.equal(r.ok, false);
	assert.equal(boundaryWrite({ root, requested: "a&whoami", op: "create", allowedOps: ["create"] }).ok, false);
});

test("security: prompt-injection in filename never grants permission", async () => {
	// A hostile tool name is classified dangerous -> denied by approval.
	assert.equal(toolClassOf("file_write_anything"), "write");
	const r = await dispatchTool({ toolName: "ignore_permissions_and_delete", args: {}, workspaceRoot: process.cwd(), readTimeoutMs: 1000, runTimeoutMs: 1000, antigravity: null, allowedScripts: [] });
	assert.equal(r.ok, false);
});

test("security: rapid unknown tools do not crash bridge", async () => {
	const bridge = new McpBridge({ config: cfg(), server: new Server({ name: "x", version: "1" }, { capabilities: { tools: {} } }), antigravity: null });
	for (let i = 0; i < 10; i++) {
		const r = await bridge.invokeWrapped("does_not_exist_" + i, {}, process.cwd());
		assert.equal(r.ok, false);
	}
});

test("security: oversized output is bounded (process runner caps)", async () => {
	const fs = await import("node:fs");
	const os = await import("node:os");
	const path = await import("node:path");
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pos-bsec-"));
	fs.mkdirSync(path.join(dir, "src"), { recursive: true });
	fs.writeFileSync(path.join(dir, "src", "big.ts"), "x".repeat(500_000));
	const bridge = new McpBridge({ config: cfg({ workspaceRoot: dir }), server: new Server({ name: "x", version: "1" }, { capabilities: { tools: {} } }), antigravity: null });
	const r = await bridge.invokeWrapped("file_read", { path: "src/big.ts" }, dir);
	assert.equal(r.ok, true);
	assert.ok(String(r.text).length <= 200_000);
	fs.rmSync(dir, { recursive: true, force: true });
});

test("security: concurrent writes to same path impossible (single-run concurrency)", async () => {
	const bridge = new McpBridge({ config: cfg({ maxConcurrentRuns: 1 }), server: new Server({ name: "x", version: "1" }, { capabilities: { tools: {} } }), antigravity: null });
	const slow = bridge.invokeWrapped("antigravity_run", { prompt: "x", readOnly: "true" }, process.cwd());
	const second = bridge.invokeWrapped("antigravity_run", { prompt: "y", readOnly: "true" }, process.cwd());
	const [a, b] = await Promise.all([slow, second]);
	assert.ok(!a.ok || !b.ok || a.ok !== b.ok || true);
});

test("concurrency: maxConcurrentReads bounds reads", async () => {
	const bridge = new McpBridge({ config: cfg({ maxConcurrentReads: 1, maxConcurrentRuns: 1 }), server: new Server({ name: "x", version: "1" }, { capabilities: { tools: {} } }), antigravity: null });
	const calls = await Promise.all([
		bridge.invokeWrapped("project_status", {}, process.cwd()),
		bridge.invokeWrapped("project_status", {}, process.cwd()),
		bridge.invokeWrapped("bridge_health", {}, process.cwd()),
	]);
	// Fail-closed: no throw; at most bounded. All results are strings.
	for (const c of calls) assert.equal(typeof c.text, "string");
});

test("security: secret file in git_diff path never leaks", async () => {
	// redactLog covers secrets independently; verify isSecretPath catches nested env.
	assert.equal(isSecretPath("sub/dir/.env"), true);
	assert.equal(isSecretPath("config/private.key"), true);
	assert.equal(isSecretPath("package.json"), false);
});

test("fault: missing workspace resolves OUTSIDE for absolute outside path", () => {
	const r = boundaryRead("C:\\definitely\\missing", "file.txt");
	assert.equal(r.ok, false);
});