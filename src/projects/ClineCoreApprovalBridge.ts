/**
 * ClineCoreApprovalBridge (Phase 15, W617-618).
 * Converts a ClineCore hub `approval.requested` event into an approved/denied
 * decision using the Project OS write scope + guard. Pure + testable; the hub
 * response transport (`resolvePendingApproval`/`handleApprovalRespond`) is the
 * wiring layer that consumes this decision.
 */
import { evaluateWriteApproval, opFromToolName, pathFromWriteInput } from "./WriteApproval.js";
import type { AutonomyWriteScope } from "./AutonomyWriteScope.js";

export interface ApprovalBridgeInput {
	approvalId: string;
	sessionId: string;
	runId: string;
	toolName: string;
	toolInput: unknown;
	scope: AutonomyWriteScope;
}

export interface ApprovalBridgeDecision {
	approvalId: string;
	approved: boolean;
	reason?: string;
}

/**
 * Decide an approval. Fail-closed: unknown tool / shell / out-of-scope /
 * protected / secret => denied. Only scoped create/modify/patch are approved.
 */
export function decideApproval(input: ApprovalBridgeInput): ApprovalBridgeDecision {
	const { approvalId, toolName, toolInput, scope } = input;
	if (toolName === "run_commands" || toolName === "bash") {
		return { approvalId, approved: false, reason: "SHELL_SEPARATE_LANE" };
	}
	const op = opFromToolName(toolName);
	if (!op) return { approvalId, approved: false, reason: "NOT_ALLOWED" };
	const filePath = pathFromWriteInput(toolInput);
	if (!filePath) return { approvalId, approved: false, reason: "NOT_ALLOWED" };
	const d = evaluateWriteApproval(scope, { op, path: filePath, changedBytes: 0, patchLines: 0, filesTouched: 1 });
	return { approvalId, approved: d.allow, reason: d.allow ? undefined : d.reason };
}
