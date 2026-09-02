/**
 * ProjectBudgetGovernor + atomic BudgetReservations (W129/W130).
 *
 * Hard daily cap on pay-as-you-go spend for a single projectId (all sessions,
 * agents, aliases). Atomic reservations prevent concurrent agents from jointly
 * exceeding the budget. Pure module & deterministic (spend source injected).
 */
import { type BudgetStatus } from "./BudgetStatus.js";

export type RoutingPolicy =
	| "LOCAL_FIRST"
	| "FREE_FIRST"
	| "FREE_UNTIL_EXHAUSTED"
	| "PASS_FIRST"
	| "BALANCED"
	| "QUALITY_FIRST_WITH_BUDGET"
	| "MANUAL"
	| "FREE_ONLY";

export type PaidInferenceMode = "OFF" | "ASK_EVERY_TIME" | "AUTO_WITHIN_PROJECT_BUDGET";

export interface BudgetReservation {
	reservationId: string;
	amount: number;
	createdAt: number;
	expiresAt: number;
}

export interface BudgetWindow {
	startsAt: number;
	endsAt: number;
	zoneMinutes: number;
}

export const RESERVATION_TTL_MS = 30 * 60 * 1000;

/** Start of the local day for a given timestamp + timezone offset in minutes. */
export function startOfDayForZone(ts: number, zoneMinutes: number): number {
	const shifted = ts + zoneMinutes * 60_000;
	const d = new Date(shifted);
	const utcDayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	return utcDayStart - zoneMinutes * 60_000;
}

export interface BudgetGovernorConfig {
	projectId: string;
	dailyPaidBudget: number;
	currency: string;
	paidInferenceMode: PaidInferenceMode;
	/** Timezone offset in minutes (default: host local). */
	zoneMinutes?: number;
	warnPercent?: number;
	/** Returns current actual daily pay-as-you-go spend. */
	getActualPaidSpend: () => number;
}

export class ProjectBudgetGovernor {
	private readonly reservations = new Map<string, BudgetReservation>();
	private readonly projectId: string;
	private readonly dailyPaidBudget: number;
	private readonly currency: string;
	private readonly paidInferenceMode: PaidInferenceMode;
	private readonly zoneMinutes: number;
	private readonly warnPercent: number;
	private readonly getActualPaidSpend: () => number;
	private now: () => number;

	constructor(cfg: BudgetGovernorConfig, now: () => number = Date.now) {
		this.projectId = cfg.projectId;
		this.dailyPaidBudget = cfg.dailyPaidBudget;
		this.currency = cfg.currency;
		this.paidInferenceMode = cfg.paidInferenceMode;
		this.zoneMinutes = cfg.zoneMinutes ?? -new Date().getTimezoneOffset();
		this.warnPercent = cfg.warnPercent ?? 80;
		this.getActualPaidSpend = cfg.getActualPaidSpend;
		this.now = now;
	}

	window(ts: number = this.now()): BudgetWindow {
		const startsAt = startOfDayForZone(ts, this.zoneMinutes);
		return { startsAt, endsAt: startOfDayForZone(startsAt + 1, this.zoneMinutes), zoneMinutes: this.zoneMinutes };
	}

	reservedTotal(ts: number = this.now()): number {
		this.pruneExpired(ts);
		let sum = 0;
		for (const r of this.reservations.values()) sum += r.amount;
		return sum;
	}

	get dailyBudgetCurrency(): string {
		return this.currency;
	}

	get dailyBudget(): number {
		return this.dailyPaidBudget;
	}

	get paidMode(): PaidInferenceMode {
		return this.paidInferenceMode;
	}

	get id(): string {
		return this.projectId;
	}

	spent(): number {
		return this.getActualPaidSpend();
	}

	canUsePaid(): boolean {
		return this.paidInferenceMode !== "OFF";
	}

	/** Non-destructive affordability check (router never mutates budget). */
	canAfford(cost: number): boolean {
		if (!this.canUsePaid()) return false;
		return cost <= this.remaining() + 1e-9;
	}

	/** Remaining daily budget (spent + reserved). */
	remaining(ts: number = this.now()): number {
		return Math.max(0, this.dailyPaidBudget - this.spent() - this.reservedTotal(ts));
	}

	/**
	 * Atomically reserve an estimated cost for a PAYG run.
	 * Allowed only if spent + reserved + estimate <= dailyBudget and paid mode isn't OFF.
	 */
	reserve(
		estimatedCost: number,
		candidate: { providerId: string; modelId: string; billingClass: string },
	): { allowed: boolean; reason?: string; reservationId?: string } {
		const ts = this.now();
		this.pruneExpired(ts);
		if (candidate.billingClass !== "PAY_AS_YOU_GO") {
			return { allowed: true, reason: "zero marginal cost / subscription covered" };
		}
		if (this.paidInferenceMode === "OFF") {
			return { allowed: false, reason: "PAID_INFERENCE_DISABLED" };
		}
		const total = this.spent() + this.reservedTotal(ts) + estimatedCost;
		if (total > this.dailyPaidBudget + 1e-9) {
			return { allowed: false, reason: "BUDGET_EXCEEDED" };
		}
		const reservationId = `${this.projectId}|${candidate.modelId}|${ts}|${estimatedCost.toFixed(4)}`;
		this.reservations.set(reservationId, {
			reservationId,
			amount: estimatedCost,
			createdAt: ts,
			expiresAt: ts + RESERVATION_TTL_MS,
		});
		return { allowed: true, reservationId };
	}

	release(reservationId: string): void {
		this.reservations.delete(reservationId);
	}

	/** Record actual cost vs reservation; returns the delta and whether budget stays healthy. */
	commitActual(
		actualCost: number,
		reservationId?: string,
	): { delta: number; stillWithinBudget: boolean } {
		if (reservationId) this.reservations.delete(reservationId);
		const totalAfter = this.spent() + actualCost;
		return { delta: actualCost, stillWithinBudget: totalAfter <= this.dailyPaidBudget + 1e-9 };
	}

	status(): BudgetStatus {
		if (this.paidInferenceMode === "OFF") return "DISABLED";
		if (this.dailyPaidBudget <= 0) return "EXHAUSTED";
		const spend = this.spent();
		const remainingBudget = this.dailyPaidBudget - spend;
		if (remainingBudget <= 0) return "EXHAUSTED";
		const usedPct = spend / this.dailyPaidBudget;
		if (usedPct >= 1) return "EXHAUSTED";
		if (usedPct >= 0.95) return "NEAR_LIMIT";
		if (usedPct >= this.warnPercent / 100) return "WARNING";
		return "HEALTHY";
	}

	private pruneExpired(ts: number): void {
		for (const [id, r] of this.reservations) {
			if (r.expiresAt <= ts) this.reservations.delete(id);
		}
	}
}
