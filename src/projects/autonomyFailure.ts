/**
 * Autonomy outcome classification (Phase 14). Pure, testable.
 * Distinguishes infrastructure success from model task quality, and flags
 * MODEL_EMPTY_OUTPUT instead of a misleading SUCCESS_NO_ACTIVITY.
 */
export type AutonomyOutcomeKind =
	| "SUCCESS"
	| "SUCCESS_NO_ACTIVITY"
	| "MODEL_EMPTY_OUTPUT"
	| "NO_REQUIRED_TOOL_CALL"
	| "MALFORMED_TOOL_CALL"
	| "REPEATED_NO_PROGRESS";

export interface AutonomyOutcomeInput {
	outputText: string;
	toolCalls: number;
	/** Mission explicitly demanded content/activity (analysis, code, tool call). */
	missionRequiresContent: boolean;
	/** Mission explicitly demanded at least one tool call. */
	missionRequiresTool: boolean;
}

export function classifyAutonomyOutcome(input: AutonomyOutcomeInput): AutonomyOutcomeKind {
	const trimmed = input.outputText.trim();
	const empty = trimmed.length === 0;
	if (empty && input.toolCalls === 0 && input.missionRequiresContent) return "MODEL_EMPTY_OUTPUT";
	if (input.missionRequiresTool && input.toolCalls === 0) return "NO_REQUIRED_TOOL_CALL";
	if (input.toolCalls === 0 && !empty && input.missionRequiresContent) return "SUCCESS_NO_ACTIVITY";
	if (input.toolCalls === 0 && !empty) return "SUCCESS_NO_ACTIVITY";
	return "SUCCESS";
}

/** Is this a recoverable (model-level) failure vs a hard failure? */
export function isModelFailure(kind: AutonomyOutcomeKind): boolean {
	return (
		kind === "MODEL_EMPTY_OUTPUT" ||
		kind === "NO_REQUIRED_TOOL_CALL" ||
		kind === "MALFORMED_TOOL_CALL" ||
		kind === "REPEATED_NO_PROGRESS"
	);
}
