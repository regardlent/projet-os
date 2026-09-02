/**
 * CostLedger (W128/W146).
 *
 * Persistent, atomic, idempotent ledger of cost observations. Joins with the
 * TokenLedger by session/run. Distinguishes pay-as-you-go billed cost from
 * subscription-covered and free usage so the daily paid budget is never polluted.
 *
 * Pure module: node:fs (directory injected).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { type CostObservation } from "./CostModel.js";

export interface CostTotals {
	paygActual: number;
	paygEstimated: number;
	subscriptionCovered: number;
	free: number; // EXACT_ZERO count (not a $)
	unknown: number;
	currency?: string;
}

export class CostLedger {
	private readonly file: string;
	private readonly observations: CostObservation[] = [];

	constructor(private readonly dir: string) {
		this.file = path.join(dir, "cost.jsonl");
	}

	load(): { loaded: number; dropped: number } {
		let loaded = 0;
		let dropped = 0;
		if (!fs.existsSync(this.file)) return { loaded: 0, dropped: 0 };
		for (const line of fs.readFileSync(this.file, "utf8").split(/\r?\n/)) {
			const t = line.trim();
			if (!t) continue;
			try {
				const o = JSON.parse(t) as CostObservation;
				if (typeof o.costId === "string") {
					this.observations.push(o);
					loaded++;
				} else dropped++;
			} catch {
				dropped++;
			}
		}
		return { loaded, dropped };
	}

	record(o: CostObservation): void {
		if (this.observations.some((x) => x.costId === o.costId)) {
			this.flush();
			return;
		}
		this.observations.push(o);
		this.flush();
	}

	entries(): CostObservation[] {
		return this.observations;
	}

	/** Sum actual pay-as-you-go billed cost (e.g. provider `cline`, PAY_AS_YOU_GO). */
	paygActual(): number {
		let sum = 0;
		for (const o of this.observations) {
			if (o.billingClass === "PAY_AS_YOU_GO" && o.quality === "EXACT_BILLED") {
				sum += o.actualCost ?? 0;
			}
		}
		return sum;
	}

	totals(): CostTotals {
		let paygActual = 0;
		let paygEstimated = 0;
		let subscriptionCovered = 0;
		let free = 0;
		let unknown = 0;
		for (const o of this.observations) {
			if (o.quality === "EXACT_BILLED") paygActual += o.actualCost ?? 0;
			else if (o.quality === "ESTIMATED") paygEstimated += o.estimatedCost ?? 0;
			else if (o.quality === "SUBSCRIPTION_COVERED") subscriptionCovered += o.estimatedCost ?? 0;
			else if (o.quality === "EXACT_ZERO") free++;
			else unknown++;
		}
		return { paygActual, paygEstimated, subscriptionCovered, free, unknown };
	}

	byModel(): Record<string, CostTotals> {
		const out: Record<string, CostTotals> = {};
		for (const o of this.observations) {
			out[o.modelId] = out[o.modelId] ?? { paygActual: 0, paygEstimated: 0, subscriptionCovered: 0, free: 0, unknown: 0 };
			const t = out[o.modelId];
			if (o.quality === "EXACT_BILLED") t.paygActual += o.actualCost ?? 0;
			else if (o.quality === "ESTIMATED") t.paygEstimated += o.estimatedCost ?? 0;
			else if (o.quality === "SUBSCRIPTION_COVERED") t.subscriptionCovered += o.estimatedCost ?? 0;
			else if (o.quality === "EXACT_ZERO") t.free++;
			else t.unknown++;
		}
		return out;
	}

	flush(): void {
		fs.mkdirSync(this.dir, { recursive: true });
		const tmp = `${this.file}.${process.pid}.tmp`;
		fs.writeFileSync(tmp, this.observations.map((o) => JSON.stringify(o)).join("\n") + "\n", "utf8");
		fs.renameSync(tmp, this.file);
	}
}
