/**
 * ToolCallDiagnostic (Phase 8).
 *
 * Classifies a raw OpenAI-compatible tool probe. Encodes the Phase 8 finding:
 * with qwen3-4b, NO tool call was emitted across CONTROL / no-thinking /
 * larger-output-budget variants, so the "reasoning exhausted the output budget"
 * hypothesis (H1) is DISPROVEN. Pure module, deterministic, testable.
 */

export type RawToolOutcome = "RAW_TOOL_PASS" | "RAW_TOOL_NO_CALL" | "RAW_TOOL_MALFORMED";

export interface RawToolProbeResult {
	finishReason?: string;
	hasToolCalls: boolean;
	toolCallsCount: number;
	contentLength: number;
	reasoningDisabledAttempted?: boolean;
	largerOutputBudgetUsed?: boolean;
	maxTokens?: number;
}

export function classifyRawToolProbe(r: RawToolProbeResult): RawToolOutcome {
	if (r.hasToolCalls && r.toolCallsCount > 0) return "RAW_TOOL_PASS";
	if (r.hasToolCalls && r.toolCallsCount === 0) return "RAW_TOOL_MALFORMED";
	return "RAW_TOOL_NO_CALL";
}

/**
 * Candidate check for H1 (reasoning/output budget exhaustion). Returns true only
 * when the probe STOPPED at length WITHOUT a tool call AND the output budget was
 * not already expanded. If a larger budget was tried and the model still emitted
 * no tool call, this is false -> H1 is disproven for this case.
 */
export function isLikelyReasoningBudgetExhaustion(r: RawToolProbeResult): boolean {
	if (r.hasToolCalls) return false;
	if (r.finishReason !== "length") return false;
	if (r.largerOutputBudgetUsed) return false;
	return r.contentLength >= 8000; // long "reasoning-like" prose with no tool call
}

/** Interpret the observed matrix into a concise diagnosis string. */
export function interpretRawToolMatrix(results: RawToolProbeResult[]): string {
	const pass = results.some((r) => classifyRawToolProbe(r) === "RAW_TOOL_PASS");
	if (pass) return "RAW_TOOL_PASS";
	const noCall = results.every((r) => classifyRawToolProbe(r) === "RAW_TOOL_NO_CALL");
	if (noCall) {
		const anyStop = results.some((r) => r.finishReason === "stop");
		const anyLargeOutput = results.some((r) => r.largerOutputBudgetUsed === true && r.finishReason === "stop");
		if (anyLargeOutput && anyStop) {
			return "MODEL_NOT_TOOL_CAPABLE_IN_CONFIG (H1 disproven: larger output still no tool call)";
		}
		if (anyStop) return "MODEL_NO_TOOL_CALL (finished without tool call)";
		return "REASONING_BUDGET_EXHAUSTION_CANDIDATE (H1)";
	}
	return "RAW_TOOL_MALFORMED";
}
