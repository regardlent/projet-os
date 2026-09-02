/**
 * ModelScoreboard + AccountState (Phase 6).
 *
 * A read-only model scoreboard (fit / status / billing / LOCKED for disabled
 * PAYG) and a normalized Cline account state. Pure module, deterministic.
 */
import type { BillingClass, ModelCandidate } from "./ModelCandidate.js";

export interface ScoreboardRow {
	modelId: string;
	providerId: string;
	fit: number;
	status: string;
	billing: BillingClass;
	locked: boolean;
}

export function buildScoreboard(
	candidates: ModelCandidate[],
	fitnessFor: (c: ModelCandidate) => number,
	paidEnabled: boolean,
): ScoreboardRow[] {
	return candidates
		.map((c) => {
			const paid = c.billingClass === "PAY_AS_YOU_GO";
			const locked = paid && !paidEnabled;
			return {
				modelId: c.modelId,
				providerId: c.providerId,
				fit: Math.round(fitnessFor(c) * 100) / 100,
				status: c.modelState,
				billing: c.billingClass,
				locked,
			};
		})
		.sort((a, b) => b.fit - a.fit);
}

// --- Account state ---
export type AccountFeatureState = "AVAILABLE" | "UNCONFIGURED" | "UNAVAILABLE" | "UNKNOWN";

export interface ClineAccountState {
	authenticated: boolean | "UNKNOWN";
	freeTier: AccountFeatureState;
	clinePass: AccountFeatureState;
	payg: AccountFeatureState;
	/** true if no credential/signal was observed (never returned as usable). */
	obsolescent?: boolean;
}

export interface AccountStateInput {
	authenticated?: boolean;
	hasFreeCatalog?: boolean;
	hasPassCatalog?: boolean;
	paygAllowed?: boolean;
}

export function normalizeAccountState(input: AccountStateInput): ClineAccountState {
	const authenticated = input.authenticated === true ? true : input.authenticated === false ? false : "UNKNOWN";
	const freeTier: AccountFeatureState = input.hasFreeCatalog === true ? "AVAILABLE" : "UNCONFIGURED";
	const clinePass: AccountFeatureState = input.hasPassCatalog === true ? "AVAILABLE" : "UNCONFIGURED";
	const payg: AccountFeatureState =
		input.paygAllowed === true ? "AVAILABLE" : input.paygAllowed === false ? "UNAVAILABLE" : "UNCONFIGURED";
	return { authenticated, freeTier, clinePass, payg };
}
