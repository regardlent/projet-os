/**
 * Token usage domain model (Phase 4).
 *
 * Numbers + metadata only. Never stores prompt/assistant content, source,
 * tool output, keys, or any secret. Pure module.
 *
 * IMPORTANT: this is a PROJECT OS abstraction for token telemetry. The field
 * names here are OUR schema; they are NOT asserted to be Cline SDK names. The
 * adapter layer maps real SDK types onto these structures.
 */

export type UsageSource =
	| "CLINE_SESSION_RESULT"
	| "CLINE_ACCUMULATED_USAGE"
	| "CLINE_USAGE_EVENT"
	| "CLINE_PROVIDER_STREAM_USAGE"
	| "LOCALAI_REQUEST_USAGE"
	| "LOCALAI_USAGE_API"
	| "HISTORICAL_IMPORT"
	| "LOCAL_ESTIMATE"
	| "UNKNOWN";

export type UsageQuality = "EXACT" | "DERIVED" | "ESTIMATED" | "UNKNOWN";

/** Scope of the observation; RAW_PROBE is never counted as a Cline session. */
export type UsageScope = "CLINE_SESSION" | "RAW_PROBE" | "HISTORICAL" | "PROJECT_OS";

export interface UsageObservation {
	/** Stable identifier (not solely time-based). */
	observationId: string;
	projectId: string;
	workspaceId: string;
	workspacePath: string;
	sessionId?: string;
	runId?: string;
	turnId?: string;
	agentId?: string;
	teamId?: string;
	providerId: string;
	modelId: string;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	source: UsageSource;
	quality: UsageQuality;
	scope: UsageScope;
	/** True if input/output are cumulative snapshots (converted to delta by the reconciler). */
	cumulative?: boolean;
	/** Correlation key for the SAME underlying request (anti-double-count). */
	correlationId?: string;
	timestamp: number;
	note?: string;
}

export interface TokenTotals {
	input: number;
	output: number;
	total: number;
}

export function isRawProbe(observation: UsageObservation): boolean {
	return observation.scope === "RAW_PROBE";
}

/** A confirmed Cline session observation (excluded from RAW_PROBE). */
export function isClineSession(observation: UsageObservation): boolean {
	return observation.scope === "CLINE_SESSION" || observation.scope === "HISTORICAL";
}
