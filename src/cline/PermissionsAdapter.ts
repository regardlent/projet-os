/**
 * PermissionsAdapter
 *
 * Builds the Cline `toolPolicies` map (`Record<string, ToolPolicy>`) for
 * `ClineCore.create` / session start. This is the safety-critical layer:
 * by default the SDK treats a missing policy as auto-approve, so every
 * non-read-only tool MUST carry an explicit policy.
 *
 * Only read-only tools are auto-approved. Writes, shell, network, and
 * destructive git / deploy / externals are disabled by default or require
 * approval.
 *
 * Pure module: no `vscode` import.
 */
import type { ToolPolicy } from "@cline/sdk";

/** Read-only operations that are safe to auto-approve. */
const READ_ONLY_AUTO_APPROVE: readonly string[] = [
	"read_files",
	"read_file",
	"read_files_bulk",
	"search_codebase",
	"search",
	"list_files",
	"list_files_bulk",
	"diagnostics",
	"git_status",
	"git_diff",
	"glance",
	"grep",
];

/** Mutating operations that must never run without explicit approval. */
const REQUIRES_APPROVAL: readonly string[] = [
	"editor",
	"edit_file",
	"apply_patch",
	"write",
	"write_file",
	"run_commands",
	"bash",
	"execute_command",
	"web_fetch",
	"fetch_web",
	"browser_action",
	"browser_use",
	"task",
	"ask_user",
	"skill",
	"mcp_server",
	"mcp_tool",
];

/** Explicitly disabled until a bounded, reviewable workflow exists. */
const DISABLED_BY_DEFAULT: readonly string[] = [
	"deploy",
	"publish",
	"publish_extension",
	"git_push",
	"force_push",
	"git_reset_hard",
	"git_branch_delete",
	"git_history_rewrite",
	"external_message",
	"credential_export",
	"db_reset",
	"db_drop",
];

export interface PermissionsConfig {
	/** Read-only tools that get auto-approve true. */
	readOnlyAutoApprove?: readonly string[];
	/** Mutating tools that get auto-approve false. */
	requiresApproval?: readonly string[];
	/** Tools that get enabled false. */
	disabled?: readonly string[];
	/** Optional: allow a host to force-enable an otherwise disabled tool (with approval). */
	allowOverrideDisabled?: readonly string[];
}

/**
 * Produce the full `toolPolicies` map for Cline.
 *
 * Rule: every known tool is either auto-approved (read-only), requires
 * approval (mutating), or disabled (dangerous). Tools we don't know about are
 * left to the SDK default — but we surface an explicit `unclassified` set via
 * {@link PermissionsAdapter.unclassifiedTools} so callers can inspect it and
 * never silently widen permissions.
 */
export function buildToolPolicies(config?: PermissionsConfig): Record<string, ToolPolicy> {
	const readOnly = config?.readOnlyAutoApprove ?? READ_ONLY_AUTO_APPROVE;
	const mutating = config?.requiresApproval ?? REQUIRES_APPROVAL;
	const disabled = [...(config?.disabled ?? DISABLED_BY_DEFAULT)];
	const overrideDisabled = new Set(config?.allowOverrideDisabled ?? []);
	const policies: Record<string, ToolPolicy> = {};

	for (const tool of readOnly) {
		policies[tool] = { enabled: true, autoApprove: true };
	}
	for (const tool of mutating) {
		policies[tool] = { enabled: true, autoApprove: false };
	}
	// Disabled wins over any conflicting classification.
	for (const tool of disabled) {
		if (overrideDisabled.has(tool)) {
			policies[tool] = { enabled: true, autoApprove: false, ...(policies[tool] ?? {}) };
		} else {
			policies[tool] = { enabled: false, autoApprove: false };
		}
	}
	return policies;
}

/** Return the exact set of tool names for which no explicit policy was derived. */
export function unclassifiedTools(
	policies: Record<string, ToolPolicy>,
	known: readonly string[],
): string[] {
	const covered = new Set(Object.keys(policies));
	return known.filter((t) => !covered.has(t));
}

/**
 * Human-readable classification used by the approval / tool-activity UI.
 */
export function classifyTool(
	tool: string,
	config?: PermissionsConfig,
): "read" | "write" | "disabled" | "unknown" {
	const readOnly = new Set(config?.readOnlyAutoApprove ?? READ_ONLY_AUTO_APPROVE);
	const mutating = new Set(config?.requiresApproval ?? REQUIRES_APPROVAL);
	const disabled = new Set([...(config?.disabled ?? DISABLED_BY_DEFAULT)]);
	if (disabled.has(tool)) return "disabled";
	if (readOnly.has(tool)) return "read";
	if (mutating.has(tool)) return "write";
	return "unknown";
}
