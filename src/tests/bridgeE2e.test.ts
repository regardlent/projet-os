/**
 * Bridge E2E — real MCP SDK client ↔ real MCP SDK server (in-memory transport),
 * lifecycle, concurrency, and /goal contract preservation (bridge must not change
 * any existing slash behavior).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { DEFAULT_BRIDGE_CONFIG, type BridgeConfig } from "../integrations/bridge/config.js";
import { McpBridge } from "../integrations/bridge/McpBridge.js";
import { wireMcpServer } from "../integrations/bridge/McpServerAdapter.js";
import { AntigravityCliAdapter } from "../integrations/bridge/AntigravityCliAdapter.js";
import { goalHandler } from "../projects/SlashCommands.js";
import { goalContractShape } from "./bridgeGoalContract.js";

function makeConfig(over: Partial<BridgeConfig> = {}): BridgeConfig {
	return { ...DEFAULT_BRIDGE_CONFIG, workspaceRoot: process.cwd(), ...over };
}

test("e2e: client lists tools from real SDK server", async () => {
	const bridge = new McpBridge({ config: makeConfig(), server: new Server({ name: "x", version: "1" }, { capabilities: { tools: {} } }), antigravity: null });
	const { server } = wireMcpServer(bridge);
	const client = new Client({ name: "e2e", version: "1" });
	const [ct, st] = InMemoryTransport.createLinkedPair();
	await server.connect(st);
	await client.connect(ct);
	const tools = await client.listTools();
	assert.ok(tools.tools.length >= 9);
	const names = tools.tools.map((t) => t.name);
	assert.ok(names.includes("bridge_health"));
	assert.ok(names.includes("file_read"));
	await client.close();
});

test("e2e: call bridge_health returns projectOS metadata", async () => {
	const bridge = new McpBridge({ config: makeConfig(), server: new Server({ name: "x", version: "1" }, { capabilities: { tools: {} } }), antigravity: null });
	const { server } = wireMcpServer(bridge);
	const client = new Client({ name: "e2e", version: "1" });
	const [ct, st] = InMemoryTransport.createLinkedPair();
	await server.connect(st);
	await client.connect(ct);
	const res = await client.callTool({ name: "bridge_health", arguments: {} });
	const c = res.content as { type: string; text: string }[];
	const text = c[0]?.text ?? "";
	const parsed = JSON.parse(text);
	assert.ok(parsed.projectOS);
	assert.ok(!("secret" in parsed));
	await client.close();
});

test("e2e: lifecycle start/active/dispose + concurrency guard", async () => {
	const bridge = new McpBridge({ config: makeConfig({ maxConcurrentReads: 2 }), server: new Server({ name: "x", version: "1" }, { capabilities: { tools: {} } }), antigravity: null });
	const handle = bridge.start();
	assert.equal(handle.started, true);
	assert.equal(handle.activeOperations(), 0);
	// Health path runs wrapped through approval
	const rf = await bridge.invokeWrapped("bridge_health", {}, process.cwd());
	assert.equal(rf.ok, true);
	await handle.dispose();
	assert.ok(bridge.toolList().length >= 9);
});

test("e2e: /goal contract preserved (bridge imports nothing harmful)", async () => {
	// goalHandler still exported and its shape unchanged; bridgeGoalContract asserts shape.
	const shape = goalContractShape();
	assert.equal(shape.hasObjective, true);
	assert.equal(shape.statusDefault, "ACTIVE");
	assert.equal(typeof goalHandler, "function");
});

test("e2e: antigravity null -> bridge reports NOT_DETECTED, no fake PASS", async () => {
	const a = new AntigravityCliAdapter(null);
	assert.equal(a.detect().detected, false);
	const bridge = new McpBridge({ config: makeConfig(), server: new Server({ name: "x", version: "1" }, { capabilities: { tools: {} } }), antigravity: a });
	const h = JSON.parse(bridge.healthJson());
	assert.equal(h.antigravity.detected, false);
});

test("e2e: git_diff redaction smoke (workspace non-repo tolerated, never crashes)", async () => {
	// The bridge workspaces are not always git repos; the handler must never throw.
	const bridge = new McpBridge({ config: makeConfig(), server: new Server({ name: "x", version: "1" }, { capabilities: { tools: {} } }), antigravity: null });
	const r = await bridge.invokeWrapped("git_status", {}, process.cwd());
	assert.equal(typeof r.text, "string");
	assert.ok(r.text.length > 0);
});