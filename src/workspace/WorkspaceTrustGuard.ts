/**
 * WorkspaceTrustGuard (W22)
 *
 * Trusted workspaces allow the full operation set; untrusted workspaces allow
 * only read/analysis operations. Writes, shell, service starts, and agent write
 * tools are blocked until the user trusts the workspace. Never forces trust.
 *
 * Pure module: no `vscode` import.
 */

export type TrustedOp =
	| "analysis"
	| "write"
	| "shell"
	| "serviceStart"
	| "serviceStop"
	| "agentWriteTools"
	| "gitMutate"
	| "mcpSideEffect";

const UNTRUSTED_ALLOWED: readonly TrustedOp[] = ["analysis"];

/** Whether `op` is permitted given the workspace trust state. */
export function isOperationAllowed(trusted: boolean, op: TrustedOp): boolean {
	if (trusted) return true;
	return UNTRUSTED_ALLOWED.includes(op);
}

/** Map an operation to a human readable reason for the denial. */
export function trustDenialReason(op: TrustedOp): string {
	switch (op) {
		case "write":
			return "Write blocked: workspace is untrusted.";
		case "shell":
			return "Shell blocked: workspace is untrusted.";
		case "serviceStart":
		case "serviceStop":
			return "Service action blocked: workspace is untrusted.";
		case "agentWriteTools":
			return "Agent write tools blocked: workspace is untrusted.";
		case "gitMutate":
			return "Git mutation blocked: workspace is untrusted.";
		case "mcpSideEffect":
			return "MCP side effect blocked: workspace is untrusted.";
		default:
			return "Operation blocked: workspace is untrusted.";
	}
}
