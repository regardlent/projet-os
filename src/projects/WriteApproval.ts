/**
 * WriteApproval — the fail-closed gate the autonomy write lane uses for every
 * tool mutation. Pure + testable. Combines the workspace/path guard, allowed
 * operations, secret/protected policy and the run's write budget.
 */
import type { ToolPolicy } from "@cline/sdk";
import type { AutonomyWriteScope, WriteOperation } from "./AutonomyWriteScope.js";
import { guardWritePath } from "./AutonomyWriteScope.js";
import { buildToolPolicies, type PermissionsConfig } from "../cline/PermissionsAdapter.js";

export interface WriteApprovalInput {
	op: WriteOperation;
	path: string;
	changedBytes: number;
	patchLines: number;
	filesTouched: number;
}

export type WriteApprovalDecision = { allow: true } | { allow: false; reason: string };

export function evaluateWriteApproval(scope: AutonomyWriteScope, input: WriteApprovalInput): WriteApprovalDecision {
	if (input.op === "delete" || input.op === "rename") return { allow: false, reason: "NOT_ALLOWED" };
	if (input.op === "create" && !scope.allowCreate) return { allow: false, reason: "NOT_ALLOWED" };
	const g = guardWritePath(scope.workspaceRoot, input.path, scope.allowedOperations, input.op);
	if (!g.ok) return { allow: false, reason: g.reason };
	if (input.filesTouched > scope.maxFiles) return { allow: false, reason: "BUDGET_EXCEEDED" };
	if (input.changedBytes > scope.maxBytesChanged) return { allow: false, reason: "BUDGET_EXCEEDED" };
	if (input.patchLines > scope.maxPatchLines) return { allow: false, reason: "BUDGET_EXCEEDED" };
	return { allow: true };
}

/**
 * toolPolicies for the WRITE autonomy lane (ClineCore).
 * Read-only auto-approved; write/shell/network require approval; dangerous
 * tools disabled. Unknown tools are surfaced (never silently enabled).
 */
export function buildWriteToolPolicies(): Record<string, ToolPolicy> {
	const cfg: PermissionsConfig = {
		readOnlyAutoApprove: ["read_files", "read_file", "search_codebase", "search", "list_files", "git_status", "git_diff"],
		requiresApproval: ["editor", "edit_file", "apply_patch", "write", "write_file", "run_commands", "bash", "web_fetch"],
		disabled: ["deploy", "publish", "publish_extension", "git_push", "force_push", "git_reset_hard", "git_branch_delete", "git_history_rewrite", "external_message", "credential_export", "db_reset", "db_drop"],
	};
	return buildToolPolicies(cfg);
}

/** Derive the write operation from a Cline tool name (fail-closed on unknown). */
export function opFromToolName(toolName: string): WriteOperation | null {
	switch (toolName) {
		case "editor":
		case "edit_file":
			return "modify";
		case "apply_patch":
			return "patch";
		case "write":
		case "write_file":
			return "create";
		default:
			return null;
	}
}

/** Resolve the target path from a Cline write tool input (best-effort, fail-closed). */
export function pathFromWriteInput(input: unknown): string {
	if (input && typeof input === "object") {
		const o = input as Record<string, unknown>;
		for (const key of ["path", "file_path", "filePath", "filename"]) {
			const v = o[key];
			if (typeof v === "string") return v;
		}
	}
	return "";
}
