/**
 * ModelCatalog (Phase 24, W19). A faithful view of available models. Only fields that are
 * actually known are populated; anything unproven is reported as "UNKNOWN", never guessed.
 * Pure + testable. This is an audit/normalization layer over the existing ModelCandidate set.
 */
import type { BillingClass, Capability, ModelCandidate, Privacy } from "../routing/ModelCandidate.js";

export type KnownOrUnknown<T> = T | "UNKNOWN";

export interface CatalogModelRecord {
	modelId: string;
	providerId: string;
	displayName: string;
	billingClass: BillingClass;
	capabilities: Capability[];
	privacy: Privacy;
	/** Parameter class (e.g. "3B", "4B") — only if declared, else UNKNOWN. */
	parameterClass: KnownOrUnknown<string>;
	/** Whether it is LocalAI-provided (loopback). */
	localAI: boolean;
	/** Context window (if declared). */
	contextWindow: KnownOrUnknown<number>;
	/** Proven GPU eligibility (flash-ready) — only if evidence, else UNKNOWN. */
	flashReady: KnownOrUnknown<boolean>;
	/** Gap in the candidate (a missing declared field we refuse to invent). */
	gaps: string[];
}

export interface ModelCatalogView {
	records: CatalogModelRecord[];
	count: number;
	localAiCount: number;
	byProvider: Record<string, number>;
}

/** Build a faithful record from a ModelCandidate, flagging gaps as UNKNOWN. */
export function recordFromCandidate(c: ModelCandidate): CatalogModelRecord {
	const gaps: string[] = [];
	if (typeof c.contextWindow !== "number") gaps.push("contextWindow");
	// parameterClass / flashReady are not declared on ModelCandidate -> we do NOT invent them.
	const parameterClass: KnownOrUnknown<string> = "UNKNOWN";
	const flashReady: KnownOrUnknown<boolean> = "UNKNOWN";
	return {
		modelId: c.modelId,
		providerId: c.providerId,
		displayName: c.displayName,
		billingClass: c.billingClass,
		capabilities: c.capabilities.slice(),
		privacy: c.privacy,
		parameterClass,
		localAI: c.providerId === "openai-compatible",
		contextWindow: typeof c.contextWindow === "number" ? c.contextWindow : "UNKNOWN",
		flashReady,
		gaps,
	};
}

/** Produce the unified catalog view. */
export function catalogView(candidates: readonly ModelCandidate[]): ModelCatalogView {
	const records = candidates.map(recordFromCandidate);
	const byProvider: Record<string, number> = {};
	for (const r of records) byProvider[r.providerId] = (byProvider[r.providerId] ?? 0) + 1;
	return {
		records,
		count: records.length,
		localAiCount: records.filter((r) => r.localAI).length,
		byProvider,
	};
}
