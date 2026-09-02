import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	classifyProcess,
	validateWorkspace,
	findForbiddenWindowsCommand,
	isIdeRestartAllowed,
	CANONICAL_WORKSPACE,
	OLD_WORKSPACE_ALIAS,
} from "../workspace/AntigravityIDERestartGuard.js";

function projectRoot(): string {
	return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

test("classifyProcess only accepts Antigravity IDE", () => {
	assert.equal(classifyProcess("C:\\Apps\\AntigravityIDE.exe", "Antigravity IDE"), "ANTIGRAVITY_IDE");
	assert.equal(classifyProcess("C:\\Apps\\agywrapper.exe", "Antigravity 2.0"), "ANTIGRAVITY_2_0");
	assert.equal(classifyProcess("C:\\Apps\\Code.exe", "Visual Studio Code"), "UNRELATED");
	assert.equal(classifyProcess(""), "UNKNOWN");
});

test("validateWorkspace rejects wrong/empty/old alias, accepts canonical", () => {
	assert.equal(validateWorkspace(CANONICAL_WORKSPACE), "CANONICAL");
	assert.equal(validateWorkspace(OLD_WORKSPACE_ALIAS), "OLD_ALIAS");
	assert.equal(validateWorkspace(""), "EMPTY");
	assert.equal(validateWorkspace("C:\\elsewhere"), "WRONG");
});

test("findForbiddenWindowsCommand detects Windows restart commands", () => {
	assert.equal(findForbiddenWindowsCommand("Restart-Computer"), "Restart-Computer");
	assert.equal(findForbiddenWindowsCommand("shutdown.exe /r"), "shutdown.exe /r");
	assert.equal(findForbiddenWindowsCommand("logoff"), "logoff");
	assert.equal(findForbiddenWindowsCommand("Write-Output 'hi'"), undefined);
});

test("isIdeRestartAllowed enforces IDE-only + canonical workspace", () => {
	assert.equal(isIdeRestartAllowed("ANTIGRAVITY_IDE", CANONICAL_WORKSPACE), true);
	assert.equal(isIdeRestartAllowed("ANTIGRAVITY_2_0", CANONICAL_WORKSPACE), false);
	assert.equal(isIdeRestartAllowed("UNRELATED", CANONICAL_WORKSPACE), false);
	assert.equal(isIdeRestartAllowed("ANTIGRAVITY_IDE", OLD_WORKSPACE_ALIAS), false);
});

test("STATIC: project restart scripts contain no Windows restart command", () => {
	const scriptsDir = path.join(projectRoot(), "scripts");
	const files = fs.readdirSync(scriptsDir).filter((f) => f.endsWith(".ps1"));
	assert.ok(files.length > 0, "expected at least one restart script");
	for (const f of files) {
		const text = fs.readFileSync(path.join(scriptsDir, f), "utf8");
		const found = findForbiddenWindowsCommand(text);
		assert.equal(found, undefined, `${f} contains forbidden Windows command: ${found}`);
	}
});
