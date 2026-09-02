/**
 * ApprovalService — FAIL-CLOSED permission matrix for MCP bridge tools.
 * Auto-approve only safe READs inside an approved workspace. Everything else
 * requires approval or is disabled by default.
 */
export type ApprovalNeeded =
	| { decision: "approve"; reason: string }
	| { decision: "needs-approval"; reason: string }
	| { decision: "denied"; reason: string };

export type BridgeToolClass =
	| "health"
	| "read"
	| "write"
	| "test-run"
	| "build-run"
	| "antigravity-run"
	| "antigravity-write"
	| "network"
	| "dangerous";

const DISABLED_CLASSES = new Set<BridgeToolClass>(["dangerous", "network"]);

export interface ApprovalContext {
	writeEnabled: boolean;
	approvalMode: "auto-approve-read" | "approval-required";
	workspaceApproved: boolean;
	approved?: boolean;
}

export function evaluateApproval(toolClass: BridgeToolClass, ctx: ApprovalContext): ApprovalNeeded {
	if (!ctx.workspaceApproved) return { decision: "denied", reason: "workspace not approved" };
	if (DISABLED_CLASSES.has(toolClass)) return { decision: "denied", reason: "disabled by default" };
	if (ctx.approved) {
		if ((toolClass === "antigravity-write" || toolClass === "write" || toolClass === "test-run" || toolClass === "build-run") && !ctx.writeEnabled) {
			return { decision: "denied", reason: "writes disabled" };
		}
		return { decision: "approve", reason: "explicitly approved" };
	}
	switch (toolClass) {
		case "health":
			return { decision: "approve", reason: "read-only health" };
		case "read":
			// Reads inside an approved workspace are always auto-allowed (auto-allow read).
			return { decision: "approve", reason: "read-only inside approved workspace" };
		case "test-run":
		case "build-run":
			if (!ctx.writeEnabled) return { decision: "denied", reason: "writes disabled" };
			return { decision: "needs-approval", reason: "execution requires approval" };
		case "antigravity-run":
			return { decision: "needs-approval", reason: "agent run requires approval" };
		case "antigravity-write":
			if (!ctx.writeEnabled) return { decision: "denied", reason: "writes disabled" };
			return { decision: "needs-approval", reason: "agent write requires approval" };
		default:
			return { decision: "denied", reason: "unknown class" };
	}
}

/** Derive tool class from a tool name — unknown tool => denied (fail-closed). */
export function toolClassOf(name: string): BridgeToolClass {
	if (name === "bridge_health") return "health";
	if (["project_status", "project_tree", "file_read", "code_search", "git_status", "git_diff"].includes(name)) return "read";
	if (["tests_run", "build_run"].includes(name)) return name === "tests_run" ? "test-run" : "build-run";
	if (name === "antigravity_run") return "antigravity-run";
	if (name.startsWith("file_write") || name.startsWith("patch")) return "write";
	return "dangerous";
}