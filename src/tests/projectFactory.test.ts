import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { slugify, isSafeSlug, resolveChildPath } from "../projects/slug.js";
import { GoalService, makeGoal } from "../projects/GoalService.js";
import { ManagedProjectRegistry } from "../projects/ManagedProjectRegistry.js";
import { ProjectFactory } from "../projects/ProjectFactory.js";

function tmp(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pos-"));
}

test("slugify normalizes and isSafeSlug", () => {
	assert.equal(slugify("VulnForge Next"), "vulnforge-next");
	assert.equal(slugify("  My__Project  "), "my__project");
	assert.equal(isSafeSlug("vulnforge-next"), true);
	assert.equal(isSafeSlug("../etc"), false);
	assert.equal(isSafeSlug("a/b"), false);
});

test("resolveChildPath blocks traversal, absolute, reserved", () => {
	const root = path.resolve("C:/dev/projects");
	assert.equal(resolveChildPath(root, "ok-project"), path.join(root, "ok-project"));
	assert.equal(resolveChildPath(root, "../escape"), null);
	assert.equal(resolveChildPath(root, ".."), null);
	assert.equal(resolveChildPath(root, "con"), null);
	assert.equal(resolveChildPath(root, "a\\b"), null);
});

test("GoalService persists and appends history", () => {
	const d = tmp();
	const gs = new GoalService(d);
	const g = makeGoal({ projectId: "p1", objective: "Build it", acceptanceCriteria: ["works"] });
	gs.save(g);
	gs.appendHistory(g);
	const loaded = gs.load();
	assert.equal(loaded?.objective, "Build it");
	assert.equal(gs.history().length, 1);
});

test("ManagedProjectRegistry add/get/has/update", () => {
	const file = path.join(tmp(), "reg.json");
	const reg = new ManagedProjectRegistry(file);
	assert.equal(reg.list().length, 0);
	const m = {
		schemaVersion: 1,
		projectId: "id1",
		slug: "a",
		name: "A",
		createdAt: 1,
		updatedAt: 1,
		managedBy: "cline-project-os",
		controlPlaneRoot: "C:/h",
		workspaceRoot: "C:/projects/a",
		projectType: "typescript" as const,
		status: "READY" as const,
		goal: null,
		git: { initialized: false },
		addons: ["project-os-core"],
		modelProfile: {},
	};
	reg.add(m);
	assert.equal(reg.has("a"), true);
	assert.equal(reg.get("a")?.projectId, "id1");
	reg.update("a", { status: "ACTIVE" });
	assert.equal(reg.get("a")?.status, "ACTIVE");
});

test("ProjectFactory rolls back workspace when registry add fails (transactional)", async () => {
	const root = tmp();
	const file = path.join(tmp(), "reg.json");
	// A registry whose add() always throws simulates a storage failure.
	const failingRegistry = new ManagedProjectRegistry(file);
	const origAdd = failingRegistry.add.bind(failingRegistry);
	(failingRegistry as unknown as { add: (x: unknown) => void }).add = () => { throw new Error("disk full"); };
	const factory = new ProjectFactory({ projectsRoot: root, controlPlaneRoot: "C:/h" }, failingRegistry);
	const r = await factory.createProject({ name: "rollback-probe", type: "typescript", git: false });
	assert.equal(r.ok, false);
	assert.equal(r.status, "BROKEN");
	assert.match(r.message, /ROLLBACK/);
	// Workspace cleaned: no residual project directory (other than the root itself).
	const children = fs.readdirSync(root);
	assert.equal(children.filter((c) => c !== ".git").length, 0, "workspace should be rolled back");
	// Registry should not contain the project.
	assert.equal(failingRegistry.list().length, 0);
	// restore
	origAdd;
});

test("ProjectFactory creates managed project and blocks duplicate/traversal", async () => {
	const root = tmp();
	const file = path.join(tmp(), "reg.json");
	const factory = new ProjectFactory({ projectsRoot: root, controlPlaneRoot: "C:/h" }, new ManagedProjectRegistry(file));
	const r = await factory.createProject({ name: "VulnForge Next", type: "typescript", git: false });
	assert.equal(r.ok, true);
	assert.equal(r.status, "READY");
	assert.ok(r.workspaceRoot);
	assert.ok(fs.existsSync(path.join(r.workspaceRoot!, ".project-os", "project.json")));
	assert.ok(fs.existsSync(path.join(r.workspaceRoot!, ".agents", "rules")));
	// duplicate
	const dup = await factory.createProject({ name: "VulnForge Next", type: "typescript", git: false });
	assert.equal(dup.ok, false);
	assert.equal(dup.status, "BLOCKED");
	// traversal via name that slugifies to a traversal is not possible (slugify strips), but a crafted safe slug that is 'con'
	const con = await factory.createProject({ name: "con", type: "typescript", git: false });
	assert.equal(con.ok, false);
});

