/**
 * DashboardRenderer (Phase 23, W-dash). A real-time production dashboard: a FIXED, repeating
 * layout (header, key/value block, progress bar, struck-through todo list, footer) where only
 * the values change each tick. The skeleton never moves — it "looks the same" while updating.
 * Pure + testable; caller renders every N seconds.
 */
import { renderHeader, renderKV, renderProgress, renderTodoList, type TodoItem } from "./TextOutputFormatter.js";

export interface DashSnapshot {
	title: string;
	subtitle?: string;
	kv: Array<{ key: string; value: string | number }>;
	progressPct?: number;
	todo?: TodoItem[];
	footerLines?: string[];
	elapsedMs?: number;
}

/** Render one snapshot into a fixed-layout Markdown/console block. */
export function renderDashboard(s: DashSnapshot): string {
	const out: string[] = [];
	out.push(renderHeader(s.title));
	if (s.subtitle) out.push(s.subtitle);
	if (s.elapsedMs !== undefined) out.push(`⏱ elapsed: ${fmtMs(s.elapsedMs)}`);
	out.push("");
	for (const row of s.kv) out.push(renderKV(row.key, row.value));
	if (s.progressPct !== undefined) out.push(renderProgress(s.progressPct));
	if (s.todo && s.todo.length) {
		out.push("");
		out.push(renderHeader("TODO"));
		out.push(renderTodoList(s.todo));
	}
	if (s.footerLines && s.footerLines.length) {
		out.push("");
		out.push(...s.footerLines.map((l) => (l.startsWith("—") ? l : "— " + l)));
	}
	return out.join("\n");
}

export function fmtMs(ms: number): string {
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	const h = Math.floor(m / 60);
	if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
	if (m > 0) return `${m}m ${s % 60}s`;
	return `${s}s`;
}

/** Deterministic "is it healthy?" from a snapshot — used by the 3-min watchdog. */
export function dashboardHealthy(s: DashSnapshot): { ok: boolean; reasons: string[] } {
	const reasons: string[] = [];
	if (s.progressPct !== undefined && (s.progressPct < 0 || s.progressPct > 100)) reasons.push("progress out of range");
	if (s.elapsedMs !== undefined && s.elapsedMs < 0) reasons.push("negative elapsed");
	// a non-empty requirement: the dashboard must at least show a title + KV
	if (!s.title) reasons.push("missing title");
	if (!s.kv.length) reasons.push("no k/v rows");
	return { ok: reasons.length === 0, reasons };
}
