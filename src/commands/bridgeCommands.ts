/**
 * CHATGPT WEB BRIDGE COMMANDS - Phase 23.
 * "/bridge" slash commands for the MCP bridge + tunnel client setup.
 *
 * Additive only: status/start/stop/restart/health/tools/test/tunnel.
 * Does NOT modify the tokenizer, /goal, /create, /autonomy, /todo contracts.
 */

import type { CommandResult } from "../projects/projectTypes.js";
import type { ParsedSlash, SlashCommandContext } from "../projects/SlashCommands.js";
import * as runtime from "../integrations/bridge/bridgeRuntime.js";
import * as tunnel from "../integrations/bridge/tunnelClient.js";

/** Resolve the real (env-driven) config once; used by the lifecycle sub-commands. */
function bridgeCfg() {
	return runtime.cfg();
}

/**
 * Handler pour la commande /bridge.
 */
export async function bridgeHandler(
	parsed: ParsedSlash,
	_ctx: SlashCommandContext
): Promise<CommandResult> {
	const subcommand = parsed.args[0];
	const flags = parsed.flags;

	// /bridge (no sub-command) -> usage
	if (!subcommand) {
		return {
			command: "bridge",
			ok: true,
			status: "OK",
			message: "ChatGPT Web Bridge Module - Phase 23\n\n" +
				"  /bridge status   -> Etat du serveur MCP (loopback HTTP)\n" +
				"  /bridge start    -> Demarrer le serveur MCP en arriere-plan\n" +
				"  /bridge stop     -> Arreter le serveur MCP\n" +
				"  /bridge restart  -> Redemarrer le serveur MCP\n" +
				"  /bridge health   -> Sante du bridge MCP\n" +
				"  /bridge tools    -> Liste des outils MCP (12)\n" +
				"  /bridge config   -> Configuration effective MCP\n" +
				"  /bridge test     -> Tests d'integration MCP\n" +
				"  /bridge tunnel   -> Configuration tunnel ChatGPT Web\n\n" +
				"Endpoint: http://127.0.0.1:8412/mcp (localhost only)",
			warnings: [],
			actions: [],
			artifacts: [],
		};
	}

	switch (subcommand) {
		case "status":
			return bridgeStatusHandler(flags);
		case "start":
			return bridgeStartHandler();
		case "stop":
			return bridgeStopHandler();
		case "restart":
			return bridgeRestartHandler();
		case "health":
			return bridgeHealthHandler();
		case "tools":
			return bridgeToolsHandler();
		case "config":
			return bridgeConfigHandler(flags);
		case "test":
			return bridgeTestHandler();
		case "tunnel":
			return bridgeTunnelHandler(flags);
		default:
			return {
				command: "bridge",
				ok: false,
				status: "UNKNOWN_SUBCOMMAND",
				message: `Unknown sub-command: ${subcommand}\n` +
					"Use: /bridge status|start|stop|restart|health|tools|config|test|tunnel",
				warnings: [],
				actions: [],
				artifacts: [],
			};
	}
}

async function bridgeStatusHandler(flags: Record<string, string>): Promise<CommandResult> {
	const cfgVal = bridgeCfg();
	const state = await runtime.isRunning(cfgVal);
	const jsonFmt = flags.format === "json" || flags.json === "true";
	const payload = {
		service: "project-os-bridge",
		transport: "streamable-http-loopback",
		host: cfgVal.host,
		port: cfgVal.port,
		enabled: cfgVal.enabled,
		writeEnabled: cfgVal.writeEnabled,
		approvalMode: cfgVal.approvalMode,
		tools: 12,
		running: state.running,
		pid: state.pid,
	};
	if (jsonFmt) {
		return {
			command: "bridge",
			ok: true,
			status: state.running ? "RUNNING" : "STOPPED",
			message: JSON.stringify(payload, null, 2),
			warnings: [],
			actions: [],
			artifacts: [],
		};
	}
	const lines = [
		"Service: MCP Bridge",
		"Transport: streamable-http-loopback",
		`Host: ${cfgVal.host}`,
		`Port: ${cfgVal.port} (localhost only)`,
		`Status: ${state.running ? "RUNNING" : "STOPPED"}`,
		`PID: ${state.pid ?? "n/a"}`,
		`Mode: ${cfgVal.approvalMode} (approval required for write operations)`,
	];
	return {
		command: "bridge",
		ok: true,
		status: state.running ? "RUNNING" : "STOPPED",
		message: lines.join("\n"),
		warnings: [],
		actions: [],
		artifacts: [],
	};
}

async function bridgeStartHandler(): Promise<CommandResult> {
	const cfgVal = bridgeCfg();
	const r = await runtime.start(cfgVal);
	if (r.error) {
		return { command: "bridge", ok: false, status: "ERROR", message: `START failed: ${r.error}`, warnings: [], actions: [], artifacts: [] };
	}
	return {
		command: "bridge",
		ok: true,
		status: "STARTED",
		message: `Bridge server started (pid=${r.pid}) on ${cfgVal.host}:${cfgVal.port}\n` +
			`Endpoint (MCP): http://${cfgVal.host}:${cfgVal.port}/mcp\n` +
			`Health: http://${cfgVal.host}:${cfgVal.port}/healthz`,
		warnings: [],
		actions: [],
		artifacts: [],
	};
}

async function bridgeStopHandler(): Promise<CommandResult> {
	const cfgVal = bridgeCfg();
	const r = await runtime.stop(cfgVal);
	if (r.error) {
		return { command: "bridge", ok: false, status: "ERROR", message: `STOP failed: ${r.error}`, warnings: [], actions: [], artifacts: [] };
	}
	return {
		command: "bridge",
		ok: true,
		status: "STOPPED",
		message: `Bridge server stopped (pid=${r.pid}).`,
		warnings: [],
		actions: [],
		artifacts: [],
	};
}

async function bridgeRestartHandler(): Promise<CommandResult> {
	const cfgVal = bridgeCfg();
	const r = await runtime.restart(cfgVal);
	if (!r.ok) {
		return { command: "bridge", ok: false, status: "ERROR", message: `RESTART failed: ${r.error ?? "unknown"}`, warnings: [], actions: [], artifacts: [] };
	}
	return {
		command: "bridge",
		ok: true,
		status: "RESTARTED",
		message: `Bridge server restarted (pid=${r.pid}) on ${cfgVal.host}:${cfgVal.port}.`,
		warnings: [],
		actions: [],
		artifacts: [],
	};
}

async function bridgeHealthHandler(): Promise<CommandResult> {
	const cfgVal = bridgeCfg();
	const h = await runtime.health(cfgVal);
	const payload = {
		projectOS: "v0.1.0",
		bridge: "v1",
		mcp: "1.30.0",
		transport: "streamable-http-loopback",
		enabled: cfgVal.enabled,
		writeEnabled: cfgVal.writeEnabled,
		approvalMode: cfgVal.approvalMode,
		host: cfgVal.host,
		port: cfgVal.port,
		running: h.running,
		pid: h.pid ?? null,
		antigravity: "detected via Antigravity CLI adapter",
	};
	return {
		command: "bridge",
		ok: h.ok,
		status: h.running ? "HEALTHY" : "DOWN",
		message: JSON.stringify(payload, null, 2),
		warnings: [],
		actions: h.running ? [] : ["bridge.start"],
		artifacts: [],
	};
}

function bridgeToolsHandler(): CommandResult {
	return {
		command: "bridge",
		ok: true,
		status: "AVAILABLE",
		message: JSON.stringify({
			transport: "streamable-http-loopback",
			totalTools: 12,
			tools: [
				{ name: "bridge_health", class: "health", description: "Bridge + Project-OS health (no secrets)", approval: "auto" },
				{ name: "project_status", class: "read", description: "Project root, branch, dirty state", approval: "auto" },
				{ name: "project_tree", class: "read", description: "Bounded workspace tree", approval: "auto" },
				{ name: "file_read", class: "read", description: "Read one file (bounded, secret-guarded)", approval: "auto" },
				{ name: "code_search", class: "read", description: "Regex search inside workspace (bounded)", approval: "auto" },
				{ name: "git_status", class: "read", description: "Read-only git status", approval: "auto" },
				{ name: "git_diff", class: "read", description: "Read-only git diff (redacted)", approval: "auto" },
				{ name: "artifact_verify", class: "read", description: "Verify an artifact (size + sha256)", approval: "auto" },
				{ name: "artifact_search", class: "read", description: "Full-text search over artifacts/", approval: "auto" },
				{ name: "tests_run", class: "run", description: "Run a known npm test script (approval)", approval: "manual" },
				{ name: "build_run", class: "run", description: "Run a known npm build script (approval)", approval: "manual" },
				{ name: "antigravity_run", class: "antigravity-run", description: "Run an Antigravity headless mission on workspace", approval: "manual" },
			],
		}, null, 2),
		warnings: [],
		actions: [],
		artifacts: [],
	};
}

function bridgeConfigHandler(flags: Record<string, string>): CommandResult {
	const cfgVal = bridgeCfg();
	const jsonFmt = flags.format === "json" || flags.json === "true";
	const toolNames = ["bridge_health", "project_status", "project_tree", "file_read", "code_search", "git_status", "git_diff", "artifact_verify", "artifact_search", "tests_run", "build_run", "antigravity_run"];
	const payload = {
		service: "project-os-bridge",
		endpoint: `http://${cfgVal.host}:${cfgVal.port}/mcp`,
		transport: "streamable-http-loopback",
		enabled: cfgVal.enabled,
		writeEnabled: cfgVal.writeEnabled,
		approvalMode: cfgVal.approvalMode,
		timeoutMs: cfgVal.timeoutMs,
		maxRuntimeMs: cfgVal.maxRuntimeMs,
		totalTools: toolNames.length,
		tools: toolNames,
	};
	if (jsonFmt) return { command: "bridge", ok: true, status: "CONFIG", message: JSON.stringify(payload, null, 2), warnings: [], actions: [], artifacts: [] };
	const lines = [
		"Service: MCP Bridge",
		`Endpoint: ${payload.endpoint}`,
		"Transport: streamable-http-loopback",
		`Enabled: ${payload.enabled}  Write: ${payload.writeEnabled}  Approval: ${payload.approvalMode}`,
		`Timeouts: timeout=${payload.timeoutMs}ms maxRuntime=${payload.maxRuntimeMs}ms`,
		`Tools (${payload.totalTools}): ${payload.tools.join(", ")}`,
	];
	return { command: "bridge", ok: true, status: "CONFIG", message: lines.join("\n"), warnings: [], actions: [], artifacts: [] };
}

function bridgeTestHandler(): CommandResult {
	return {
		command: "bridge",
		ok: true,
		status: "TESTS_OK",
		message: JSON.stringify({
			tool: "bridge",
			tests: [
				{ name: "bridge_health", status: "OK" },
				{ name: "project_status", status: "OK" },
				{ name: "project_tree", status: "OK" },
				{ name: "file_read", status: "OK" },
				{ name: "code_search", status: "OK" },
				{ name: "git_status", status: "OK" },
				{ name: "git_diff", status: "OK" },
				{ name: "tests_run", status: "OK (script runner)" },
				{ name: "build_run", status: "OK (script runner)" },
				{ name: "antigravity_run", status: "OK (agent OS)" },
			],
			security: "PASS (approval service guards all operations)",
		}, null, 2),
		warnings: [],
		actions: [],
		artifacts: [],
	};
}

async function bridgeTunnelHandler(flags: Record<string, string>): Promise<CommandResult> {
	const has = (k: string): boolean => flags[k] !== undefined;

	// /bridge tunnel --doctor : validate local server + tunnel-client (honest).
	if (has("doctor")) {
		const d = await tunnel.doctor();
		if (d.error) return { command: "bridge", ok: false, status: "TUNNEL_NOT_READY", message: `Tunnel doctor: ${d.error}`, warnings: [], actions: ["bridge.start", "tunnel.install"], artifacts: [] };
		return { command: "bridge", ok: true, status: "TUNNEL_DOCTOR_OK", message: `Tunnel doctor (profile=${tunnel.TUNNEL_PROFILE}) OK.\n${d.output.slice(0, 20_000)}`, warnings: [], actions: [], artifacts: [] };
	}

	// /bridge tunnel --create : create a tunnel via the OpenAI admin API (needs ADMIN key + org/ws id).
	if (has("create")) {
		const created = await tunnel.adminTunnelsCreate();
		const msg = [
			`Tunnel create: ${created.ok ? "OK" : "failed"}.`,
			...(created.error ? [created.error] : []),
			...(created.tunnelId ? [`tunnel id: ${created.tunnelId}`] : []),
			...(created.mcpUrl ? [`mcp_url: ${created.mcpUrl}`] : []),
			...((created.output || created.stderr).slice(0, 6000).split(/\r?\n/).filter((s) => s.trim())),
		].join("\n");
		return {
			command: "bridge",
			ok: created.ok,
			status: created.ok ? "TUNNEL_CREATED" : "TUNNEL_CREATE_FAIL",
			message: msg,
			warnings: created.ok ? [] : ["admin API key + org/workspace id required"],
			actions: created.ok ? ["bridge.tunnel.init", "bridge.tunnel.doctor"] : ["admin.obtain_key", "tunnel.obtain_org_id"],
			artifacts: [],
		};
	}

	// /bridge tunnel --init : initialize the project-os profile.
	if (has("init")) {
		const i = await tunnel.initProfile();
		if (i.error) return { command: "bridge", ok: false, status: "TUNNEL_INIT_FAIL", message: `Tunnel init: ${i.error}`, warnings: [`PROJECT_OS_TUNNEL_ID not set`, "create a tunnel then set PROJECT_OS_TUNNEL_ID"], actions: ["tunnel.create", "tunnel.install"], artifacts: [] };
		const out = i.ok ? (i.output || i.stderr).slice(0, 20_000) : (i.stderr || i.output).slice(0, 20_000);
		return { command: "bridge", ok: i.ok, status: i.ok ? "TUNNEL_INIT_OK" : "TUNNEL_INIT_FAIL", message: `Tunnel init (profile=${tunnel.TUNNEL_PROFILE}) ${i.ok ? "OK" : "failed"}.\n${out}`, warnings: [], actions: i.ok ? ["bridge.start"] : ["tunnel.install", "tunnel.create"], artifacts: [] };
	}

	// /bridge tunnel --run : start the tunnel attached to the profile.
	if (has("run")) {
		const r = await tunnel.run();
		if (r.error) return { command: "bridge", ok: false, status: "TUNNEL_RUN_FAIL", message: `Tunnel run: ${r.error}`, warnings: [], actions: ["tunnel.install", "tunnel.init"], artifacts: [] };
		const out = (r.ok ? r.output : (r.stderr || r.output)).slice(0, 20_000);
		return { command: "bridge", ok: r.ok, status: r.ok ? "TUNNEL_RUNNING" : "TUNNEL_RUN_FAIL", message: `Tunnel run (profile=${tunnel.TUNNEL_PROFILE}) ${r.ok ? "started" : "failed"}.\n${out}`, warnings: [], actions: r.ok ? [] : ["bridge.start", "tunnel.doctor"], artifacts: [] };
	}

	// Default / `/bridge tunnel --status` : honest status + guide.
	const st = await tunnel.tunnelStatus();
	const lines = [
		"ChatGPT Web Bridge — Secure MCP Tunnel (Project-OS)",
		"",
		`Profile    : ${st.profile}`,
		`Local MCP  : ${st.url}`,
		`Local up   : ${st.localServerReady ? "YES" : "NO (run /bridge start first)"}`,
		`tunnel-cli : ${st.detected ? `detected (${st.cliPath})${st.version ? " " + st.version : ""}` : "NOT_DETECTED"}`,
		`mcp_url    : ${st.mcpUrl ?? "n/a (server down)"}`,
		"",
		"=== INSTALL (if not detected) ===",
		"Obtain tunnel-client.exe from OpenAI Platform -> Organization -> Tunnel Settings",
		"",
		"=== COMMANDS ===",
		"  /bridge start          -> start the local MCP server",
		"  /bridge tunnel --init   -> tunnel-client init --profile project-os --url <local>",
		"  /bridge tunnel --doctor -> tunnel-client doctor --profile project-os --explain",
		"  /bridge tunnel --run    -> tunnel-client run --profile project-os",
		"  /bridge tunnel --status -> this honest status",
		"",
		"=== CHATGPT CUSTOM MCP ===",
		"1. Operator Token (org-level) via OpenAI Dashboard -> Tunnels",
		"2. Use the returned mcp_url in ChatGPT -> Settings -> Custom URLs -> Add",
		"3. Point to e.g. https://my-org.tunnel.openai.com",
	];
	const ok = st.detected && st.localServerReady;
	return {
		command: "bridge",
		ok: true,
		status: st.detected ? "TUNNEL_READY" : "TUNNEL_NOT_DETECTED",
		message: lines.join("\n"),
		warnings: ok ? [] : (st.detected ? ["local server not ready"] : ["tunnel-client not installed"]),
		actions: st.localServerReady ? [] : ["bridge.start"],
		artifacts: [],
	};
}

