/**
 * Bridge runtime — pure vs env-dependent helpers in bridgeRuntime.ts.
 * Only tests deterministic functions (cfg/lockPaths/readPid/serverEntry) to avoid
 * spawning a real server or binding the loopback port during unit tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as runtime from "../integrations/bridge/bridgeRuntime.js";

function tmpRoot(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pos-bridge-runtime-"));
}

test("runtime: cfg() falls back to fail-closed defaults on empty env", () => {
	const c = runtime.cfg({});
	assert.equal(c.host, "127.0.0.1");
	assert.equal(c.port, 8412);
	assert.equal(c.enabled, true);
	assert.equal(c.approvalMode, "approval-required");
	assert.equal(c.writeEnabled, true);
});

test("runtime: cfg() honours BRIDGE_* env (fail-closed)", () => {
	const c = runtime.cfg({ BRIDGE_HOST: "127.0.0.1", BRIDGE_PORT: "9555", BRIDGE_ENABLED: "0", BRIDGE_WRITE_ENABLED: "0" });
	assert.equal(c.port, 9555);
	assert.equal(c.enabled, false);
	assert.equal(c.writeEnabled, false);
});

test("runtime: cfg() rejects a non-loopback host by falling back to defaults", () => {
	// bridgeConfigFromEnv refuses to weaken loopback-only; falling back to defaults keeps host loopback.
	const c = runtime.cfg({ BRIDGE_HOST: "0.0.0.0" });
	// The runtime's fail-closed branch keeps a safe host (loopback).
	assert.ok(c.host === "127.0.0.1" || c.host === "localhost" || c.host === "::1");
});

test("runtime: lockPaths resolves under <controlRoot>/.project-os-cli", () => {
	const root = tmpRoot();
	const cfgVal = { ...runtime.cfg({}), controlRoot: root };
	const paths = runtime.lockPaths(cfgVal);
	assert.equal(paths.pid, path.join(root, ".project-os-cli", "bridge.pid"));
	assert.equal(paths.marker, path.join(root, ".project-os-cli", "bridge.started"));
});

test("runtime: readPid returns null when no lock, and numeric pid when present", () => {
	const root = tmpRoot();
	const cfgVal = { ...runtime.cfg({}), controlRoot: root };
	assert.equal(runtime.readPid(cfgVal), null);
	const paths = runtime.lockPaths(cfgVal);
	fs.mkdirSync(path.dirname(paths.pid), { recursive: true });
	fs.writeFileSync(paths.pid, "4242\n", "utf8");
	assert.equal(runtime.readPid(cfgVal), 4242);
});

test("runtime: serverEntry resolves the compiled dist server path", () => {
	const entry = runtime.serverEntry();
	assert.ok(entry.endsWith(path.join("dist", "integrations", "bridge", "bridge-server.js")));
	assert.ok(path.isAbsolute(entry));
});
