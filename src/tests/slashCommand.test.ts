import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSlash, SlashCommandRegistry, goalHandler, createHandler, addonHandler, type SlashCommandContext } from "../projects/SlashCommands.js";
import { ManagedProjectRegistry } from "../projects/ManagedProjectRegistry.js";
import { ProjectFactory } from "../projects/ProjectFactory.js";

function tmp(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pos-"));
}

function makeCtx(): { ctx: SlashCommandContext; factory: ProjectFactory; registry: ManagedProjectRegistry } {
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
	return { ctx, factory, registry };
}

test("parseSlash handles args, quotes and --flags", () => {
	const p = parseSlash(`/goal --project=demo "Build a fast C++ IDE" --accept=compiles,fast --priority=high`);
	assert.equal(p?.name, "goal");
	assert.equal(p?.args.join(" "), "Build a fast C++ IDE");
	assert.equal(p?.flags["project"], "demo");
	assert.equal(p?.flags["accept"], "compiles,fast");
	assert.equal(p?.flags["priority"], "high");
	assert.equal(parseSlash("not a slash"), null);
});

test("dispatch: /create then /goal works against active managed project", async () => {
	const { ctx } = makeCtx();
	const reg = new SlashCommandRegistry();
	reg.register("goal", goalHandler);
	reg.register("create", createHandler);
	reg.register("addon", addonHandler);

	const created = await reg.dispatch(`/create demo --type=typescript --git=false`, ctx);
	assert.equal(created.ok, true);
	assert.equal(created.status, "READY");

	const goal = await reg.dispatch(`/goal "Build a fast C++ IDE" --accept=compiles,fast`, ctx);
	assert.equal(goal.ok, true);
	assert.equal(goal.status, "ACTIVE");
	assert.match(goal.message, /Goal set/);

	const addons = await reg.dispatch(`/addon list`, ctx);
	assert.equal(addons.ok, true);
	assert.match(addons.message, /project-os-core/);
});

test("dispatch: unknown command returns UNKNOWN_COMMAND", async () => {
	const { ctx } = makeCtx();
	const reg = new SlashCommandRegistry();
	reg.register("create", createHandler);
	const r = await reg.dispatch(`/nope`, ctx);
	assert.equal(r.ok, false);
	assert.equal(r.status, "UNKNOWN_COMMAND");
});

test("dispatch: /create with no name returns NAME_REQUIRED", async () => {
	const { ctx } = makeCtx();
	const reg = new SlashCommandRegistry();
	reg.register("create", createHandler);
	const r = await reg.dispatch(`/create`, ctx);
	assert.equal(r.ok, false);
	assert.equal(r.status, "NAME_REQUIRED");
});

test("describe returns help for a registered command with meta", () => {
	const reg = new SlashCommandRegistry();
	reg.register("goal", goalHandler, { usage: "/goal <objective>", description: "Set the active project goal" });
	const d = reg.describe("goal");
	assert.equal(d.length, 1);
	assert.equal(d[0].usage, "/goal <objective>");
	assert.match(d[0].description, /goal/);
});

test("unknown command suggestion lists registered commands", async () => {
	const { ctx } = makeCtx();
	const reg = new SlashCommandRegistry();
	reg.register("create", createHandler, { usage: "/create <name>", description: "Create a project" });
	reg.register("goal", goalHandler);
	const r = await reg.dispatch(`/bogus`, ctx);
	assert.equal(r.ok, false);
	assert.equal(r.status, "UNKNOWN_COMMAND");
	assert.match(r.message, /\/create/);
});
