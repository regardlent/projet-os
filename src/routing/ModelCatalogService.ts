/**
 * ModelCatalogService (W122/W123).
 *
 * Normalizes declared catalog sources (LocalAI, Cline free, ClinePass, optional
 * pay-as-you-go) into `ModelCandidate[]` with a BillingClass. It never invents
 * price or capability. For Cline coding models, capabilities are provider
 * DECLARED (a coding agent implies tools); for LocalAI, tool-calling is NOT
 * assumed unless proven (here: streaming proven, tools unproven).
 *
 * Pure module, deterministic.
 */
import type { BillingClass, Capability, ModelCandidate, Privacy } from "./ModelCandidate.js";
import { OPENAI_COMPATIBLE_PROVIDER_ID, LOCALAI_ENDPOINT, LOCALAI_CHAT_MODEL } from "../runtime/ProviderProfile.js";

export interface CatalogCandidateInput {
	providerId: string;
	modelId: string;
	displayName: string;
	billingClass: BillingClass;
	builtInProviderId?: string;
	capabilities: Capability[];
	contextWindow?: number;
	maxOutputTokens?: number;
	inputPricePer1M?: number;
	outputPricePer1M?: number;
	currency?: string;
	privacy: Privacy;
}

export interface CatalogInput {
	localCandidates?: CatalogCandidateInput[];
	/** Cline recommended-free catalog entries. */
	clineFree?: { id: string; name?: string }[];
	/** ClinePass catalog entries. */
	clinePass?: { id: string; name?: string }[];
	paygCandidates?: CatalogCandidateInput[];
}

export function defaultLocalAICandidate(): CatalogCandidateInput {
	return {
		providerId: OPENAI_COMPATIBLE_PROVIDER_ID,
		modelId: LOCALAI_CHAT_MODEL,
		displayName: "LocalAI · qwen3-4b",
		billingClass: "LOCAL_FREE",
		builtInProviderId: OPENAI_COMPATIBLE_PROVIDER_ID,
		// streaming proven; tools NOT proven -> honest "no".
		capabilities: ["streaming"],
		privacy: "LOCAL",
	};
}

const CLINE_CODING_CAPABILITIES: Capability[] = ["tools", "streaming", "json"];

export function buildCatalog(input: CatalogInput): ModelCandidate[] {
	const out: ModelCandidate[] = [];
	for (const c of input.localCandidates ?? [defaultLocalAICandidate()]) {
		out.push(toCandidate(c));
	}
	for (const e of input.clineFree ?? []) {
		out.push(
			toCandidate({
				providerId: "cline-free",
				modelId: e.id,
				displayName: e.name ?? e.id,
				billingClass: "PROVIDER_FREE",
				builtInProviderId: "cline",
				capabilities: CLINE_CODING_CAPABILITIES,
				privacy: "HOSTED",
			}),
		);
	}
	for (const e of input.clinePass ?? []) {
		out.push(
			toCandidate({
				providerId: "cline-pass",
				modelId: e.id,
				displayName: e.name ?? e.id,
				billingClass: "SUBSCRIPTION_INCLUDED",
				builtInProviderId: "cline-pass",
				capabilities: CLINE_CODING_CAPABILITIES,
				privacy: "HOSTED",
			}),
		);
	}
	for (const c of input.paygCandidates ?? []) {
		out.push(toCandidate(c));
	}
	return out;
}

function toCandidate(i: CatalogCandidateInput): ModelCandidate {
	return {
		providerId: i.providerId,
		modelId: i.modelId,
		displayName: i.displayName,
		billingClass: i.billingClass,
		builtInProviderId: i.builtInProviderId,
		capabilities: i.capabilities,
		contextWindow: i.contextWindow,
		maxOutputTokens: i.maxOutputTokens,
		inputPricePer1M: i.inputPricePer1M,
		outputPricePer1M: i.outputPricePer1M,
		currency: i.currency,
		health: "AVAILABLE",
		modelState: "AVAILABLE",
		quotaState: "AVAILABLE",
		privacy: i.privacy,
	};
}

export { LOCALAI_ENDPOINT, LOCALAI_CHAT_MODEL };
