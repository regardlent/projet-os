/**
 * ProductionLogger (Phase 23, W-prodlog). Wraps StructuredLogger to emit "production mode"
 * output: a compact fixed dashboard (job header + key/value + struck-through TODO) as the
 * canonical message format, so the same layout is always shown for every job/tick.
 * Pure w.r.t. the writer; uses TextOutputFormatter/DashboardRenderer for consistent rendering.
 */
import { StructuredLogger, type LogLevel, type LogMeta } from "./OutputChannel.js";
import { renderDashboard, type DashSnapshot } from "../projects/DashboardRenderer.js";

export interface ProductionChannels {
	write(line: string): void;
}

export interface CorrelationContext {
	correlationId?: string;
	jobId?: string;
	projectId?: string;
	runId?: string;
}

export class ProductionLogger {
	private readonly inner: StructuredLogger;
	private readonly correlation: CorrelationContext;

	constructor(write: (line: string) => void, options?: { redactor?: (m: string) => string; minLevel?: LogLevel; correlation?: CorrelationContext }) {
		this.inner = new StructuredLogger(write, options);
		this.correlation = options?.correlation ?? {};
	}

	/** Build a LogMeta payload carrying correlation context (never the raw message). */
	private meta(extra?: LogMeta): LogMeta {
		const ctx: LogMeta = {};
		for (const k of ["correlationId", "jobId", "projectId", "runId"] as const) {
			if (this.correlation[k]) ctx[k] = this.correlation[k];
		}
		return { ...ctx, ...(extra ?? {}) };
	}

	/** Emit a production dashboard block for a job/tick. */
	dashboard(snapshot: DashSnapshot): void {
		const block = renderDashboard(snapshot);
		const m = this.meta();
		for (const line of block.split("\n")) this.inner.info(line, m);
	}

	/** Emit a compact one-line status (KPI) + struck-through todo. */
	status(title: string, kv: Array<{ key: string; value: string | number }>, elapsedMs?: number): void {
		this.dashboard({ title, kv, elapsedMs });
	}

	info(message: string, meta?: LogMeta): void { this.inner.info(message, this.meta(meta)); }
	warn(message: string, meta?: LogMeta): void { this.inner.warn(message, this.meta(meta)); }
	error(message: string, meta?: LogMeta): void { this.inner.error(message, this.meta(meta)); }
	debug(message: string, meta?: LogMeta): void { this.inner.debug(message, this.meta(meta)); }
}
