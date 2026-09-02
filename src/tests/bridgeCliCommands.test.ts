/**
 * Bridge CLI commands — /bridge module from src/commands/bridgeCommands.ts.
 * Asserts real dispatch through the SlashCommandRegistry (additive module).
 * Lifecycle sub-commands (start/stop/restart) spawn a real server, so the unit
 * tests here focus on the deterministic output shape and the static sub-commands.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SlashCommandRegistry, type SlashCommandContext } from "../projects/SlashCommands.js";
import { bridgeHandler } from "../commands/bridgeCommands.js";
import * as runtime from "../integrations/bridge/bridgeRuntime.js";

function makeCtx(): SlashCommandContext {
	return {
		factory: undefined as never,
		registry: undefined as never,
		resolveActiveProject: () => null,
	};
}

function bounded(
	name: string,
	args: string[],
	flags: Record<string, string> = {}
): Promise<import("../projects/projectTypes.js").CommandResult> {
	return bridgeHandler({ name, args, flags, raw: `/${name} ${args.join(" ")}` }, makeCtx());
}

test("bridge: /bridge no args returns usage", async () => {
	const r = await bounded("bridge", []);
	assert.equal(r.ok, true);
	assert.equal(r.status, "OK");
	assert.match(r.message, /\/bridge status/);
	assert.match(r.message, /\/bridge tunnel/);
	assert.match(r.message, /\/bridge start/);
});

test("bridge: /bridge status reports loopback config", async () => {
	const r = await bounded("bridge", ["status"]);
	assert.equal(r.ok, true);
	assert.ok(r.status === "RUNNING" || r.status === "STOPPED");
	assert.match(r.message, /8412/);
	assert.match(r.message, /streamable-http-loopback/);
	assert.match(r.message, /approval-required/);
});

test("bridge: /bridge status --format=json emits machine JSON", async () => {
	const r = await bounded("bridge", ["status"], { format: "json" });
	assert.equal(r.ok, true);
	assert.match(r.message, /"port": 8412/);
	assert.match(r.message, /"enabled": true/);
	assert.match(r.message, /"transport": "streamable-http-loopback"/);
});

test("bridge: /bridge health reports state", async () => {
	const r = await bounded("bridge", ["health"]);
	assert.ok(r.ok === true || r.ok === false);
	assert.ok(r.status === "HEALTHY" || r.status === "DOWN");
	assert.match(r.message, /projectOS/);
	assert.match(r.message, /8412/);
});

test("bridge: /bridge tools lists 10 MCP tools", async () => {
	const r = await bounded("bridge", ["tools"]);
	assert.equal(r.ok, true);
	assert.equal(r.status, "AVAILABLE");
	assert.match(r.message, /"totalTools": 10/);
	assert.match(r.message, /bridge_health/);
	assert.match(r.message, /antigravity_run/);
});

test("bridge: /bridge test reports suite status", async () => {
	const r = await bounded("bridge", ["test"]);
	assert.equal(r.ok, true);
	assert.equal(r.status, "TESTS_OK");
	assert.match(r.message, /"security": "PASS/);
});

test("bridge: /bridge tunnel returns honest status + guide", async () => {
	const r = await bounded("bridge", ["tunnel"]);
	assert.equal(r.ok, true);
	assert.ok(r.status === "TUNNEL_NOT_DETECTED" || r.status === "TUNNEL_READY");
	assert.match(r.message, /tunnel-client/);
	assert.match(r.message, /project-os/);
	assert.match(r.message, /ChatGPT/);
});

test("bridge: /bridge tunnel --init reports honest result", async () => {
	const r = await bounded("bridge", ["tunnel"], { init: "" });
	assert.equal(r.command, "bridge");
	assert.equal(typeof r.ok, "boolean");
	assert.match(r.message, /Tunnel init/);
});

test("bridge: /bridge unknown sub-command fails closed", async () => {
	const r = await bounded("bridge", ["explode"]);
	assert.equal(r.ok, false);
	assert.equal(r.status, "UNKNOWN_SUBCOMMAND");
	assert.match(r.message, /status\|start\|stop\|restart\|health\|tools\|test\|tunnel/);
});

test("bridge: lifecycle sub-commands are recognized (dispatch shape)", { skip: "spawns a real detached server on the shared loopback port 8412, which races with the parallel test suite; verified manually via `node bin/project-os-bridge.mjs /bridge start|stop`" }, async () => {
	// start/stop/restart spawn a real detached server; always clean up so no orphan
	// process binds the loopback port after the suite.
	const cfgVal = runtime.cfg({});
	try {
		for (const sub of ["start", "stop", "restart"]) {
			const r = await bounded("bridge", [sub]);
			assert.equal(r.command, "bridge");
			assert.equal(typeof r.ok, "boolean");
			assert.equal(typeof r.message, "string");
		}
	} finally {
		await runtime.stop(cfgVal);
	}
});

test("bridge: registered in SlashCommandRegistry and dispatchable", async () => {
	const slash = new SlashCommandRegistry();
	slash.register("bridge", bridgeHandler, { usage: "/bridge <sub>", description: "ChatGPT Web bridge (MCP + tunnel)" });
	assert.equal(slash.has("bridge"), true);
	const b = await slash.dispatch("/bridge tools", makeCtx());
	assert.equal(b.ok, true);
	assert.equal(b.status, "AVAILABLE");
	assert.match(b.message, /bridge_health/);
});

