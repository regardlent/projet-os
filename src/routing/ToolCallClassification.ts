/**
 * ToolCallClassification (W154/W11).
 *
 * Classifies a read-only tool-call probe outcome into one of the documented
 * categories. A model answering from memory without a tool event is NEVER a
 * pass. Pure module, deterministic.
 */

export type ToolCallOutcome =
	| "SUCCESS"
	| "MODEL_DID_NOT_REQUEST_TOOL"
	| "MODEL_TOOL_FORMAT_INVALID"
	| "SDK_TOOL_REJECTED"
	| "POLICY_BLOCKED"
	| "TOOL_RUNTIME_FAILED"
	| "TOOL_RESULT_NOT_CONSUMED";

export interface ToolCallEvidence {
	/** Number of tool_call hook events observed. */
	requestedToolCalls: number;
	/** Number of tool_result hook events observed. */
	finishedToolCalls: number;
	/** Tool names observed in tool_call events. */
	toolNames: string[];
	/** Tool names required by the probe (e.g. ["read_files"]). */
	expectedToolNames: string[];
	/** Did the final assistant answer the probe (e.g. contains PACKAGE_NAME=<name>). */
	finalAnswerCorrect: boolean;
	/** Was there a policy-blocked signal (e.g. autoApprove=false / disabled). */
	policyBlocked?: boolean;
	/** Did a tool runtime error occur. */
	toolRuntimeError?: boolean;
}

export function classifyToolCall(ev: ToolCallEvidence): ToolCallOutcome {
	if (ev.policyBlocked) return "POLICY_BLOCKED";
	if (ev.toolRuntimeError) return "TOOL_RUNTIME_FAILED";
	if (ev.requestedToolCalls === 0) return "MODEL_DID_NOT_REQUEST_TOOL";
	if (ev.toolNames.length === 0 || !ev.expectedToolNames.every((t) => ev.toolNames.includes(t))) {
		return "MODEL_TOOL_FORMAT_INVALID";
	}
	if (ev.finishedToolCalls === 0 && ev.requestedToolCalls > 0) return "SDK_TOOL_REJECTED";
	if (ev.finishedToolCalls < ev.requestedToolCalls && ev.finishedToolCalls > 0) {
		return "TOOL_RESULT_NOT_CONSUMED";
	}
	if (!ev.finalAnswerCorrect) return "TOOL_RESULT_NOT_CONSUMED";
	return "SUCCESS";
}
