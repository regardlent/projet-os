/**
 * bridgeRuntime.ts — real lifecycle management for the standalone MCP HTTP server.
 *
 * Provides:
 *   - cfg()        : resolve BridgeConfig from env (fail-closed)
 *   - lockPaths()  : PID lock + marker paths under <controlRoot>/.project-os-cli
 *   - readPid()    : read the current bridge PID from the lock (or null)
 *   - isRunning()  : true if the PID is alive AND the /healthz endpoint answers
 *   - health()     : GET /healthz -> { ok, service, port, running } | null
 *   - start()      : spawn `node dist/.../bridge-server.js` detached, record PID
 *   - stop()       : terminate the server (SIGTERM on POSIX, taskkill on Windows), remove lock
 *   - restart()    : stop() then start()
 *
 * Never binds anything. Only ever talks to the already-running loopback server; the
 * server itself is the only component allowed to call listen().
 */
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { bridgeConfigFromEnv, DEFAULT_BRIDGE_CONFIG, type BridgeConfig } from "./config.js";

/** Resolve the effective bridge config (env-driven, fail-closed). */
export function cfg(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): BridgeConfig {
	const { cfg, errors } = bridgeConfigFromEnv(env);
	if (errors.length) return { ...DEFAULT_BRIDGE_CONFIG, workspaceRoot: cfg.workspaceRoot, controlRoot: cfg.controlRoot };
	return cfg;
}

/** Absolute path of the server entrypoint script in dist/. */
export function serverEntry(): string {
	return path.resolve(process.cwd(), "dist", "integrations", "bridge", "bridge-server.js");
}

export interface BridgeLockPaths {
	pid: string; // PID lock
	marker: string; // "started by project-os cli" marker
}

/** Paths under <controlRoot>/.project-os-cli. */
export function lockPaths(cfgVal: BridgeConfig): BridgeLockPaths {
	const base = path.resolve(cfgVal.controlRoot, ".project-os-cli");
	return { pid: path.join(base, "bridge.pid"), marker: path.join(base, "bridge.started") };
}

/** Read the current bridge PID from the lock, or null. */
export function readPid(cfgVal: BridgeConfig): number | null {
	try {
		const raw = fs.readFileSync(lockPaths(cfgVal).pid, "utf8").trim();
		const pid = Number(raw);
		return Number.isInteger(pid) && pid > 0 ? pid : null;
	} catch {
		return null;
	}
}

/** True if the process with `pid` is alive (signal 0 probe). */
function pidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** Terminate a process tree. SIGTERM on POSIX; taskkill /T /F on Windows. */
function killTree(pid: number): Promise<boolean> {
	return new Promise((resolve) => {
		if (process.platform === "win32") {
			execFile("taskkill", ["/PID", String(pid), "/T", "/F"], (err) => resolve(!err));
		} else {
			try {
				process.kill(pid, "SIGTERM");
				resolve(true);
			} catch {
				resolve(false);
			}
		}
	});
}
/** Fetch `/healthz` from the running server with a short timeout. Returns null if unreachable. */
async function probeHealth(cfgVal: BridgeConfig): Promise<{ ok: boolean; service: string; port: number; running: boolean } | null> {
	const url = `http://${cfgVal.host}:${cfgVal.port}/healthz`;
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), 1200);
	try {
		const res = await fetch(url, { signal: ac.signal });
		clearTimeout(timer);
		if (!res.ok) return null;
		return (await res.json()) as { ok: boolean; service: string; port: number; running: boolean };
	} catch {
		clearTimeout(timer);
		return null;
	}
}

/** True if the bridge server is running (pid alive + healthz answers). Cleans stale locks. */
export async function isRunning(cfgVal: BridgeConfig): Promise<{ running: boolean; pid: number | null; health: { ok: boolean; service: string; port: number; running: boolean } | null }> {
	const pid = readPid(cfgVal);
	if (!pid) return { running: false, pid: null, health: null };
	if (!pidAlive(pid)) {
		// Stale lock from a dead process: clean it up so subsequent reads are accurate.
		try {
			fs.rmSync(lockPaths(cfgVal).pid, { force: true });
			fs.rmSync(lockPaths(cfgVal).marker, { force: true });
		} catch {
			/* ignore */
		}
		return { running: false, pid: null, health: null };
	}
	const health = await probeHealth(cfgVal);
	return { running: health?.running === true, pid, health };
}

/** GET /healthz and return a normalized record (or a synthetic down record). */
export async function health(cfgVal: BridgeConfig): Promise<{ ok: boolean; service: string; port: number; running: boolean; pid: number | null }> {
	const state = await isRunning(cfgVal);
	return { ok: state.running, service: "project-os-bridge", port: cfgVal.port, running: state.running, pid: state.pid };
}

/** Poll `/healthz` until it answers or the timeout elapses. */
async function waitForReady(cfgVal: BridgeConfig, pid: number, timeoutMs = 3000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (!pidAlive(pid)) return false;
		const h = await probeHealth(cfgVal);
		if (h?.running === true) return true;
		await new Promise((r) => setTimeout(r, 120));
	}
	return false;
}

/** Spawn the standalone server detached. Waits for readiness. */
export async function start(cfgVal: BridgeConfig): Promise<{ started: boolean; pid: number | null; error?: string }> {
	const already = await isRunning(cfgVal);
	if (already.running) return { started: false, pid: already.pid, error: "already running" };
	const entry = serverEntry();
	if (!fs.existsSync(entry)) return { started: false, pid: null, error: `server entrypoint not found: ${entry} (run npm run compile)` };

	const child = spawn(process.execPath, [entry, "--foreground"], {
		cwd: process.cwd(),
		detached: true,
		stdio: "ignore",
		env: process.env,
	});
	child.unref();
	if (!child.pid) return { started: false, pid: null, error: "spawn returned no pid" };

	const paths = lockPaths(cfgVal);
	fs.mkdirSync(path.dirname(paths.pid), { recursive: true });
	fs.writeFileSync(paths.marker, `started ${new Date().toISOString()}\n`, "utf8");
	// Seed the lock so a local read has something; the server overwrites with the same value.
	fs.writeFileSync(paths.pid, `${child.pid}\n`, "utf8");

	const ready = await waitForReady(cfgVal, child.pid);
	if (!ready) {
		await killTree(child.pid);
		try {
			fs.rmSync(paths.pid, { force: true });
			fs.rmSync(paths.marker, { force: true });
		} catch {
			/* ignore */
		}
		return { started: false, pid: child.pid, error: "server did not become ready (port busy or config invalid)" };
	}
	return { started: true, pid: child.pid };
}

/** Terminate the running bridge if present. Removes the lock. */
export async function stop(cfgVal: BridgeConfig): Promise<{ stopped: boolean; pid: number | null; error?: string }> {
	const pid = readPid(cfgVal);
	if (!pid) return { stopped: false, pid: null, error: "not running" };
	// Kill based on PID liveness (not on healthz) so a mid-startup server is still
	// terminated reliably instead of being orphaned.
	if (!pidAlive(pid)) {
		try {
			fs.rmSync(lockPaths(cfgVal).pid, { force: true });
			fs.rmSync(lockPaths(cfgVal).marker, { force: true });
		} catch {
			/* ignore */
		}
		return { stopped: false, pid, error: "not running" };
	}
	const killed = await killTree(pid);
	if (!killed) return { stopped: false, pid, error: "terminate failed" };
	await new Promise((r) => setTimeout(r, 350));
	try {
		fs.rmSync(lockPaths(cfgVal).pid, { force: true });
		fs.rmSync(lockPaths(cfgVal).marker, { force: true });
	} catch {
		/* ignore */
	}
	return { stopped: true, pid };
}

/** stop() then start(). */
export async function restart(cfgVal: BridgeConfig): Promise<{ ok: boolean; pid: number | null; error?: string }> {
	const s = await stop(cfgVal);
	// Surface a genuine stop failure (ignore "not running" which is a valid no-op).
	if (s.error && s.error !== "not running") return { ok: false, pid: s.pid, error: s.error };
	const started = await start(cfgVal);
	return { ok: started.started, pid: started.pid, error: started.error };
}

