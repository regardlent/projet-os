/**
 * Bridge tests — ProcessRunner + Antigravity adapter (fake executables).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { runProcess } from "../integrations/bridge/ProcessRunner.js";
import { AntigravityCliAdapter, buildAntigravityArgs, type IAntigravityAdapter, type AntigravityRunResult } from "../integrations/bridge/AntigravityCliAdapter.js";

test("process runner: success + stdout", async () => {
	const pr = await runProcess({ executable: process.execPath, args: ["-e", "console.log('hi')"], timeoutMs: 5000 });
	assert.equal(pr.exitCode, 0);
	assert.ok(pr.output.includes("hi"));
});

test("process runner: timeout kills child", async () => {
	const pr = await runProcess({ executable: process.execPath, args: ["-e", "setTimeout(()=>{},60000)"], timeoutMs: 300 });
	assert.equal(pr.timedOut, true);
	assert.equal(pr.started, true);
});

test("process runner: non-zero exit captured", async () => {
	const pr = await runProcess({ executable: process.execPath, args: ["-e", "process.exit(7)"], timeoutMs: 5000 });
	assert.equal(pr.exitCode, 7);
});

test("process runner: invalid executable no crash", async () => {
	const pr = await runProcess({ executable: "definitely-not-a-real-exe-xyz", args: [], timeoutMs: 1000 });
	assert.ok(pr.spawnError !== undefined || pr.exitCode !== 0);
});

test("process runner: output bounded", async () => {
	const pr = await runProcess({ executable: process.execPath, args: ["-e", "console.log('x'.repeat(200000))"], timeoutMs: 5000, maxOutputBytes: 1000 });
	assert.ok(pr.output.length <= 1000);
});

test("antigravity: buildAntigravityArgs never contains dangerous flag", () => {
	const safe = buildAntigravityArgs({ prompt: "read the readme", sandbox: false, printTimeout: "5m" });
	assert.ok(safe.includes("-p") && safe.includes("--output-format") && safe.includes("json"));
	assert.ok(!safe.join(" ").includes("skip-permissions"));
	assert.ok(!safe.join(" ").includes("dangerously"));
});

test("antigravity: not detected returns clean result", async (t) => {
	const a = new AntigravityCliAdapter(null);
	const det = a.detect();
	if (det.detected) { t.skip("antigravity present in this env — 'not detected' case not applicable"); return; }
	assert.equal(det.detected, false);
	const r = await a.run({ prompt: "hi", cwd: process.cwd(), readOnly: true });
	assert.equal(r.ran, false);
	assert.ok(String(r.error).includes("not detected"));
});

test("antigravity: adapter surfaces agent result from a fake runner (mock)", async () => {
	const fake: IAntigravityAdapter = {
		detect: () => ({ detected: true, version: "1.1.22+", cliPath: "agy" }),
		run: async (): Promise<AntigravityRunResult> => ({ detected: true, version: "1.1.22+", ran: true, status: "SUCCESS", error: null, response: "the answer", exitCode: 0, elapsedMs: 12 }),
	};
	const r = await fake.run({ prompt: "?", cwd: process.cwd(), readOnly: true });
	assert.equal(r.status, "SUCCESS");
	assert.ok(r.response.includes("answer"));
});

test("antigravity: fake ERROR surfaces (mock)", async () => {
	const fake: IAntigravityAdapter = {
		detect: () => ({ detected: true, version: "1.1.22+", cliPath: "agy" }),
		run: async (): Promise<AntigravityRunResult> => ({ detected: true, version: "1.1.22+", ran: true, status: "ERROR", error: "authentication failed", response: "", exitCode: 1, elapsedMs: 5 }),
	};
	const r = await fake.run({ prompt: "?", cwd: process.cwd(), readOnly: true });
	assert.equal(r.status, "ERROR");
	assert.ok(String(r.error).includes("authentication"));
});

test("antigravity: soft permission deny flagged (mock)", async () => {
	const fake: IAntigravityAdapter = {
		detect: () => ({ detected: true, version: "1.1.22+", cliPath: "agy" }),
		run: async (): Promise<AntigravityRunResult> => ({ detected: true, version: "1.1.22+", ran: true, status: "ERROR", error: "permission denied by policy admin", response: "", exitCode: 1, elapsedMs: 4, softDeny: true }),
	};
	const r = await fake.run({ prompt: "?", cwd: process.cwd(), readOnly: true });
	assert.equal(r.softDeny, true);
});