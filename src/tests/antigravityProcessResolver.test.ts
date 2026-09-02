import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTopLevelWindow, buildProcessTrees, type AntigravityProcessInfo } from "../workspace/AntigravityProcessResolver.js";

const EXE = "C:\\Users\\eiden\\AppData\\Local\\Programs\\Antigravity IDE\\Antigravity IDE.exe";
const CANON = "C:\\Users\\eiden\\Desktop\\dev\\projet-os";

function proc(pid: number, ppid: number, o: Partial<AntigravityProcessInfo> = {}): AntigravityProcessInfo {
	return { pid, ppid, exe: o.exe ?? EXE, cmdline: o.cmdline ?? `"${EXE}"`, windowHandle: o.windowHandle ?? 0, windowTitle: o.windowTitle ?? "", startTime: o.startTime ?? 1 };
}

test("one IDE + 15 Electron children => SELECT single window (not 15 instances)", () => {
	const procs = [proc(100, 0, { windowHandle: 1, windowTitle: "projet-os - Antigravity IDE" })];
	for (let i = 0; i < 15; i++) procs.push(proc(200 + i, 100, { cmdline: `"${EXE}" --type=renderer` }));
	const r = resolveTopLevelWindow(procs, { executablePath: EXE, canonicalWorkspace: CANON, workspaceOf: () => "CANONICAL" });
	assert.equal(r.status, "SELECT");
	assert.equal(r.pid, 100);
	assert.equal(r.ambiguity, false);
	assert.equal(buildProcessTrees(procs, EXE).size, 1);
});

test("two IDE windows => workspace-aware selection, else ambiguous BLOCK", () => {
	const procs = [
		proc(100, 0, { windowHandle: 1, windowTitle: "projet-os - Antigravity IDE" }),
		proc(200, 0, { windowHandle: 2, windowTitle: "other - Antigravity IDE" }),
	];
	const r = resolveTopLevelWindow(procs, { executablePath: EXE, canonicalWorkspace: CANON, workspaceOf: (pid) => (pid === 100 ? "CANONICAL" : "OTHER") });
	assert.equal(r.status, "SELECT");
	assert.equal(r.pid, 100);
	const amb = resolveTopLevelWindow(procs, { executablePath: EXE, canonicalWorkspace: CANON, workspaceOf: () => "UNKNOWN" });
	assert.equal(amb.status, "AMBIGUOUS");
	assert.equal(amb.ambiguity, true);
});

test("missing exe => NOT_FOUND ; wrong workspace => WEAK", () => {
	const none = resolveTopLevelWindow([], { executablePath: EXE, canonicalWorkspace: CANON, workspaceOf: () => "UNKNOWN" });
	assert.equal(none.status, "NOT_FOUND");
	const wrong = resolveTopLevelWindow([proc(100, 0, { windowHandle: 1, windowTitle: "x" })], { executablePath: EXE, canonicalWorkspace: CANON, workspaceOf: () => "OTHER" });
	assert.equal(wrong.status, "SELECT");
	assert.equal(wrong.confidence, "WEAK");
});
