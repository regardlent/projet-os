import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ManagedProjectRegistry } from "../projects/ManagedProjectRegistry.js";
import { ProjectFactory } from "../projects/ProjectFactory.js";
import { SlashCommandRegistry, createHandler, todoHandler, type SlashCommandContext } from "../projects/SlashCommands.js";

test("todoHandler: /create seeds TODO, /todo list shows it, done strikes it", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pos-"));
	const registry = new ManagedProjectRegistry(path.join(root, ".hub.json"));
	const factory = new ProjectFactory({ projectsRoot: root, controlPlaneRoot: root }, registry);
	const slash = new SlashCommandRegistry();
	slash.register("create", createHandler);
	slash.register("todo", todoHandler);
	const ctx: SlashCommandContext = { factory, registry, resolveActiveProject: () => { const l = registry.list(); return l.length ? { slug: l[l.length - 1].slug, projectId: l[l.length - 1].projectId, workspaceRoot: l[l.length - 1].workspaceRoot } : null; } };

	const c = await slash.dispatch(`/create demo-project --type=empty --git=false --goal="Build something"`, ctx);
	assert.equal(c.ok, true);
	assert.ok(c.artifacts?.includes(".project-os/todo.json"));

	const list = await slash.dispatch(`/todo list`, ctx);
	assert.ok(list.message.includes("[x] ~Scaffold project (create)~"));

	const done = await slash.dispatch(`/todo done implement`, ctx);
	assert.ok(done.message.includes("[x] ~Implement: Build something~"));
	assert.ok(done.message.includes("Progress"));
});
