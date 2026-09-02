/**
 * McpHttpServer — real loopback HTTP server for the Project-OS MCP bridge.
 * Uses the official SDK createMcpExpressApp() pattern (stateless streamable HTTP).
 * Binds ONLY loopback (127.0.0.1) with DNS-rebinding protection.
 * Exposes:
 *   POST /mcp   -> MCP streamable-http endpoint (stateless, per-request server+transport)
 *   GET /healthz -> JSON health (no secrets)
 * Lifecycle: start()/stop()/isRunning() with graceful close.
 */
import type { Server as HttpServer, IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { McpBridge } from "./McpBridge.js";
import { wireMcpServer } from "./McpServerAdapter.js";

export interface McpHttpServerOptions {
	bridge: McpBridge;
	port: number;
	host?: string; // loopback only
	log?: (msg: string) => void;
}

export interface McpHttpServerHandle {
	host: string;
	port: number;
	isRunning(): boolean;
	start(): Promise<void>;
	stop(): Promise<void>;
	health(): { ok: boolean; service: string; port: number; running: boolean };
}

// Minimal type signature for untyped Express req/res
type ExpressReq = IncomingMessage & { body?: unknown };
type ExpressRes = ServerResponse & {
	json: (body: unknown) => void;
	status: (code: number) => ExpressRes;
};

export function createMcpHttpServer(opts: McpHttpServerOptions): McpHttpServerHandle {
	const host = opts.host ?? "127.0.0.1";
	if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") {
		throw new Error(`McpHttpServer: host must be loopback (got '${host}')`);
	}

	// Official pattern: createMcpExpressApp applies DNS-rebinding protection for loopback.
	const app = createMcpExpressApp({ host: host === "::1" ? "::1" : "127.0.0.1" });
	const log = opts.log ?? (() => {});
	let running = false;
	let httpServer: HttpServer | null = null;

	app.get("/healthz", (_req: ExpressReq, res: ExpressRes) => {
		res.json({ ok: true, service: "project-os-bridge", port: opts.port, running });
	});
	app.get("/health", (_req: ExpressReq, res: ExpressRes) => {
		res.json({ ok: true, service: "project-os-bridge", port: opts.port, running });
	});

	// Official stateless streamable HTTP endpoint: fresh server + transport per POST.
	app.post("/mcp", async (req: ExpressReq, res: ExpressRes) => {
		const { server } = wireMcpServer(opts.bridge);
		try {
			const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
			await server.connect(transport);
			await transport.handleRequest(req, res, req.body);
			res.on("close", () => {
				try {
					transport.close();
				} catch {}
				try {
					server.close();
				} catch {}
			});
		} catch (err) {
			log(`mcp error: ${err instanceof Error ? err.message : String(err)}`);
			if (!res.headersSent) {
				res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
			}
		}
	});

	return {
		host,
		port: opts.port,
		isRunning: () => running,
		health: () => ({ ok: running, service: "project-os-bridge", port: opts.port, running }),
		start: () =>
			new Promise<void>((resolve, reject) => {
				if (running) return resolve();
				const serverInstance = app.listen(opts.port, host === "::1" ? "::1" : "127.0.0.1", () => {
					running = true;
					log(`mcp http listening on ${host}:${opts.port}`);
					resolve();
				});
				httpServer = serverInstance;
				serverInstance.once("error", reject);
			}),
		stop: () =>
			new Promise<void>((resolve) => {
				if (!running || !httpServer) return resolve();
				const current = httpServer;
				current.close(() => {
					running = false;
					log("mcp http stopped");
					resolve();
				});
			}),
	};
}