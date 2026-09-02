/**
 * /bridge — Project-OS slash command to pilot the MCP bridge.
 * Additive only: status/doctor/start/stop/tools/test. Does NOT modify the
 * tokenizer or any existing handler.
 */
import type { CommandResult } from "../../projects/projectTypes.js";
import type { BridgeConfig } from "./config.js";
import { validateBridgeConfig } from "./config.js";
import { BRIDGE_TOOLS } from "./BridgeToolRegistry.js";
import type { IAntigravityAdapter } from "./AntigravityCliAdapter.js";
import { boundaryRead } from "./WorkspaceBoundary.js";

export type BridgeCommandCtx = {
	registry: {
		list(): { slug: string; workspaceRoot: string; projectType?: string }[];
		get(slug: string): { workspaceRoot?: string; projectType?: string } | undefined;
	};
	config: BridgeConfig;
	antigravity?: IAntigravityAdapter | null;
};

function ok(command: string, status: string, message: string, artifacts: string[] = []): CommandResult {
	return { command, ok: true, status, message, warnings: [], actions: [], next: "", artifacts };
}
export function fail(command: string, status: string, message: string): CommandResult {
	return { command, ok: false, status, message, warnings: [], actions: [], next: "", artifacts: [] };
}

export async function bridgeStatusCommand(ctx: BridgeCommandCtx): Promise<CommandResult> {
	const projects = ctx.registry.list();
	return ok("bridge", "OK", JSON.stringify({ enabled: ctx.config.enabled, host: ctx.config.host, port: ctx.config.port, writeEnabled: ctx.config.writeEnabled, managedProjects: projects.map((p) => p.slug) }));
}

export async function bridgeDoctorCommand(ctx: BridgeCommandCtx): Promise<CommandResult> {
	const errors = validateBridgeConfig(ctx.config);
	const ws = boundaryRead(ctx.config.workspaceRoot, ".");
	const agy = ctx.antigravity ? ctx.antigravity.detect() : { detected: false, version: null };
	const reports = [
		`config=${errors.length === 0 ? "PASS" : "FAIL"}`,
		`workspace=${ws.ok ? "PASS" : "FAIL"}`,
		`writeGuard=${ctx.config.writeEnabled ? "ENABLED" : "DISABLED"}`,
		`agy=${agy.detected ? "DETECTED(" + agy.version + ")" : "BLOCKED_ENV"}`,
		`tools=${BRIDGE_TOOLS.length}`,
	];
	return ok("bridge", errors.length === 0 ? "OK" : "FAIL", "doctor: " + reports.join(" ; "));
}

export async function bridgeToolsCommand(_ctx: BridgeCommandCtx): Promise<CommandResult> {
	return ok("bridge", "OK", "tools: " + BRIDGE_TOOLS.map((t) => t.name).join(", "));
}

export async function bridgeHandler(parsed: { args: string[]; flags: Record<string, string> }, ctx: BridgeCommandCtx): Promise<CommandResult> {
	const sub = parsed.args[1] ?? "status";
	switch (sub) {
		case "status":
			return bridgeStatusCommand(ctx);
		case "doctor":
			return bridgeDoctorCommand(ctx);
		case "tools":
			return bridgeToolsCommand(ctx);
		case "start":
		case "stop":
			return ok("bridge", "OK", sub + " acknowledged (lifecycle managed by McpBridge)");
		default:
			return fail("bridge", "UNKNOWN_SUBCOMMAND", "usage: /bridge status|doctor|tools|start|stop|test");
	}
}