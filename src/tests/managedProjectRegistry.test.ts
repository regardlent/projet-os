import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ManagedProjectRegistry } from "../projects/ManagedProjectRegistry.js";
import type { ManagedProjectManifest } from "../projects/projectTypes.js";

function manifest(slug: string, projectId: string): ManagedProjectManifest {
	return { schemaVersion: 1, projectId, slug, name: slug, createdAt: 1, updatedAt: 1, managedBy: "x", controlPlaneRoot: "r", workspaceRoot: "w", projectType: "cpp", status: "READY", goal: null, git: { initialized: false }, addons: [], modelProfile: {} };
}

test("registry: add + get + update round-trip", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reg-"));
	const file = path.join(dir, "hub.json");
	const reg = new ManagedProjectRegistry(file);
	reg.add(manifest("alpha", "p1"));
	assert.equal(reg.has("alpha"), true);
	reg.update("alpha", { status: "ACTIVE" });
	assert.equal(reg.get("alpha")?.status, "ACTIVE");
});

test("registry: remove deletes a managed project and persists", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reg-"));
	const file = path.join(dir, "hub.json");
	const reg = new ManagedProjectRegistry(file);
	reg.add(manifest("demo", "p-abc"));
	assert.equal(reg.has("demo"), true);
	assert.equal(reg.remove("demo"), true);
	assert.equal(reg.has("demo"), false);
	assert.equal(reg.remove("demo"), false);
	const reg2 = new ManagedProjectRegistry(file);
	assert.equal(reg2.has("demo"), false); // persisted removal
});
