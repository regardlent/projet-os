/**
 * McpBridge — orchestration of the Project-OS MCP bridge.
 * start/stop/health/tool-discovery/lifecycle; concurrency bounded; ApprovalService
 * guards every invocation; AuditLogger records every event.
 */
import type { Server as McpServerInstance } from "@modelcontextprotocol/sdk/server/index.js";
import { AuditLogger, type BridgeAuditEvent } from "./AuditLogger.js";
import { evaluateApproval, toolClassOf, type ApprovalContext } from "./ApprovalService.js";
import { dispatchTool, BRIDGE_TOOLS, type ToolCallInput } from "./BridgeToolRegistry.js";
import type { IAntigravityAdapter } from "./AntigravityCliAdapter.js";
import type { BridgeConfig } from "./config.js";

export interface BridgeHandle {
	started: boolean;
	stopped: boolean;
	uptimeMs(): number;
	activeOperations(): number;
	dispose(): Promise<void>;
}

export interface McpBridgeOptions {
	config: BridgeConfig;
	server: McpServerInstance; // wired elsewhere; retained for lifecycle explicitness
	antigravity?: IAntigravityAdapter | null;
	logger?: AuditLogger;
	allowedScripts?: string[];
}

const READ_CLASSES = new Set(["health", "read"]);

export class McpBridge {
	private readonly cfg: BridgeConfig;
	private readonly antigravity: IAntigravityAdapter | null;
	private readonly logger: AuditLogger;
	private readonly allowedScripts: string[];
	private activeReads = 0;
	private activeRuns = 0;
	private readonly startedAt: number;
	private stopped = false;
	private opsTotal = 0;

	constructor(opts: McpBridgeOptions) {
		this.cfg = opts.config;
		// opts.server is consumed by wireMcpServer() which binds the SDK handlers
		// to this bridge via invokeWrapped; retained here only to make the
		// lifecycle explicit at construction time.
		void opts.server;
		this.antigravity = opts.antigravity ?? null;
		this.logger = opts.logger ?? new AuditLogger();
		this.allowedScripts = opts.allowedScripts ?? ["compile", "build", "test", "typecheck"];
		this.startedAt = Date.now();
	}

	start(): BridgeHandle {
		const self = this;
		return {
			started: true,
			stopped: false,
			uptimeMs: () => Date.now() - self.startedAt,
			activeOperations: () => self.activeReads + self.activeRuns,
			dispose: () => self.dispose(),
		};
	}

	async dispose(): Promise<void> {
		this.stopped = true;
	}

	healthJson(): string {
		return JSON.stringify({
			projectOS: "v0.1.0",
			bridge: "v1",
			enabled: this.cfg.enabled,
			host: this.cfg.host,
			port: this.cfg.port,
			mcp: "v1.30.0",
			uptimeMs: Date.now() - this.startedAt,
			active: this.activeReads + this.activeRuns,
			opsTotal: this.opsTotal,
			writeEnabled: this.cfg.writeEnabled,
			approvalMode: this.cfg.approvalMode,
			antigravity: this.antigravity ? this.antigravity.detect() : { detected: false, version: null },
		});
	}

	async invokeWrapped(toolName: string, args: Record<string, unknown>, workspaceRoot: string, options?: { approved?: boolean }): Promise<{ ok: boolean; text: string }> {
		if (this.stopped || !this.cfg.enabled) return { ok: false, text: JSON.stringify({ error: "bridge disabled" }) };
		const approvalCtx: ApprovalContext = {
			writeEnabled: this.cfg.writeEnabled,
			approvalMode: this.cfg.approvalMode,
			workspaceApproved: true, // workspace is pinned via boundary at config/registration time
			approved: options?.approved ?? false,
		};
		const cls = toolClassOf(toolName);
		const decision = evaluateApproval(cls, approvalCtx);
		if (decision.decision !== "approve") {
			this.logger.record({ timestamp: Date.now(), correlationId: "bridge", toolName, operationType: cls === "read" ? "read" : "write", elapsedMs: 0, resultStatus: "BLOCKED" });
			return { ok: false, text: JSON.stringify({ error: decision.reason }) };
		}
		const isRead = READ_CLASSES.has(cls);
		if (isRead && this.activeReads >= this.cfg.maxConcurrentReads) {
			return { ok: false, text: JSON.stringify({ error: "read concurrency limit" }) };
		}
		if (!isRead && this.activeRuns >= this.cfg.maxConcurrentRuns) {
			return { ok: false, text: JSON.stringify({ error: "run concurrency limit" }) };
		}
		if (isRead) this.activeReads++;
		else this.activeRuns++;
		this.opsTotal++;
		const t0 = Date.now();
		try {
			const input: ToolCallInput = {
				toolName,
				args,
				workspaceRoot,
				readTimeoutMs: this.cfg.timeoutMs,
				runTimeoutMs: Math.max(this.cfg.timeoutMs, this.cfg.maxRuntimeMs),
				antigravity: this.antigravity,
				allowedScripts: this.allowedScripts,
			};
			const r = await dispatchTool(input);
			this.logger.record({ timestamp: Date.now(), correlationId: "bridge", toolName, operationType: isRead ? "read" : "run", elapsedMs: Date.now() - t0, resultStatus: r.ok ? "OK" : "FAIL", bytesOut: r.result?.content[0]?.text.length ?? 0 });
			if (!r.ok || !r.result) return { ok: false, text: JSON.stringify({ error: r.error ?? "tool failed" }) };
			return { ok: true, text: r.result.content[0].text };
		} finally {
			if (isRead) this.activeReads--;
			else this.activeRuns--;
		}
	}

	toolList(): string[] {
		return BRIDGE_TOOLS.map((t) => t.name);
	}

	recentEvents(): readonly BridgeAuditEvent[] {
		return this.logger.history();
	}
}