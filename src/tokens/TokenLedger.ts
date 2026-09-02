/**
 * TokenLedger + UsageReconciler + Aggregates (Phase 4).
 *
 * - Reconciler: deduplicates by observationId, converts cumulative snapshots
 *   into deltas, and guards against counter resets (no negative deltas).
 * - Persistence: append-friendly JSONL observations + atomic aggregate snapshot.
 * - Privacy: stores numbers + metadata only (no prompt/assistant content).
 *
 * Pure module: node:fs only (directory injected), so it is unit-testable.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { isRawProbe, type TokenTotals, type UsageObservation } from "./UsageObservation.js";

export interface LedgerFilter {
	projectId?: string;
	workspaceId?: string;
	sessionId?: string;
	agentId?: string;
	modelId?: string;
	providerId?: string;
	since?: number;
	excludeRaw?: boolean;
}

export function matches(obs: UsageObservation, f: LedgerFilter): boolean {
	if (f.excludeRaw !== false && isRawProbe(obs)) return false;
	if (f.projectId && obs.projectId !== f.projectId) return false;
	if (f.workspaceId && obs.workspaceId !== f.workspaceId) return false;
	if (f.sessionId && obs.sessionId !== f.sessionId) return false;
	if (f.agentId && obs.agentId !== f.agentId) return false;
	if (f.modelId && obs.modelId !== f.modelId) return false;
	if (f.providerId && obs.providerId !== f.providerId) return false;
	if (f.since && obs.timestamp < f.since) return false;
	return true;
}

export function totals(observations: UsageObservation[], f: LedgerFilter = {}): TokenTotals {
	let input = 0;
	let output = 0;
	let total = 0;
	for (const o of observations) {
		if (!matches(o, f)) continue;
		input += o.inputTokens;
		output += o.outputTokens;
		total += o.totalTokens;
	}
	return { input, output, total };
}

/** Group totals by a string key selector. */
export function totalsBy(
	observations: UsageObservation[],
	key: (o: UsageObservation) => string,
	f: LedgerFilter = {},
): Record<string, TokenTotals> {
	const out: Record<string, TokenTotals> = {};
	for (const o of observations) {
		if (!matches(o, f)) continue;
		const k = key(o);
		const cur = out[k] ?? { input: 0, output: 0, total: 0 };
		cur.input += o.inputTokens;
		cur.output += o.outputTokens;
		cur.total += o.totalTokens;
		out[k] = cur;
	}
	return out;
}

/**
 * Reconciler: dedupe (by correlation then by id) + convert cumulative snapshots
 * to deltas. Never produces a negative delta; a decreasing counter is flagged,
 * not counted. Observations of the SAME request (same correlationId) are counted
 * once, choosing the highest-precedence source.
 */
const SOURCE_PRECEDENCE: Record<string, number> = {
	LOCALAI_REQUEST_USAGE: 6,
	CLINE_SESSION_RESULT: 5,
	CLINE_USAGE_EVENT: 4,
	CLINE_PROVIDER_STREAM_USAGE: 4,
	CLINE_ACCUMULATED_USAGE: 3,
	LOCALAI_USAGE_API: 3,
	HISTORICAL_IMPORT: 2,
	LOCAL_ESTIMATE: 1,
	UNKNOWN: 0,
};

export function normalizeObservations(observations: UsageObservation[]): UsageObservation[] {
	// 1. Dedupe by correlationId (same request => keep the most authoritative source).
	const byCorrelation = new Map<string, UsageObservation>();
	const order: string[] = [];
	for (const o of observations) {
		if (o.correlationId) {
			const existing = byCorrelation.get(o.correlationId);
			if (!existing || sourceRank(o) > sourceRank(existing)) {
				if (!byCorrelation.has(o.correlationId)) order.push(o.correlationId);
				byCorrelation.set(o.correlationId, o);
			}
		}
	}
	// 2. Dedupe the rest by observationId.
	const byId = new Map<string, UsageObservation>();
	const byIdOrder: string[] = [];
	for (const o of observations) {
		if (o.correlationId) continue;
		if (!byId.has(o.observationId)) {
			byId.set(o.observationId, o);
			byIdOrder.push(o.observationId);
		}
	}
	const merged: UsageObservation[] = [
		...order.map((k) => byCorrelation.get(k)!),
		...byIdOrder.map((k) => byId.get(k)!),
	];

	// 3. Per-session cumulative handling.
	const lastCumulative = new Map<string, number>();
	const normalized: UsageObservation[] = [];
	for (const o of merged) {
		if (!o.cumulative) {
			normalized.push(o);
			continue;
		}
		const key = o.sessionId ?? `${o.projectId}|${o.workspaceId}|${o.agentId ?? ""}`;
		const prev = lastCumulative.get(key) ?? 0;
		const total = o.totalTokens;
		if (total < prev) {
			normalized.push({ ...o, note: appendNote(o.note, "COUNTER_RESET_OR_INCONSISTENCY") });
		} else {
			const delta = total - prev;
			normalized.push({
				...o,
				inputTokens: delta,
				outputTokens: o.outputTokens,
				totalTokens: delta,
				cumulative: false,
				quality: "DERIVED",
			});
			lastCumulative.set(key, total);
		}
	}
	return normalized;
}

function sourceRank(o: UsageObservation): number {
	return SOURCE_PRECEDENCE[o.source] ?? 0;
}

function appendNote(note: string | undefined, added: string): string {
	return note ? `${note};${added}` : added;
}
export interface LoadResult {
	loaded: number;
	dropped: number;
	error?: string;
}

export class TokenLedger {
	private readonly obsFile: string;
	private readonly aggregateFile: string;
	private readonly metaFile: string;
	private readonly observations: UsageObservation[] = [];

	constructor(private readonly dir: string, private readonly schemaVersion = 1) {
		this.obsFile = path.join(dir, "observations.jsonl");
		this.aggregateFile = path.join(dir, "aggregates.json");
		this.metaFile = path.join(dir, "metadata.json");
	}

	load(): LoadResult {
		let loaded = 0;
		let dropped = 0;
		if (!fs.existsSync(this.obsFile)) return { loaded: 0, dropped: 0 };
		const lines = fs.readFileSync(this.obsFile, "utf8").split(/\r?\n/);
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const obs = JSON.parse(trimmed) as UsageObservation;
				if (typeof obs.observationId === "string" && typeof obs.totalTokens === "number") {
					this.observations.push(obs);
					loaded++;
				} else {
					dropped++;
				}
			} catch {
				dropped++;
			}
		}
		return { loaded, dropped };
	}

	/** Record an observation (idempotent by observationId); reconciled on insert. */
	record(input: UsageObservation): void {
		if (this.observations.some((o) => o.observationId === input.observationId)) {
			this.flush();
			return;
		}
		// Preserve order and reconcile cumulative into delta.
		const normalized = normalizeObservations([...this.observations, input]);
		this.observations.length = 0;
		this.observations.push(...normalized);
		this.flush();
	}

	entries(): UsageObservation[] {
		return this.observations;
	}

	totals(f: LedgerFilter = {}): TokenTotals {
		return totals(this.observations, f);
	}

	bySession(): Record<string, TokenTotals> {
		return totalsBy(this.observations, (o) => o.sessionId ?? "unknown", { excludeRaw: true });
	}

	byAgent(): Record<string, TokenTotals> {
		return totalsBy(this.observations, (o) => o.agentId ?? "unknown", { excludeRaw: true });
	}

	byWorkspace(): Record<string, TokenTotals> {
		return totalsBy(this.observations, (o) => o.workspaceId, { excludeRaw: true });
	}

	byProject(): Record<string, TokenTotals> {
		return totalsBy(this.observations, (o) => o.projectId, { excludeRaw: true });
	}

	byModel(): Record<string, TokenTotals> {
		return totalsBy(this.observations, (o) => o.modelId, { excludeRaw: true });
	}

	byProvider(): Record<string, TokenTotals> {
		return totalsBy(this.observations, (o) => o.providerId, { excludeRaw: true });
	}

	rawProbeTotals(): TokenTotals {
		return totals(this.observations, { excludeRaw: false });
	}

	qualityCounts(): Record<string, number> {
		const out: Record<string, number> = {};
		for (const o of this.observations) {
			if (isRawProbe(o)) continue;
			out[o.quality] = (out[o.quality] ?? 0) + 1;
		}
		return out;
	}

	flush(): void {
		fs.mkdirSync(this.dir, { recursive: true });
		atomicWrite(this.obsFile, this.observations.map((o) => JSON.stringify(o)).join("\n") + "\n");
		atomicWrite(
			this.aggregateFile,
			JSON.stringify(
				{
					schemaVersion: this.schemaVersion,
					session: this.bySession(),
					agent: this.byAgent(),
					workspace: this.byWorkspace(),
					project: this.byProject(),
					model: this.byModel(),
					provider: this.byProvider(),
					totals: this.totals(),
				},
				null,
				2,
			),
		);
		atomicWrite(
			this.metaFile,
			JSON.stringify({ schemaVersion: this.schemaVersion, updatedAt: Date.now() }),
		);
	}
}

function atomicWrite(file: string, data: string): void {
	const tmp = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, data, "utf8");
	fs.renameSync(tmp, file);
}

