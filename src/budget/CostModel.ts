/**
 * Cost model (Phase 5).
 *
 * Cost quality is explicit and never invented. No fake price. LocalAI and free
 * models are EXACT_ZERO for marginal API cost; subscription-covered runs do not
 * touch the pay-as-you-go daily budget; unknown price requires approval.
 */
import type { BillingClass } from "../routing/ModelCandidate.js";

export type CostQuality =
	| "EXACT_BILLED"
	| "EXACT_ZERO"
	| "SUBSCRIPTION_COVERED"
	| "ESTIMATED"
	| "UNKNOWN";

export interface CostObservation {
	costId: string;
	projectId: string;
	workspaceId: string;
	sessionId?: string;
	runId?: string;
	agentId?: string;
	teamId?: string;
	providerId: string;
	modelId: string;
	billingClass: BillingClass;
	currency?: string;
	actualCost?: number;
	estimatedCost?: number;
	coveredBySubscription: boolean;
	source: "SDK_BILLED" | "LOCALAI" | "CATALOG_ESTIMATE" | "PROJECT" | "UNKNOWN";
	quality: CostQuality;
	timestamp: number;
}

/** Estimate cost from tokens + per-1M prices; UNKNOWN if any needed part is missing. */
export function estimateCost(opts: {
	inputTokens: number;
	outputTokens: number;
	inputPricePer1M?: number;
	outputPricePer1M?: number;
	currency?: string;
}): { cost?: number; currency?: string; quality: CostQuality } {
	const { inputTokens, outputTokens, inputPricePer1M, outputPricePer1M, currency } = opts;
	if (inputPricePer1M === undefined || outputPricePer1M === undefined) {
		return { quality: "UNKNOWN" };
	}
	const cost =
		(inputTokens / 1_000_000) * inputPricePer1M + (outputTokens / 1_000_000) * outputPricePer1M;
	return { cost, currency, quality: "ESTIMATED" };
}

/** Map a billing class to the marginal API cost quality. */
export function marginalCostQuality(billingClass: BillingClass): CostQuality {
	switch (billingClass) {
		case "LOCAL_FREE":
		case "PROVIDER_FREE":
			return "EXACT_ZERO";
		case "SUBSCRIPTION_INCLUDED":
			return "SUBSCRIPTION_COVERED";
		case "PAY_AS_YOU_GO":
		case "BYOK":
			return "ESTIMATED";
		default:
			return "UNKNOWN";
	}
}
