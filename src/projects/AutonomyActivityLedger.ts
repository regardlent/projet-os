/**
 * AutonomyActivityLedger — the FACT SOURCE for autonomy run summaries (Phase 14).
 * Records tool/read/write/model events; summary is computed deterministically,
 * never from model assertions. No source contents, no secrets.
 */
import type { AutonomyPlan } from "./autonomy.js";

export type LedgerEventType =
	| "tool-call"
	| "tool-result"
	| "read"
	| "write"
	| "model-switch"
	| "abort"
	| "error";

export interface LedgerEvent {
	ts: number;
	iteration: number;
	model: string;
	eventType: LedgerEventType;
	tool?: string;
	path?: string;
	status?: "ok" | "error" | "blocked" | "skipped";
	durationMs?: number;
}

export class AutonomyActivityLedger {
	private events: LedgerEvent[] = [];

	add(e: LedgerEvent): void {
		this.events.push(e);
	}

	all(): LedgerEvent[] {
		return this.events.slice();
	}

	toolCalls(): number {
		return this.events.filter((e) => e.eventType === "tool-call").length;
	}

	modelSwitches(): number {
		return this.events.filter((e) => e.eventType === "model-switch").length;
	}

	filesRead(): string[] {
		return [...new Set(this.events.filter((e) => e.path && (e.eventType === "read" || e.eventType === "tool-result")).map((e) => e.path!))];
	}

	filesChanged(): string[] {
		return [...new Set(this.events.filter((e) => e.path && e.eventType === "write").map((e) => e.path!))];
	}

	aborted(): boolean {
		return this.events.some((e) => e.eventType === "abort");
	}

	errors(): LedgerEvent[] {
		return this.events.filter((e) => e.eventType === "error");
	}

	tools(): string[] {
		return [...new Set(this.events.filter((e) => e.tool).map((e) => e.tool!))];
	}

	replaceAll(events: LedgerEvent[]): void {
		this.events = events.slice();
	}
}

/** Deterministic, fact-based summary (ledger is the source of truth). */
export function deterministicSummary(plan: AutonomyPlan, ledger: AutonomyActivityLedger): string {
	const models = [...new Set(ledger.all().map((e) => e.model))];
	const lines = [
		"AUTONOMY RUN",
		`Run: ${plan.goalId}`,
		`Goal: ${plan.objective}`,
		`Duration: ${plan.minutes} min`,
		`Status: ${plan.status}`,
		`Model(s): ${models.length ? models.join(", ") : "(none)"}`,
		"",
		`Files read: ${ledger.filesRead().length}`,
		`Files changed: ${ledger.filesChanged().length}`,
		`Files created: ${ledger.filesChanged().length - countDeleted(ledger)}`,
		"",
		`Tool calls: ${ledger.toolCalls()}`,
		`Tools: ${ledger.tools().length ? ledger.tools().join(", ") : "(none)"}`,
		`Model fallbacks: ${ledger.modelSwitches()}`,
		`Failures: ${ledger.errors().length}`,
		`Aborted: ${ledger.aborted() ? "yes" : "no"}`,
		"",
		"## Diff",
		...(ledger.filesChanged().length ? ledger.filesChanged().map((p) => `- ${p}`) : ["- (none)"]),
		"",
		"## Result",
		`- Status: ${plan.status}`,
		`- Fallbacks: ${ledger.modelSwitches()}`,
		"",
		"## Next",
		"- Poursuivre sur les prochaines unités, puis QA + handoff.",
	];
	return lines.join("\n");
}

function countDeleted(ledger: AutonomyActivityLedger): number {
	return ledger.all().filter((e) => e.eventType === "write" && e.status === "blocked").length;
}
