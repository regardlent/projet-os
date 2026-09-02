/**
 * Bridge configuration — pure, env-renderable, validated.
 * Fail-closed defaults. `bridge.enabled=false` disables the module entirely
 * without touching any other Project-OS subsystem.
 */
export interface BridgeConfig {
	enabled: boolean;
	host: string; // ONLY loopback by default (127.0.0.1)
	port: number;
	workspaceRoot: string;
	controlRoot: string;
	writeEnabled: boolean;
	approvalMode: "auto-approve-read" | "approval-required";
	timeoutMs: number;
	maxOutputBytes: number;
	maxConcurrentReads: number;
	maxConcurrentRuns: number;
	queueLimit: number;
	maxRuntimeMs: number;
	tunnelMode: false | "secure-mcp-tunnel";
	antigravityCli: string | null; // resolved path, null = not detected
}

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
	enabled: true,
	host: "127.0.0.1",
	port: 8412,
	workspaceRoot: ".",
	controlRoot: ".",
	writeEnabled: true,
	approvalMode: "approval-required",
	timeoutMs: 60_000,
	maxOutputBytes: 1_000_000,
	maxConcurrentReads: 4,
	maxConcurrentRuns: 1,
	queueLimit: 64,
	maxRuntimeMs: 30 * 60_000,
	tunnelMode: false,
	antigravityCli: null,
};

export type ConfigError = { field: string; message: string };

/** Validate a config against physical constraints. Returns errors (empty = valid). */
export function validateBridgeConfig(cfg: BridgeConfig): ConfigError[] {
	const errors: ConfigError[] = [];
	if (cfg.host !== "127.0.0.1" && cfg.host !== "localhost" && cfg.host !== "::1") {
		errors.push({ field: "host", message: "loopback only" });
	}
	if (!Number.isInteger(cfg.port) || cfg.port < 1024 || cfg.port > 65535) {
		errors.push({ field: "port", message: "must be integer 1024..65535" });
	}
	if (cfg.timeoutMs < 1000) errors.push({ field: "timeoutMs", message: "min 1000" });
	if (cfg.maxRuntimeMs < cfg.timeoutMs) errors.push({ field: "maxRuntimeMs", message: ">= timeoutMs" });
	if (cfg.maxOutputBytes < 1024) errors.push({ field: "maxOutputBytes", message: "min 1024" });
	if (cfg.maxConcurrentReads < 1) errors.push({ field: "maxConcurrentReads", message: "min 1" });
	if (cfg.maxConcurrentRuns < 1) errors.push({ field: "maxConcurrentRuns", message: "min 1" });
	if (cfg.queueLimit < 1 || cfg.queueLimit > 1000) errors.push({ field: "queueLimit", message: "1..1000" });
	if (cfg.tunnelMode && cfg.tunnelMode !== "secure-mcp-tunnel") errors.push({ field: "tunnelMode", message: "only secure-mcp-tunnel" });
	return errors;
}

/** Env-driven loader. Unknown values do NOT weaken the config (fail-closed). */
export function bridgeConfigFromEnv(env: Record<string, string | undefined>): { cfg: BridgeConfig; errors: ConfigError[] } {
	const c = { ...DEFAULT_BRIDGE_CONFIG };
	const num = (k: string, fallback: number): number => {
		const raw = env[k];
		if (raw === undefined || raw === "") return fallback;
		const v = Number(raw);
		return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
	};
	c.enabled = env.BRIDGE_ENABLED === undefined ? c.enabled : env.BRIDGE_ENABLED === "1" || env.BRIDGE_ENABLED === "true";
	c.host = env.BRIDGE_HOST || c.host;
	c.port = num("BRIDGE_PORT", c.port);
	c.workspaceRoot = env.BRIDGE_WORKSPACE_ROOT || c.workspaceRoot;
	c.controlRoot = env.BRIDGE_CONTROL_ROOT || c.controlRoot;
	c.writeEnabled = env.BRIDGE_WRITE_ENABLED === undefined ? c.writeEnabled : env.BRIDGE_WRITE_ENABLED === "1" || env.BRIDGE_WRITE_ENABLED === "true";
	c.approvalMode = env.BRIDGE_APPROVAL === "auto-approve-read" ? "auto-approve-read" : env.BRIDGE_APPROVAL === "approval-required" ? "approval-required" : c.approvalMode;
	c.timeoutMs = num("BRIDGE_TIMEOUT_MS", c.timeoutMs);
	c.maxOutputBytes = num("BRIDGE_MAX_OUTPUT_BYTES", c.maxOutputBytes);
	c.maxConcurrentReads = num("BRIDGE_MAX_READS", c.maxConcurrentReads);
	c.maxConcurrentRuns = num("BRIDGE_MAX_RUNS", c.maxConcurrentRuns);
	c.queueLimit = num("BRIDGE_QUEUE_LIMIT", c.queueLimit);
	c.maxRuntimeMs = num("BRIDGE_MAX_RUNTIME_MS", c.maxRuntimeMs);
	return { cfg: c, errors: validateBridgeConfig(c) };
}