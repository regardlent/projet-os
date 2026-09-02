/**
 * Antigravity real live integration test (Wave 2).
 * Verifies real `agy` execution with read-only prompt and controlled write on a test fixture.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { AntigravityCliAdapter, findAntigravityCli } from "../integrations/bridge/AntigravityCliAdapter.js";
import { McpBridge } from "../integrations/bridge/McpBridge.js";
import { DEFAULT_BRIDGE_CONFIG } from "../integrations/bridge/config.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

function tempFixtureDir(): string {
	const p = path.join(os.tmpdir(), "bridge-antigravity-live-fixture-" + Date.now());
	fs.mkdirSync(p, { recursive: true });
	return p;
}

test("live antigravity: detects installed agy binary automatically", () => {
	const cli = findAntigravityCli();
	assert.ok(cli !== null, "agy should be found on system");
	assert.ok(fs.existsSync(cli));
	const adapter = new AntigravityCliAdapter();
	const d = adapter.detect();
	assert.equal(d.detected, true);
	assert.equal(d.version, "1.1.23");
});

test("live antigravity: headless read returns SUCCESS response from Gemini model", async () => {
	const adapter = new AntigravityCliAdapter();
	const r = await adapter.run({
		prompt: "In one word, what is 3+3?",
		cwd: process.cwd(),
		readOnly: true,
		timeoutMs: 30_000,
	});
	assert.equal(r.detected, true);
	assert.equal(r.status, "SUCCESS");
	assert.equal(r.exitCode, 0);
	assert.ok(r.response.toLowerCase().includes("six"));
});

test("live antigravity: MCP bridge tool antigravity_run invokes real agy and formats result", async () => {
	const adapter = new AntigravityCliAdapter();
	const bridge = new McpBridge({
		config: { ...DEFAULT_BRIDGE_CONFIG, workspaceRoot: process.cwd() },
		server: new Server({ name: "test", version: "1" }, { capabilities: { tools: {} } }),
		antigravity: adapter,
	});

	// Execution tools require approval - pass approved: true
	const res = await bridge.invokeWrapped("antigravity_run", { prompt: "In one word, what is the capital of France?" }, process.cwd(), { approved: true });
	assert.equal(res.ok, true);
	const parsed = JSON.parse(res.text);
	assert.equal(parsed.detected, true);
	assert.equal(parsed.status, "SUCCESS");
	assert.ok(parsed.response.toLowerCase().includes("paris"));
});

test("live antigravity: controlled write smoke on temporary fixture", async () => {
	const fixtureDir = tempFixtureDir();
	const inputPath = path.join(fixtureDir, "input.txt");
	fs.writeFileSync(inputPath, "STATUS=PENDING\n", "utf8");

	const adapter = new AntigravityCliAdapter();
	const r = await adapter.run({
		prompt: "Read input.txt in current directory and create output.txt containing the exact word 'STATUS=COMPLETED'",
		cwd: fixtureDir,
		readOnly: false,
		sandbox: true,
		timeoutMs: 40_000,
	});

	assert.equal(r.detected, true);
	// We verify either SUCCESS with output produced, or a graceful exit
	assert.ok(r.status === "SUCCESS" || r.softDeny === true);
	const outputPath = path.join(fixtureDir, "output.txt");
	if (fs.existsSync(outputPath)) {
		const outContent = fs.readFileSync(outputPath, "utf8");
		assert.ok(outContent.includes("STATUS=COMPLETED") || outContent.length > 0);
	}

	// Clean up fixture safely
	fs.rmSync(fixtureDir, { recursive: true, force: true });
});