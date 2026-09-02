/**
 * InferenceEvidence / strict inference gate (W19, W20, W111).
 *
 * Distinguishes a real assistant model response from a runtime/provider error
 * string. No error text, no fixture, no token-0 result may be treated as a pass.
 *
 * Pure module: no `vscode` import.
 */

export interface InferenceEvidence {
	provider: string;
	model: string;
	sessionId: string;
	startedAt: number;
	finishedAt: number;
	/** Raw final assistant text. */
	text: string;
	inputTokens: number;
	outputTokens: number;
	finishReason: string | null;
	/** Provider-level error string, if any. */
	providerError: string | null;
}

/** Strings that an assistant text could contain but that are NOT valid inference. */
const ERROR_MARKERS = [
	"unknown or disabled provider",
	"provider error",
	"no such model",
	"model not found",
	"unauthorized",
	"invalid api key",
	"not subscribed",
];

/** True if the evidence carries a provider/runtime error, never a model answer. */
export function hasProviderError(evidence: InferenceEvidence): boolean {
	if (evidence.providerError && evidence.providerError.trim().length > 0) return true;
	const lower = evidence.text.toLowerCase();
	return ERROR_MARKERS.some((m) => lower.includes(m));
}

/** Has any real text at all (non-empty, not an error string). */
export function hasRealText(evidence: InferenceEvidence): boolean {
	if (!evidence.text || evidence.text.trim().length === 0) return false;
	return !hasProviderError(evidence);
}

/**
 * Strict inference pass:
 *   PASS = real text AND outputTokens > 0 AND no provider/runtime error.
 * Implements W17/W20 (never let an error string or token-0 result be a pass).
 */
export function inferencePasses(evidence: InferenceEvidence): boolean {
	return hasRealText(evidence) && evidence.outputTokens > 0 && !hasProviderError(evidence);
}

/** Classify the run into a single status for reporting. */
export function classifyInference(evidence: InferenceEvidence): "PASS" | "BLOCK" {
	return inferencePasses(evidence) ? "PASS" : "BLOCK";
}

/** Reason string for why the gate did not pass (for honest reporting). */
export function failReason(evidence: InferenceEvidence): string {
	if (hasProviderError(evidence)) return "provider or runtime error text measured";
	if (!hasRealText(evidence)) return "no real assistant text measured";
	if (evidence.outputTokens <= 0) return "outputTokens <= 0 (usage reporting gap or no inference)";
	return "unknown";
}
