/**
 * Bridge HTTP E2E — real loopback server (McpHttpServer) + real SDK HTTP client.
 * Covers lifecycle (start/healthz/stop), tools/list, bridge_health call, and the
 * loopback-only bind (non-loopback host rejected).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { DEFAULT_BRIDGE_CONFIG } from "../integrations/bridge/config.js";
import { McpBridge } from "../integrations/bridge/McpBridge.js";
import { createMcpHttpServer, type McpHttpServerHandle } from "../integrations/bridge/McpHttpServer.js";

function bridge(port: number): McpBridge {
	return new McpBridge({ config: { ...DEFAULT_BRIDGE_CONFIG, port, workspaceRoot: process.cwd() }, server: new Server({ name: "http-e2e", version: "1" }, { capabilities: { tools: {} } }), antigravity: null });
}

function freePort(): Promise<number> {
	return new Promise((resolve) => {
		const s = http.createServer();
		s.listen(0, "127.0.0.1", () => {
			const p = (s.address() as { port: number }).port;
			s.close(() => resolve(p));
		});
	});
}

async function healthz(port: number): Promise<{ ok: boolean; status: number }> {
	return new Promise((resolve, reject) => {
		http.get(`http://127.0.0.1:${port}/healthz`, (res) => {
			let body = "";
			res.on("data", (c) => (body += c));
			res.on("end", () => resolve({ ok: body.includes('"ok":true'), status: res.statusCode ?? 0 }));
		}).on("error", reject);
	});
}

test("http: non-loopback host rejected (fail-closed)", () => {
	assert.throws(() => createMcpHttpServer({ bridge: bridge(8412), port: 0, host: "0.0.0.0" }), /loopback/);
});

test("http: start -> healthz ok -> tools list -> bridge_health -> stop", async () => {
	const port = await freePort();
	let handle: McpHttpServerHandle | null = null;
	try {
		handle = createMcpHttpServer({ bridge: bridge(port), port, log: () => {} });
		await handle.start();
		assert.equal(handle.isRunning(), true);
		const hz = await healthz(port);
		assert.equal(hz.ok, true);

		const client = new Client({ name: "http-e2e-client", version: "1" });
		const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
		await client.connect(transport);
		const tools = await client.listTools();
		assert.ok(tools.tools.length >= 9);
		const names = tools.tools.map((t) => t.name);
		assert.ok(names.includes("bridge_health"));
		const res = await client.callTool({ name: "bridge_health", arguments: {} });
		const c = res.content as { type: string; text: string }[];
		assert.ok(JSON.parse(c[0]?.text ?? "").projectOS);
		await client.close();
		// Allow event loop to process libuv close before tearing down the HTTP server.
		await new Promise((r) => setTimeout(r, 100));

		await handle.stop();
		assert.equal(handle.isRunning(), false);
	} finally {
		await handle?.stop();
	}
});

test("http: second start is idempotent (no double listen crash)", async () => {
	const port = await freePort();
	const handle = createMcpHttpServer({ bridge: bridge(port), port, log: () => {} });
	try {
		await handle.start();
		await handle.start(); // idempotent
		assert.equal(handle.isRunning(), true);
	} finally {
		await handle.stop();
	}
});