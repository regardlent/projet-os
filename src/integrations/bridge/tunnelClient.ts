/**
 * tunnelClient.ts — OpenAI Secure MCP Tunnel orchestration for the Project-OS bridge.
 *
 * Honest-evidence rule: this module NEVER reports a fake PASS. If `tunnel-client`
 * is not installed, every command returns `detected:false` plus the operator steps
 * needed to enable the tunnel (same discipline as AntigravityCliAdapter).
 *
 * Commands (matching OpenAi template documented in evidence/TUNNEL_CLIENT.md):
 *   tunnel-client init   --profile project-os --url <local mcp url>
 *   tunnel-client doctor --profile project-os --explain
 *   tunnel-client run    --profile project-os
 */
import fs from "node:fs";
import path from "node:path";
import { runProcess } from "./ProcessRunner.js";
import { health, cfg as bridgeCfg } from "./bridgeRuntime.js";
import type { BridgeConfig } from "./config.js";

export const TUNNEL_PROFILE = "project-os";

export interface TunnelClientStatus {
	detected: boolean;
	cliPath: string | null;
	version: string | null;
	profile: string;
	url: string;
	localServerReady: boolean;
	mcpUrl: string | null;
}

/** Local MCP URL the tunnel should expose (from the running bridge config). */
export function localMcpUrl(cfgVal: BridgeConfig): string {
	return `http://${cfgVal.host}:${cfgVal.port}/mcp`;
}

/** Candidate paths for the `tunnel-client` binary. */
function candidatePaths(): string[] {
	const candidates: string[] = [];
	const override = process.env.PROJECT_OS_TUNNEL_PATH;
	if (override) candidates.push(override);
	if (process.env.USERPROFILE) {
		candidates.push(path.join(process.env.USERPROFILE, ".openai", "tunnel-client", "tunnel-client.exe"));
		candidates.push(path.join(process.env.USERPROFILE, ".openai", "tunnel-client", "tunnel-client"));
		// Go install path (go install .../cmd/client -> go<GOPATH>/bin/{client,tunnel-client}.exe)
		candidates.push(path.join(process.env.USERPROFILE, "go", "bin", "tunnel-client.exe"));
		candidates.push(path.join(process.env.USERPROFILE, "go", "bin", "tunnel-client"));
		candidates.push(path.join(process.env.USERPROFILE, "go", "bin", "client.exe"));
	}
	// npm global bin (Windows: %APPDATA%\npm\tunnel-client.cmd ; POSIX: $(npm prefix -g)/bin/tunnel-client)
	if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, "npm", "tunnel-client.cmd"));
	candidates.push("tunnel-client"); // bare, resolved via PATH by the spawn
	candidates.push("client"); // bare install name from go install .../cmd/client
	return candidates;
}

/** Locate the binary (async: tries PATH resolution, then known paths). */
export async function findTunnelClient(): Promise<string | null> {
	// 1) env override must exist as a file/binary.
	const override = process.env.PROJECT_OS_TUNNEL_PATH;
	if (override) {
		try {
			if (fs.existsSync(override)) return override;
		} catch {
			/* ignore */
		}
	}
	// 2) resolve via PATH (where/which) for both install names.
	for (const name of ["tunnel-client", "client"]) {
		const probe = await runProcess({
			executable: process.platform === "win32" ? "where" : "which",
			args: [name],
			timeoutMs: 2500,
			maxOutputBytes: 4096,
		});
		const found = probe.output.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
		if (probe.exitCode === 0 && found) return found;
	}
	// 3) known install paths (incl. go/bin) + bare-name existence.
	for (const p of candidatePaths()) {
		try {
			if (fs.existsSync(p)) return p;
		} catch {
			/* ignore */
		}
	}
	return null;
}

/** Query the binary version (or null when absent). */
export async function tunnelVersion(cliPath: string): Promise<string | null> {
	const r = await runProcess({ executable: cliPath, args: ["--version"], timeoutMs: 2500, maxOutputBytes: 4096 });
	return r.exitCode === 0 ? r.output.trim() : null;
}

/** True if the local MCP server answers /healthz (the tunnel's upstream). */
export async function localServerReady(): Promise<boolean> {
	const c = bridgeCfg();
	const h = await health(c);
	return h.running;
}

/** Full, honest status of the tunnel stack. */
export async function tunnelStatus(): Promise<TunnelClientStatus> {
	const c = bridgeCfg();
	const cliPath = await findTunnelClient();
	const version = cliPath ? await tunnelVersion(cliPath) : null;
	const ready = await localServerReady();
	return {
		detected: Boolean(cliPath),
		cliPath,
		version,
		profile: TUNNEL_PROFILE,
		url: localMcpUrl(c),
		localServerReady: ready,
		mcpUrl: ready ? localMcpUrl(c) : null,
	};
}

/** Env vars to forward to tunnel-client (it reads secrets via env:CONTROL_PLANE_API_KEY etc.). Never the literal values here. */
function tunnelEnvAllowlist(): string[] {
	return ["PATH", "SYSTEMROOT", "USERPROFILE", "HOME", "CONTROL_PLANE_API_KEY", "OPENAI_ADMIN_KEY", "PROJECT_OS_TUNNEL_PATH", "TUNNEL_ENGINE_REDIS_URL"];
}

/** Run a bounded `tunnel-client <args>` invocation. */
export async function runTunnel(args: string[]): Promise<{ ok: boolean; code: number | null; output: string; stderr: string; error?: string }> {
	const cliPath = await findTunnelClient();
	if (!cliPath) return { ok: false, code: null, output: "", stderr: "", error: "tunnel-client not detected" };
	const r = await runProcess({ executable: cliPath, args, timeoutMs: 30_000, maxOutputBytes: 200_000, envAllowlist: tunnelEnvAllowlist() });
	return { ok: r.exitCode === 0, code: r.exitCode, output: r.output, stderr: r.stderr, error: r.spawnError };
}

/** Initialize the `project-os` tunnel profile pointing at the local MCP server.
 * Uses the `sample_mcp_remote_no_auth` sample (our MCP server is HTTP, no OAuth/PRMD).
 * NOTE: even in no-auth mode, the OpenAI control plane still requires a `--tunnel-id`
 * and a `CONTROL_PLANE_API_KEY` (stored as `env:CONTROL_PLANE_API_KEY` in the profile).
 */
export async function initProfile(): Promise<{ ok: boolean; code: number | null; output: string; stderr: string; error?: string }> {
	const c = bridgeCfg();
	const args = ["init", "--profile", TUNNEL_PROFILE, "--sample", "sample_mcp_remote_no_auth", "--mcp-server-url", localMcpUrl(c)];
	const tunnelId = process.env.PROJECT_OS_TUNNEL_ID;
	if (tunnelId) args.push("--tunnel-id", tunnelId);
	const r = await runTunnel(args);
	// Surface the actionable failure (e.g. "tunnel ID is required") instead of a silent use.
	if (!r.ok && !r.error && (r.output + r.stderr).includes("tunnel ID is required")) {
		return { ok: false, code: r.code, output: r.output, stderr: r.stderr, error: "tunnel ID is required by the control plane (even in no-auth): create one at platform.openai.com/settings/organization/tunnels, then set PROJECT_OS_TUNNEL_ID and export CONTROL_PLANE_API_KEY" };
	}
	return r;
}

/** Create a tunnel via the admin API (requires an OpenAI admin API key + org/workspace id).
 * Reads org/workspace from `PROJECT_OS_ORG_ID` / `PROJECT_OS_WS_ID` when provided.
 */
export async function adminTunnelsCreate(opts?: { name?: string; description?: string }): Promise<{ ok: boolean; output: string; stderr: string; error?: string; tunnelId?: string; mcpUrl?: string }> {
	const args = ["admin", "tunnels", "create", "--name", opts?.name ?? "project-os", "--description", opts?.description ?? "Project-OS MCP bridge tunnel"];
	const orgId = process.env.PROJECT_OS_ORG_ID;
	const wsId = process.env.PROJECT_OS_WS_ID;
	if (orgId) args.push("--organization-id", orgId);
	if (wsId) args.push("--workspace-id", wsId);
	const r = await runTunnel(args);
	const tid = /tunnel_[\w]+/.exec(r.output)?.[0];
	const url = /https:\/\/[\w.-]+\.tunnel\.openai\.com\/mcp/.exec(r.output)?.[0];
	// Actionable failure when the admin API key is missing (auth is org-level).
	if (!r.ok && (r.output + r.stderr).includes("API key")) {
		return { ok: false, output: r.output, stderr: r.stderr, error: "admin API key required: obtain one at platform.openai.com/settings/organization/admin-keys, then export ADMIN_API_KEY (or set tunnel-client env)" };
	}
	return { ok: r.ok, output: r.output, stderr: r.stderr, error: r.error, tunnelId: tid ?? undefined, mcpUrl: url ?? undefined };
}

/** Run the tunnel doctor (needs the local server up). */
export async function doctor(): Promise<{ ok: boolean; output: string; stderr: string; error?: string }> {
	const ready = await localServerReady();
	if (!ready) return { ok: false, output: "", stderr: "", error: "local MCP server not ready (run /bridge start first)" };
	const cliPath = await findTunnelClient();
	if (!cliPath) return { ok: false, output: "", stderr: "", error: "tunnel-client not detected" };
	const r = await runProcess({ executable: cliPath, args: ["doctor", "--profile", TUNNEL_PROFILE, "--explain"], timeoutMs: 30_000, maxOutputBytes: 200_000, envAllowlist: tunnelEnvAllowlist() });
	return { ok: r.exitCode === 0, output: r.output, stderr: r.stderr, error: r.spawnError };
}

/** Run the tunnel client attached to the profile (blocking). */
export async function run(): Promise<{ ok: boolean; code: number | null; output: string; stderr: string; error?: string }> {
	return runTunnel(["run", "--profile", TUNNEL_PROFILE]);
}
