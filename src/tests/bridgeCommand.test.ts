/**
 * Bridge integration — /bridge slash subcommands + proof that adding the bridge
 * module does NOT alter the /goal contract in the real SlashCommandRegistry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SlashCommandRegistry, goalHandler, createHandler, type SlashCommandContext } from "../projects/SlashCommands.js";
import { ManagedProjectRegistry } from "../projects/ManagedProjectRegistry.js";
import { ProjectFactory } from "../projects/ProjectFactory.js";
import { DEFAULT_BRIDGE_CONFIG } from "../integrations/bridge/config.js";
import { bridgeHandler } from "../integrations/bridge/bridgeCommand.js";

function tmp(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pos-bridge-int-"));
}

function makeCtx(): { ctx: SlashCommandContext; registry: ManagedProjectRegistry } {
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
	return { ctx, registry };
}

/** Bridge handler bound to a runtime config (bridge args/ctx tests). */
function boundedBridge(ctxWithBridge: unknown) {
	return (parsed: { args: string[]; flags: Record<string, string> }) => bridgeHandler(parsed, ctxWithBridge as never);
}

test("bridge: /bridge status lists state", async () => {
	const cfg = { ...DEFAULT_BRIDGE_CONFIG, workspaceRoot: process.cwd() };
	const r = await boundedBridge({ registry: { list: () => [], get: () => undefined }, config: cfg, antigravity: null })({ args: ["/bridge", "status"], flags: {} });
	assert.equal(r.ok, true);
	assert.ok(r.message.includes("enabled"));
});

test("bridge: /bridge doctor reports agy BLOCKED_ENV when absent (no fake PASS)", async () => {
	const cfg = { ...DEFAULT_BRIDGE_CONFIG, workspaceRoot: process.cwd() };
	const r = await boundedBridge({ registry: { list: () => [], get: () => undefined }, config: cfg, antigravity: null })({ args: ["/bridge", "doctor"], flags: {} });
	assert.ok(r.message.includes("BLOCKED_ENV"));
	assert.ok(r.message.includes("config=PASS"));
});

test("bridge: /bridge tools lists MCP tools; unknown subcommand fails closed", async () => {
	const cfg = { ...DEFAULT_BRIDGE_CONFIG, workspaceRoot: process.cwd() };
	const args = { registry: { list: () => [], get: () => undefined }, config: cfg, antigravity: null };
	const tools = await boundedBridge(args)({ args: ["/bridge", "tools"], flags: {} });
	assert.ok(tools.message.includes("bridge_health"));
	assert.ok(tools.message.includes("antigravity_run"));
	const bad = await boundedBridge(args)({ args: ["/bridge", "explode"], flags: {} });
	assert.equal(bad.ok, false);
	assert.equal(bad.status, "UNKNOWN_SUBCOMMAND");
});

test("bridge: /goal contract preserved with bridge registered (integration)", async () => {
	const { ctx } = makeCtx();
	const slash = new SlashCommandRegistry();
	slash.register("goal", goalHandler);
	slash.register("create", createHandler);
	slash.register("bridge", boundedBridge({ registry: ctx.registry, config: { ...DEFAULT_BRIDGE_CONFIG, workspaceRoot: process.cwd() }, antigravity: null }));
	const create = await slash.dispatch("/create lang-sandbox-flow --git=false", ctx);
	assert.equal(create.ok, true);
	const g = await slash.dispatch("/goal --objective \"bridge must not break goal\" --priority=normal", ctx);
	assert.equal(g.ok, true);
	assert.equal(g.status, "ACTIVE");
	const b = await slash.dispatch("/bridge tools", ctx);
	assert.equal(b.ok, true);
});