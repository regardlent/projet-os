/**
 * Bridge tests — config, Windows path guards, secret guards.
 */
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { bridgeConfigFromEnv, validateBridgeConfig, DEFAULT_BRIDGE_CONFIG } from "../integrations/bridge/config.js";
import { boundaryRead, boundaryWrite, hasHostilePathFragment, isSecretPath, BRIDGE_PROTECTED_DIRS } from "../integrations/bridge/WorkspaceBoundary.js";
import { redactLog } from "../integrations/bridge/AuditLogger.js";

function tempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pos-bridge-test-"));
}

test("config: defaults valid + loopback only", () => {
	const { cfg, errors } = bridgeConfigFromEnv({});
	assert.equal(errors.length, 0);
	assert.equal(cfg.host, "127.0.0.1");
	assert.ok(cfg.enabled);
});

test("config: invalid port/host rejected", () => {
	const e = validateBridgeConfig({ ...DEFAULT_BRIDGE_CONFIG, host: "0.0.0.0", port: 80 });
	assert.ok(e.some((x) => x.field === "host"));
	assert.ok(e.some((x) => x.field === "port"));
});

test("config: env overrides + fail-closed approval fallback", () => {
	const { cfg } = bridgeConfigFromEnv({ BRIDGE_PORT: "9000", BRIDGE_APPROVAL: "garbage", BRIDGE_WRITE_ENABLED: "0" });
	assert.equal(cfg.port, 9000);
	assert.equal(cfg.approvalMode, "approval-required");
	assert.equal(cfg.writeEnabled, false);
});

test("path: traversal blocked", () => {
	const root = tempDir();
	assert.equal(boundaryRead(root, "../outside.txt").ok, false);
	assert.equal(boundaryRead(root, "a/../../outside.txt").ok, false);
	fs.rmSync(root, { recursive: true, force: true });
});

test("path: hostile fragments blocked", () => {
	assert.equal(hasHostilePathFragment("..\\..\\x"), true);
	assert.equal(hasHostilePathFragment("%2e%2e/secret"), true);
	assert.equal(hasHostilePathFragment("a\0b"), true);
	assert.equal(hasHostilePathFragment("\\\\?\\C:\\x"), true);
	assert.equal(hasHostilePathFragment("\\\\.\\NUL"), true);
	assert.equal(hasHostilePathFragment("src/file.ts"), false);
});

test("path: absolute inside ok; outside blocked", () => {
	const root = tempDir();
	fs.writeFileSync(path.join(root, "a.txt"), "x");
	assert.equal(boundaryRead(root, "a.txt").ok, true);
	const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pos-bridge-out-"));
	fs.writeFileSync(path.join(outside, "o.txt"), "x");
	assert.equal(boundaryRead(root, path.join(outside, "o.txt")).ok, false);
	fs.rmSync(root, { recursive: true, force: true });
	fs.rmSync(outside, { recursive: true, force: true });
});

test("path: protected dirs + write guard", () => {
	assert.ok(BRIDGE_PROTECTED_DIRS.includes(".git"));
	const root = tempDir();
	assert.equal(boundaryWrite({ root, requested: ".git/config", op: "modify", allowedOps: ["modify"] }).ok, false);
	fs.mkdirSync(path.join(root, "src"), { recursive: true });
	assert.equal(boundaryWrite({ root, requested: "src/a.ts", op: "create", allowedOps: ["create"] }).ok, true);
	assert.equal(boundaryWrite({ root, requested: "src/a.ts", op: "delete", allowedOps: ["create", "modify"] }).ok, false);
	fs.rmSync(root, { recursive: true, force: true });
});

test("secret: env/key/credentials identified", () => {
	assert.equal(isSecretPath(".env"), true);
	assert.equal(isSecretPath(".env.production"), true);
	assert.equal(isSecretPath("id_rsa"), true);
	assert.equal(isSecretPath("credentials.json"), true);
	assert.equal(isSecretPath("src/App.ts"), false);
});

test("secret: redaction masks bearer/api/sk-/password", () => {
	const out = redactLog("Authorization: Bearer abc123 token sk-XYZ987 secret password=hunter2");
	assert.ok(!out.includes("abc123") && !out.includes("sk-XYZ987") && !out.includes("hunter2"));
	assert.ok(out.includes("***"));
});