import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AddonManager } from "../projects/AddonManager.js";

function tmp(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pos-"));
}

test("AddonManager install core is idempotent and stages files", () => {
	const root = tmp();
	const am = new AddonManager(root);
	const r = am.install("project-os-core");
	assert.ok(!(r as { error?: string }).error);
	assert.ok(fs.existsSync(path.join(root, ".agents", "rules", "project-scope.md")));
	assert.equal(am.list().length, 1);
	// idempotent re-install keeps single entry, re-enables
	am.disable("project-os-core");
	const re = am.install("project-os-core");
	assert.ok(!(re as { error?: string }).error);
	assert.equal(am.list().length, 1);
	assert.equal(am.get("project-os-core")?.enabled, true);
});

test("AddonManager unknown addon errors; disable/enable toggle", () => {
	const root = tmp();
	const am = new AddonManager(root);
	assert.ok((am.install("nope") as { error?: string }).error === "UNKNOWN_ADDON");
	am.install("project-os-core");
	assert.equal(am.disable("project-os-core").ok, true);
	assert.equal(am.get("project-os-core")?.enabled, false);
	assert.equal(am.enable("project-os-core").ok, true);
	assert.equal(am.get("project-os-core")?.enabled, true);
});

test("AddonManager uninstall backs up files and removes entry", () => {
	const root = tmp();
	const am = new AddonManager(root);
	am.install("project-os-core");
	assert.ok(fs.existsSync(path.join(root, ".agents", "rules", "project-scope.md")));
	const r = am.uninstall("project-os-core");
	assert.equal(r.ok, true);
	assert.equal(am.list().length, 0);
	assert.ok(!fs.existsSync(path.join(root, ".agents", "rules", "project-scope.md")));
	// backup exists under .project-os/addon-backups
	const backups = path.join(root, ".project-os", "addon-backups");
	assert.ok(fs.existsSync(backups));
});

test("AddonManager.defaultSet returns core + stack", () => {
	assert.deepEqual(AddonManager.defaultSet("typescript"), ["project-os-core", "project-os-typescript"]);
	assert.deepEqual(AddonManager.defaultSet("auto"), ["project-os-core"]);
	assert.deepEqual(AddonManager.defaultSet("cpp"), ["project-os-core", "project-os-cpp"]);
});

test("AddonManager.verifyLock reports health; detects missing staged file", () => {
	const root = tmp();
	const am = new AddonManager(root);
	am.install("project-os-core");
	const healthy = am.verifyLock();
	assert.equal(healthy.length, 1);
	assert.equal(healthy[0].addonId, "project-os-core");
	assert.equal(healthy[0].ok, true);
	assert.deepEqual(healthy[0].issues, []);
	// Delete a staged file -> verifyLock must report a finding (not auto-repair).
	fs.rmSync(path.join(root, ".agents", "rules", "project-scope.md"), { force: true });
	const unhealthy = am.verifyLock();
	assert.equal(unhealthy[0].ok, false);
	assert.ok(unhealthy[0].issues.some((i) => i.startsWith("MISSING_FILE")));
});
