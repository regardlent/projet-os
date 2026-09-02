#!/usr/bin/env node
/**
 * bridge-local.mjs — one-command control for the Project-OS MCP bridge (no-auth, Mode A).
 *
 * Usage:
 *   node scripts/bridge-local.mjs            # start + verify tools/list (leaves it running)
 *   node scripts/bridge-local.mjs start      # start + wait ready + show endpoint
 *   node scripts/bridge-local.mjs once       # start -> verify -> stop (CI / demo)
 *   node scripts/bridge-local.mjs status     # show running state + tools count
 *   node scripts/bridge-local.mjs stop       # stop + cleanup + confirm port freed
 *   node scripts/bridge-local.mjs tunnel     # show tunnel status (detected? / local up?)
 *
 * Only talks to the local loopback bridge; never touches the OpenAI control plane.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);

// Compiled modules (dist must exist via `npm run compile`).
const { cfg, start, stop, health, isRunning } = await load("dist/integrations/bridge/bridgeRuntime.js");
const { localMcpUrl, tunnelStatus } = await load("dist/integrations/bridge/tunnelClient.js");

const CFG = cfg();
const MCP_URL = localMcpUrl(CFG);
const HEALTH_URL = `http://${CFG.host}:${CFG.port}/healthz`;

/** POST /mcp tools/list (no auth) -> number of tools, or -1 on failure. */
async function mcpToolsCount() {
	try {
		const body = { jsonrpc: "2.0", id: 1, method: "tools/list" };
		const r = await fetch(MCP_URL, {
			method: "POST",
			headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
			body: JSON.stringify(body),
		});
		const text = await r.text();
		const json = text.match(/\{[\s\S]*\}/)?.[0];
		if (!json) return -1;
		return (JSON.parse(json).result?.tools?.length) ?? -1;
	} catch {
		return -1;
	}
}

/** Wait for the local /healthz to answer (readiness). */
async function waitReady(timeoutMs = 4000) {
	const startMs = Date.now();
	while (Date.now() - startMs < timeoutMs) {
		try {
			const r = await fetch(HEALTH_URL);
			if (r.ok) return true;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 120));
	}
	return false;
}

const cmd = process.argv[2] ?? "start";

if (cmd === "start" || cmd === undefined) {
	const already = await isRunning(CFG);
	if (already.running) {
		console.log(`[bridge-local] already running (pid=${already.pid})`);
	} else {
		const s = await start(CFG);
		if (!s.started) {
			console.error(`[bridge-local] start failed: ${s.error}`);
			process.exit(1);
		}
		console.log(`[bridge-local] started (pid=${s.pid})`);
	}
	const ready = await waitReady();
	if (!ready) {
		console.error(`[bridge-local] server did not become ready on ${HEALTH_URL}`);
		process.exit(1);
	}
	const tools = await mcpToolsCount();
	console.log(`[bridge-local] ${HEALTH_URL}  -> ok`);
	console.log(`[bridge-local] ${MCP_URL}  -> tools/list = ${tools >= 0 ? tools : "parse-error"}`);
	console.log(`[bridge-local] running on ${CFG.host}:${CFG.port} (no auth). Stop with: node scripts/bridge-local.mjs stop`);
} else if (cmd === "once") {
	const s = await start(CFG);
	if (!s.started) {
		console.error(`[bridge-local] once: start failed: ${s.error}`);
		process.exit(1);
	}
	await waitReady();
	const tools = await mcpToolsCount();
	console.log(`[bridge-local] once: started pid=${s.pid}, tools/list = ${tools}`);
	const st = await stop(CFG);
	console.log(`[bridge-local] once: stopped (${st.stopped ? "ok" : st.error})`);
	const h = await isRunning(CFG);
	console.log(`[bridge-local] once: running=${h.running}`);
} else if (cmd === "stop") {
	const h = await isRunning(CFG);
	if (!h.running) {
		console.log("[bridge-local] not running");
	} else {
		const st = await stop(CFG);
		console.log(`[bridge-local] stopped (pid=${h.pid}: ${st.stopped ? "ok" : st.error})`);
	}
	const after = await isRunning(CFG);
	console.log(`[bridge-local] running=${after.running}`);
} else if (cmd === "status") {
	const h = await isRunning(CFG);
	const state = h.running ? "RUNNING" : "STOPPED";
	console.log(`[bridge-local] service=project-os-bridge host=${CFG.host} port=${CFG.port} state=${state} pid=${h.pid ?? "n/a"}`);
	if (h.running) {
		const tools = await mcpToolsCount();
		console.log(`[bridge-local] ${MCP_URL} -> tools/list = ${tools >= 0 ? tools : "parse-error"}`);
	}
} else if (cmd === "tunnel") {
	const t = await tunnelStatus();
	console.log(`[bridge-local] tunnel profile=${t.profile} cli=${t.detected ? `detected (${t.cliPath})` : "NOT_DETECTED"} localUp=${t.localServerReady} mcp_url=${t.mcpUrl ?? "n/a"}`);
} else {
	console.error(
		`[bridge-local] unknown command "${cmd}"\n` +
			"Usage: node scripts/bridge-local.mjs [start|once|stop|status|tunnel]\n"
	);
	process.exit(2);
}
