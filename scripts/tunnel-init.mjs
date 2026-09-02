#!/usr/bin/env node
/**
 * tunnel-init.mjs — orchestrate the OpenAI Secure MCP Tunnel for Project-OS.
 *
 * SECURITY: reads EVERYTHING from environment variables. NEVER writes, prints, or
 * commits any secret. Secrets are only tested for presence (boolean), never echoed.
 *
 * Environment variables:
 *   PROJECT_OS_TUNNEL_ID      tunnel id from Platform -> Organization -> Tunnels
 *   CONTROL_PLANE_API_KEY     runtime control-plane key (org-level, runtime keys)
 *   OPENAI_ADMIN_KEY          admin key (only needed for `create`)
 *   PROJECT_OS_ORG_ID         org id (only needed for `create`)
 *   PROJECT_OS_WS_ID          workspace id (only needed for `create`)
 *
 * Usage:
 *   node scripts/tunnel-init.mjs status   # honest status + mcp_url
 *   node scripts/tunnel-init.mjs doctor   # validate profile (needs server running)
 *   node scripts/tunnel-init.mjs create   # admin tunnels create (needs admin key + org/ws id)
 *   node scripts/tunnel-init.mjs init     # init project-os profile (needs tunnel id + control-plane key)
 *   node scripts/tunnel-init.mjs all      # create -> init -> doctor -> status
 *   node scripts/tunnel-init.mjs run      # run tunnel-client (foreground, Ctrl+C to stop)
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);

const tunnel = await load("dist/integrations/bridge/tunnelClient.js");

/** Presence check only — NEVER reveals the value. */
const present = (k) => Boolean(process.env[k] && process.env[k].length > 0);
const masked = (k) => (present(k) ? "set (masked)" : "MISSING");

const cmd = process.argv[2] ?? "status";

async function cmdStatus() {
	const t = await tunnel.tunnelStatus();
	const lines = [
		"Secure MCP Tunnel — Project-OS",
		`Profile      : ${t.profile}`,
		`Local MCP    : ${t.url}`,
		`Local up     : ${t.localServerReady ? "YES" : "NO (run npm run bridge:local first)"}`,
		`tunnel-cli   : ${t.detected ? `detected (${t.cliPath}) ${t.version ?? ""}`.trim() : "NOT_DETECTED"}`,
		`mcp_url      : ${t.mcpUrl ?? "n/a (server down)"}`,
		"",
		"Env (secrets masked):",
		`  PROJECT_OS_TUNNEL_ID    : ${masked("PROJECT_OS_TUNNEL_ID")}`,
		`  CONTROL_PLANE_API_KEY   : ${masked("CONTROL_PLANE_API_KEY")}`,
		`  OPENAI_ADMIN_KEY        : ${masked("OPENAI_ADMIN_KEY")}`,
		`  PROJECT_OS_ORG_ID       : ${masked("PROJECT_OS_ORG_ID")}`,
		`  PROJECT_OS_WS_ID        : ${masked("PROJECT_OS_WS_ID")}`,
		"",
		"Commands: create | init | doctor | run | all",
	];
	process.stdout.write(lines.join("\n") + "\n");
}

async function cmdDoctor() {
	const d = await tunnel.doctor();
	if (d.error) {
		process.stderr.write(`doctor: ${d.error}\n`);
		process.exit(1);
	}
	process.stdout.write(`doctor OK (profile=${tunnel.TUNNEL_PROFILE})\n${d.output.slice(0, 12000)}\n`);
}

async function cmdCreate() {
	if (!present("OPENAI_ADMIN_KEY")) {
		process.stderr.write("create: OPENAI_ADMIN_KEY not set (Platform -> Organization -> Admin Keys).\n");
		process.exit(1);
	}
	if (!present("PROJECT_OS_ORG_ID") && !present("PROJECT_OS_WS_ID")) {
		process.stderr.write("create: need PROJECT_OS_ORG_ID and/or PROJECT_OS_WS_ID (Platform -> Organization).\n");
		process.exit(1);
	}
	const c = await tunnel.adminTunnelsCreate();
	process.stdout.write(`create: ${c.ok ? "OK" : "failed"}\n`);
	if (c.tunnelId) process.stdout.write(`tunnel id : ${c.tunnelId}\n`);
	if (c.mcpUrl) process.stdout.write(`mcp_url   : ${c.mcpUrl}\n`);
	if (c.output) process.stdout.write(c.output.slice(0, 6000) + "\n");
	if (c.error) process.stderr.write(c.error + "\n");
	// Suggest to persist the tunnel id for the next steps.
	if (c.tunnelId) {
		process.stdout.write(`\nSet:  $env:PROJECT_OS_TUNNEL_ID = "${c.tunnelId}"   # then run: init\n`);
	}
}

async function cmdInit() {
	if (!present("PROJECT_OS_TUNNEL_ID")) {
		process.stderr.write("init: PROJECT_OS_TUNNEL_ID not set. Create a tunnel first (Platform -> Organization -> Tunnels) or run `create`.\n");
		process.exit(1);
	}
	if (!present("CONTROL_PLANE_API_KEY")) {
		process.stderr.write("init: CONTROL_PLANE_API_KEY not set (Platform -> Organization -> Runtime API Keys).\n");
		process.exit(1);
	}
	const i = await tunnel.initProfile();
	process.stdout.write(`init: ${i.ok ? "OK" : "failed"}\n`);
	if (i.output) process.stdout.write(i.output.slice(0, 6000) + "\n");
	if (i.stderr) process.stderr.write(i.stderr.slice(0, 6000) + "\n");
	if (i.error) process.stderr.write(i.error + "\n");
}

async function cmdRun() {
	const r = await tunnel.run();
	process.stdout.write(`run: ${r.ok ? "started" : "failed"}\n`);
	if (r.output) process.stdout.write(r.output.slice(0, 8000) + "\n");
	if (r.stderr) process.stderr.write(r.stderr.slice(0, 8000) + "\n");
	if (r.error) process.stderr.write(r.error + "\n");
	if (!r.ok) process.exit(1);
}

async function main() {
	switch (cmd) {
		case "status":
			return cmdStatus();
		case "doctor":
			return cmdDoctor();
		case "create":
			return cmdCreate();
		case "init":
			return cmdInit();
		case "run":
			return cmdRun();
		case "all":
			await cmdCreate();
			await cmdInit();
			await cmdDoctor();
			return cmdStatus();
		default:
			process.stderr.write(`unknown command "${cmd}". Use: status | doctor | create | init | run | all\n`);
			process.exit(2);
	}
}

await main();
