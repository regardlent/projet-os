/**
 * bridge-server.ts — standalone MCP HTTP server entrypoint.
 *
 * Usage:
 *   node dist/integrations/bridge/bridge-server.js                  (foreground)
 *   node dist/integrations/bridge/bridge-server.js --foreground     (foreground, explicit)
 *
 * Reads env config (same fail-closed rules as bridgeConfigFromEnv), writes a PID
 * lock file to `<controlRoot>/.project-os-cli/bridge.pid`, and handles
 * SIGINT/SIGTERM for a graceful shutdown. Keeps a `--no-write` guard so a
 * misconfigured host/port never binds a non-loopback interface.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import fs from "node:fs";
import path from "node:path";
import { McpBridge } from "./McpBridge.js";
import { bridgeConfigFromEnv, type BridgeConfig, type ConfigError } from "./config.js";
import { createMcpHttpServer, type McpHttpServerHandle } from "./McpHttpServer.js";
import { AntigravityCliAdapter } from "./AntigravityCliAdapter.js";

/** Resolve the config; fail-closed on invalid loopback/port. */
function resolveConfig(): { cfg: BridgeConfig; errors: ConfigError[] } {
	const { cfg, errors } = bridgeConfigFromEnv(process.env as Record<string, string | undefined>);
	return { cfg, errors };
}

/** Write the PID lock file; tolerant of missing control root. */
function writeLock(cfg: BridgeConfig, pid: number): string {
	const dir = path.join(cfg.controlRoot, ".project-os-cli");
	fs.mkdirSync(dir, { recursive: true });
	const lockPath = path.join(dir, "bridge.pid");
	fs.writeFileSync(lockPath, `${pid}\n`, "utf8");
	return lockPath;
}

async function main(): Promise<void> {
	const { cfg, errors } = resolveConfig();
	if (errors.length) {
		console.error(JSON.stringify({ ok: false, service: "project-os-bridge", error: "config", errors }));
		process.exit(2);
	}

	// Fail-closed: only loopback can ever be bound.
	if (cfg.host !== "127.0.0.1" && cfg.host !== "localhost" && cfg.host !== "::1") {
		console.error(JSON.stringify({ ok: false, service: "project-os-bridge", error: "non-loopback host blocked", host: cfg.host }));
		process.exit(3);
	}

	// Placeholder SDK server: wireMcpServer() creates the real one per POST /mcp.
	const server = new Server({ name: "project-os-bridge", version: "0.1.0" }, { capabilities: { tools: {} } });
	const antigravity = cfg.antigravityCli ? new AntigravityCliAdapter(cfg.antigravityCli) : null;
	const bridge = new McpBridge({ config: cfg, server, antigravity });
	const handle: McpHttpServerHandle = createMcpHttpServer({ bridge, port: cfg.port, host: cfg.host, log: (m) => console.error(`[bridge] ${m}`) });

	await handle.start();
	const lockPath = writeLock(cfg, process.pid);
	console.log(JSON.stringify({ ok: true, service: "project-os-bridge", host: cfg.host, port: cfg.port, pid: process.pid, lockPath }));

	let shuttingDown = false;
	const shutdown = async (sig: string) => {
		if (shuttingDown) return;
		shuttingDown = true;
		console.error(`[bridge] ${sig} received, shutting down`);
		try {
			await handle.stop();
		} finally {
			try {
				fs.rmSync(lockPath, { force: true });
			} catch {
				/* ignore */
			}
			process.exit(0);
		}
	};
	process.on("SIGINT", () => void shutdown("SIGINT"));
	process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
