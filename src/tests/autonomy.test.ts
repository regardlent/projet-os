import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveAutonomyMinutes, buildAutonomyPlan, summarizeAutonomy } from "../projects/autonomy.js";
import { guardPath, safeReadFiles, safeSearch } from "../projects/workspaceGuard.js";
import { SlashCommandRegistry, goalHandler, createHandler, autonomyHandler, type SlashCommandContext } from "../projects/SlashCommands.js";
import { ManagedProjectRegistry } from "../projects/ManagedProjectRegistry.js";
import { ProjectFactory } from "../projects/ProjectFactory.js";

function tmp(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pos-"));
}

test("resolveAutonomyMinutes: explicit + auto scales with complexity", () => {
	assert.equal(resolveAutonomyMinutes({ complexity: "small", projectType: "typescript", goal: "fix bug", fileCount: 5 }), 15);
	assert.equal(resolveAutonomyMinutes({ complexity: "medium", projectType: "typescript", goal: "x", fileCount: 5 }), 45);
	assert.equal(resolveAutonomyMinutes({ complexity: "large", projectType: "typescript", goal: "x", fileCount: 5 }), 120);
	const simple = resolveAutonomyMinutes({ complexity: "auto", projectType: "typescript", goal: "fix typo", fileCount: 4 });
	const complex = resolveAutonomyMinutes({ complexity: "auto", projectType: "cpp", goal: "refactor multi service platform", fileCount: 120 });
	assert.ok(complex > simple);
	assert.ok(complex >= 120);
});

test("buildAutonomyPlan sets deadline + checkpoints", () => {
	const plan = buildAutonomyPlan({ projectId: "p", goalId: "g", objective: "Build an IDE", projectType: "cpp", minutes: 60, complexity: "medium", now: 1000 });
	assert.equal(plan.deadline, 1000 + 60 * 60_000);
	assert.equal(plan.minutes, 60);
	assert.ok(plan.steps.length >= 3);
	assert.equal(plan.checkpointEveryMinutes, 15);
});

test("summarizeAutonomy returns markdown with activity", () => {
	const plan = buildAutonomyPlan({ projectId: "p", goalId: "g", objective: "Build", projectType: "cpp", minutes: 30, complexity: "small" });
	const s = summarizeAutonomy(plan, [{ phase: "bootstrap", note: "done" }]);
	assert.match(s, /AUTONOMY SUMMARY/);
	assert.match(s, /bootstrap: done/);
});

test("/autonomy dispatch creates plan + handoff after a goal", async () => {
	const root = tmp();
	const registry = new ManagedProjectRegistry(path.join(tmp(), "reg.json"));
	const factory = new ProjectFactory({ projectsRoot: root, controlPlaneRoot: "C:/h" }, registry);
	const ctx: SlashCommandContext = {
		factory,
		registry,
		resolveActiveProject: () => {
			const list = registry.list();
			if (!list.length) return null;
			const m = list[list.length - 1];
			return { slug: m.slug, projectId: m.projectId, workspaceRoot: m.workspaceRoot };
		},
	};
	const slash = new SlashCommandRegistry();
	slash.register("goal", goalHandler);
	slash.register("create", createHandler);
	slash.register("autonomy", autonomyHandler);

	await slash.dispatch(`/create demo --type=typescript --git=false`, ctx);
	await slash.dispatch(`/goal "Build a small validator"`, ctx);
	const r = await slash.dispatch(`/autonomy --complexity=medium`, ctx);
	assert.equal(r.ok, true);
	assert.equal(r.status, "PLANNED");
	assert.match(r.message, /min/);
	const ws = registry.get("demo")?.workspaceRoot!;
	assert.ok(fs.existsSync(path.join(ws, ".project-os", "autonomy.json")));
	assert.ok(fs.existsSync(path.join(ws, ".project-os", "handoff.md")));
});

test("/autonomy summary after plan returns SUMMARY", async () => {
	const root = tmp();
	const registry = new ManagedProjectRegistry(path.join(tmp(), "reg.json"));
	const factory = new ProjectFactory({ projectsRoot: root, controlPlaneRoot: "C:/h" }, registry);
	const ctx: SlashCommandContext = {
		factory,
		registry,
		resolveActiveProject: () => {
			const list = registry.list();
			if (!list.length) return null;
			const m = list[list.length - 1];
			return { slug: m.slug, projectId: m.projectId, workspaceRoot: m.workspaceRoot };
		},
	};
	const slash = new SlashCommandRegistry();
	slash.register("goal", goalHandler);
	slash.register("create", createHandler);
	slash.register("autonomy", autonomyHandler);
	await slash.dispatch(`/create demo --type=typescript --git=false`, ctx);
	await slash.dispatch(`/goal "Build a validator"`, ctx);
	await slash.dispatch(`/autonomy --complexity=small`, ctx);
	const r = await slash.dispatch(`/autonomy summary`, ctx);
	assert.equal(r.ok, true);
	assert.equal(r.status, "SUMMARY");
	assert.match(r.message, /AUTONOMY SUMMARY/);
});

test("workspaceGuard blocks escape and reads within root", () => {
	const root = tmp();
	fs.writeFileSync(path.join(root, "a.txt"), "hello");
	assert.ok(fs.existsSync(guardPath(root, "a.txt")!));
	assert.equal(guardPath(root, "../escape"), null);
	fs.mkdirSync(path.join(root, "sub"));
	fs.writeFileSync(path.join(root, "sub", "b.txt"), "x");
	const r = safeReadFiles(root, ["sub/b.txt", "../escape", "/etc/passwd"]);
	assert.match(r.content, /b\.txt/);
	assert.deepEqual(r.skip.sort(), ["../escape", "/etc/passwd"].sort());
});

test("workspaceGuard safeSearch finds matches and skips ignore dirs", () => {
	const root = tmp();
	fs.writeFileSync(path.join(root, "src.ts"), "const TOKEN=1;");
	fs.mkdirSync(path.join(root, "node_modules"));
	fs.writeFileSync(path.join(root, "node_modules", "x.js"), "const TOKEN=2;");
	const hits = safeSearch(root, "TOKEN", 50);
	assert.ok(hits.includes("src.ts"));
	assert.ok(!hits.some((h) => h.includes("node_modules")));
});
