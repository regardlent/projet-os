/**
 * ModelCandidate / billing & model state (Phase 5).
 *
 * Pure data + enums. Numbers/metadata only; no content, no secrets.
 * Exact field names are OUR schema; the adapter maps real SDK catalog types onto
 * these.
 */

export type BillingClass =
	| "LOCAL_FREE"
	| "PROVIDER_FREE"
	| "SUBSCRIPTION_INCLUDED"
	| "PAY_AS_YOU_GO"
	| "BYOK"
	| "UNKNOWN";

export type ProviderState =
	| "AVAILABLE"
	| "UNAVAILABLE"
	| "AUTH_REQUIRED"
	| "RATE_LIMITED"
	| "QUOTA_EXHAUSTED"
	| "CREDITS_EXHAUSTED"
	| "SUBSCRIPTION_REQUIRED"
	| "MODEL_UNAVAILABLE"
	| "COOLDOWN"
	| "UNKNOWN";

export type ModelState =
	| "AVAILABLE"
	| "RATE_LIMITED"
	| "QUOTA_EXHAUSTED"
	| "COOLDOWN"
	| "INCOMPATIBLE"
	| "UNHEALTHY"
	| "UNKNOWN";

export type Capability =
	| "tools"
	| "reasoning"
	| "vision"
	| "streaming"
	| "json";

export type Privacy = "LOCAL" | "HOSTED";

export interface ModelCandidate {
	providerId: string;
	modelId: string;
	displayName: string;
	billingClass: BillingClass;
	/** Official Cline built-in id (e.g. "cline", "cline-pass", "openai-compatible"). */
	builtInProviderId?: string;
	capabilities: Capability[];
	contextWindow?: number;
	maxOutputTokens?: number;
	/** Optional catalog pricing (per 1M tokens) — UNKNOWN if absent. */
	inputPricePer1M?: number;
	outputPricePer1M?: number;
	currency?: string;
	health: ProviderState;
	modelState: ModelState;
	quotaState?: "AVAILABLE" | "LIMITED" | "EXHAUSTED" | "UNKNOWN";
	/** Ephemeral-only if quota is unknown. */
	cooldownUntil?: number;
	resetAt?: number;
	privacy: Privacy;
	observedLatencyMs?: number;
}

export function isCapable(c: ModelCandidate, required: readonly Capability[]): boolean {
	return required.every((cap) => c.capabilities.includes(cap));
}

export function hasUsableContext(c: ModelCandidate, requiredContext: number): boolean {
	if (c.contextWindow === undefined) return true; // unknown -> do not reject solely on that
	return c.contextWindow >= requiredContext;
}

/** A candidate is eligible as a *candidate* (health not definitively unavailable). */
export function isUp(c: ModelCandidate, now: number): boolean {
	if (c.modelState === "INCOMPATIBLE") return false;
	if (c.modelState === "UNHEALTHY") return false;
	if (c.cooldownUntil !== undefined && c.cooldownUntil > now) return false;
	return c.health !== "UNAVAILABLE" && c.health !== "QUOTA_EXHAUSTED" && c.health !== "CREDITS_EXHAUSTED";
}

/** Whether this candidate results in a marginal paid API cost (>0 for the project). */
export function isPaidCost(c: ModelCandidate): boolean {
	return c.billingClass === "PAY_AS_YOU_GO";
}

export function isZeroMarginalCost(c: ModelCandidate): boolean {
	return (
		c.billingClass === "LOCAL_FREE" ||
		c.billingClass === "PROVIDER_FREE" ||
		c.billingClass === "SUBSCRIPTION_INCLUDED"
	);
}
