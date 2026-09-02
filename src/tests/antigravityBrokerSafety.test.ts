import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SCRIPT = path.join(process.cwd(), "scripts", "Restart-AntigravityIDE.ps1");
const body = fs.readFileSync(SCRIPT, "utf8");

const FORBIDDEN = ["Restart-Computer", "shutdown", "logoff", "reboot", "taskkill /F", "Stop-Process -Force"];

test("broker script contains zero forbidden Windows / force-kill commands", () => {
	for (const f of FORBIDDEN) assert.ok(!body.includes(f), `broker must not contain '${f}'`);
});

test("broker detects the IDE by ExecutablePath + top-level window (no guessable ProcessName)", () => {
	assert.ok(/\.Path\s+-eq/.test(body), "must compare ExecutablePath");
	assert.ok(/MainWindowHandle\s+-ne 0/.test(body), "must require a real window handle");
	assert.ok(body.includes("CloseMainWindow"), "must use graceful close");
	assert.ok(!body.includes('Get-Process -Name "antigravityide"'), "must not depend on ProcessName 'antigravityide'");
	assert.ok(!body.includes("-Force"), "must never force-kill");
});
