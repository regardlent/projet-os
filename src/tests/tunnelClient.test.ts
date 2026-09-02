/**
 * Bridge tunnel client — deterministic/pure helpers + honest-status shape.
 * tunnel-client is NOT installed on this host by default, so execution-dependent
 * helpers (init/doctor/run) are only asserted for their shape, never faked as PASS.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as tunnel from "../integrations/bridge/tunnelClient.js";

test("tunnel: TUNNEL_PROFILE is project-os", () => {
	assert.equal(tunnel.TUNNEL_PROFILE, "project-os");
});

test("tunnel: localMcpUrl builds the loopback MCP endpoint from config", () => {
	const cfg = { host: "127.0.0.1", port: 8412 } as never;
	assert.equal(tunnel.localMcpUrl(cfg), "http://127.0.0.1:8412/mcp");
});

test("tunnel: localMcpUrl honours custom host/port", () => {
	const cfg = { host: "127.0.0.1", port: 9555 } as never;
	assert.equal(tunnel.localMcpUrl(cfg), "http://127.0.0.1:9555/mcp");
});

test("tunnel: findTunnelClient returns a string path or null (never throws)", async () => {
	const p = await tunnel.findTunnelClient();
	assert.ok(p === null || typeof p === "string");
});

test("tunnel: tunnelStatus returns full honest shape", async () => {
	const st = await tunnel.tunnelStatus();
	assert.equal(typeof st.detected, "boolean");
	assert.equal(st.profile, "project-os");
	assert.equal(typeof st.localServerReady, "boolean");
	assert.match(st.url, /:8412\/mcp$/);
	// mcp_url is only set when the local server is actually up.
	if (st.localServerReady) {
		assert.equal(st.mcpUrl, st.url);
	} else {
		assert.equal(st.mcpUrl, null);
	}
});

test("tunnel: runTunnel when client absent reports 'not detected' honestly", async () => {
	const cli = await tunnel.findTunnelClient();
	if (cli === null) {
		const r = await tunnel.runTunnel(["init"]);
		assert.equal(r.ok, false);
		assert.match(String(r.error), /not detected/);
	}
});
