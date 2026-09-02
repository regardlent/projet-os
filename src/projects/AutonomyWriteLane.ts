/**
 * AutonomyWriteLane — builds the correct ClineCore config for a bounded,
 * approval-gated WRITE run (Phase 14).
 *
 * Verified against installed 0.0.81 types:
 *  - `ClineCoreOptions.toolPolicies` (create-time) controls auto-approve.
 *  - `ClineCoreStartConfig` carries systemPrompt/provider/cwd/checkpoint.
 *  - Approval is NOT a start-callback; it flows through the runtime's tool
 *    approval event/API (autoApprove=false). We keep every write gated and
 *    route decisions through {@link evaluateApproval}.
 */
import { buildWriteToolPolicies, evaluateWriteApproval, opFromToolName, pathFromWriteInput } from "./WriteApproval.js";
import { buildWriteScope, type AutonomyWriteScope, type WriteOperation } from "./AutonomyWriteScope.js";
import type { WriteApprovalDecision } from "./WriteApproval.js";

export interface WriteLaneConfigInput {
	workspaceRoot: string;
	modelId: string;
	baseUrl: string;
	runId: string;
	complexity: "small" | "medium" | "large";
}

export interface AutonomyWriteLaneConfig {
	createOptions: Record<string, unknown>;
	startConfig: Record<string, unknown>;
	scope: AutonomyWriteScope;
}

const WRITE_SYSTEM_PROMPT = `You are a Project OS autonomous WRITE agent, strictly bounded to this workspace.
Use only the allowed write tools (editor/apply_patch). Every write requires approval.
Never touch .git, node_modules, dist, build, .project-os, .agents, .env, or any secret/private key.
Never delete or rename. Stay inside the workspace. Report a short summary at the end.`;

export function buildWriteLaneConfig(input: WriteLaneConfigInput): AutonomyWriteLaneConfig {
	const scope = buildWriteScope({ runId: input.runId, workspaceRoot: input.workspaceRoot, complexity: input.complexity });
	return {
		createOptions: {
			clientName: "cline-os-autonomy-write",
			backendMode: "local",
			toolPolicies: buildWriteToolPolicies(),
		},
		startConfig: {
			systemPrompt: WRITE_SYSTEM_PROMPT,
			providerId: "openai-compatible",
			modelId: input.modelId,
			apiKey: "localai",
			baseUrl: input.baseUrl,
			enableTools: true,
			enableSpawnAgent: false,
			enableAgentTeams: false,
			cwd: input.workspaceRoot,
			workspaceRoot: input.workspaceRoot,
			checkpoint: { enabled: true },
		},
		scope,
	};
}

/**
 * Evaluate a write tool call against the lane scope + guard.
 * Returns the decision; expect `allow=false` for anything out of scope.
 */
export function evaluateApproval(scope: AutonomyWriteScope, toolName: string, input: unknown): WriteApprovalDecision {
	const op: WriteOperation | null = opFromToolName(toolName);
	if (!op) return { allow: false, reason: "NOT_ALLOWED" };
	const filePath = pathFromWriteInput(input);
	if (!filePath) return { allow: false, reason: "NOT_ALLOWED" };
	// Conservatively count filesTouched=1 per call; the scope budget is enforced cumulatively by the lane.
	return evaluateWriteApproval(scope, { op, path: filePath, changedBytes: 0, patchLines: 0, filesTouched: 1 });
}
