/**
 * DevelopmentTaskClassifier (W131).
 *
 * Classifies a development task and derives TaskRequirements used by the router
 * for hard capability filtering. Pure module, deterministic.
 */
import type { Capability } from "./ModelCandidate.js";

export type TaskClass =
	| "MICRO_EDIT"
	| "FORMAT"
	| "DOCUMENTATION"
	| "SEARCH"
	| "CODE_EXPLANATION"
	| "UNIT_TEST"
	| "TEST_REPAIR"
	| "SMALL_BUG"
	| "SMALL_FEATURE"
	| "MEDIUM_FEATURE"
	| "MULTI_FILE_CHANGE"
	| "REFACTOR"
	| "DEBUG"
	| "ARCHITECTURE"
	| "COMPLEX_DEBUG"
	| "LARGE_REFACTOR"
	| "SECURITY_REVIEW"
	| "PERFORMANCE_ANALYSIS"
	| "LONG_AGENTIC_TASK"
	| "REPOSITORY_ANALYSIS"
	| "RELEASE_REVIEW"
	| "VISION_UI_DEBUG";

export interface TaskRequirements {
	complexity: 1 | 2 | 3 | 4 | 5;
	requiredContext: number;
	toolsRequired: boolean;
	reasoningRequired: boolean;
	visionRequired: boolean;
	longHorizon: boolean;
	qualityPriority: boolean;
}

export interface ClassifiedTask {
	class: TaskClass;
	requirements: TaskRequirements;
}

const CLASS_TO_REQ: Record<TaskClass, TaskRequirements> = {
	MICRO_EDIT: { complexity: 1, requiredContext: 4000, toolsRequired: true, reasoningRequired: false, visionRequired: false, longHorizon: false, qualityPriority: false },
	FORMAT: { complexity: 1, requiredContext: 2000, toolsRequired: true, reasoningRequired: false, visionRequired: false, longHorizon: false, qualityPriority: false },
	DOCUMENTATION: { complexity: 1, requiredContext: 4000, toolsRequired: false, reasoningRequired: false, visionRequired: false, longHorizon: false, qualityPriority: false },
	SEARCH: { complexity: 1, requiredContext: 2000, toolsRequired: true, reasoningRequired: false, visionRequired: false, longHorizon: false, qualityPriority: false },
	CODE_EXPLANATION: { complexity: 1, requiredContext: 4000, toolsRequired: false, reasoningRequired: true, visionRequired: false, longHorizon: false, qualityPriority: false },
	UNIT_TEST: { complexity: 2, requiredContext: 8000, toolsRequired: true, reasoningRequired: false, visionRequired: false, longHorizon: false, qualityPriority: false },
	TEST_REPAIR: { complexity: 2, requiredContext: 8000, toolsRequired: true, reasoningRequired: true, visionRequired: false, longHorizon: false, qualityPriority: false },
	SMALL_BUG: { complexity: 2, requiredContext: 8000, toolsRequired: true, reasoningRequired: true, visionRequired: false, longHorizon: false, qualityPriority: false },
	SMALL_FEATURE: { complexity: 2, requiredContext: 12000, toolsRequired: true, reasoningRequired: false, visionRequired: false, longHorizon: false, qualityPriority: false },
	MEDIUM_FEATURE: { complexity: 3, requiredContext: 16000, toolsRequired: true, reasoningRequired: true, visionRequired: false, longHorizon: false, qualityPriority: false },
	MULTI_FILE_CHANGE: { complexity: 3, requiredContext: 20000, toolsRequired: true, reasoningRequired: true, visionRequired: false, longHorizon: false, qualityPriority: false },
	REFACTOR: { complexity: 3, requiredContext: 20000, toolsRequired: true, reasoningRequired: true, visionRequired: false, longHorizon: false, qualityPriority: false },
	DEBUG: { complexity: 3, requiredContext: 16000, toolsRequired: true, reasoningRequired: true, visionRequired: false, longHorizon: false, qualityPriority: false },
	ARCHITECTURE: { complexity: 5, requiredContext: 32000, toolsRequired: true, reasoningRequired: true, visionRequired: false, longHorizon: true, qualityPriority: true },
	COMPLEX_DEBUG: { complexity: 5, requiredContext: 32000, toolsRequired: true, reasoningRequired: true, visionRequired: false, longHorizon: true, qualityPriority: true },
	LARGE_REFACTOR: { complexity: 5, requiredContext: 32000, toolsRequired: true, reasoningRequired: true, visionRequired: false, longHorizon: true, qualityPriority: true },
	SECURITY_REVIEW: { complexity: 5, requiredContext: 32000, toolsRequired: true, reasoningRequired: true, visionRequired: false, longHorizon: true, qualityPriority: true },
	PERFORMANCE_ANALYSIS: { complexity: 4, requiredContext: 32000, toolsRequired: true, reasoningRequired: true, visionRequired: false, longHorizon: true, qualityPriority: true },
	LONG_AGENTIC_TASK: { complexity: 5, requiredContext: 40000, toolsRequired: true, reasoningRequired: true, visionRequired: false, longHorizon: true, qualityPriority: true },
	REPOSITORY_ANALYSIS: { complexity: 3, requiredContext: 32000, toolsRequired: true, reasoningRequired: true, visionRequired: false, longHorizon: true, qualityPriority: false },
	RELEASE_REVIEW: { complexity: 4, requiredContext: 32000, toolsRequired: true, reasoningRequired: true, visionRequired: false, longHorizon: false, qualityPriority: true },
	VISION_UI_DEBUG: { complexity: 3, requiredContext: 16000, toolsRequired: true, reasoningRequired: false, visionRequired: true, longHorizon: false, qualityPriority: false },
};

export function classifyTask(taskClass: TaskClass): ClassifiedTask {
	return { class: taskClass, requirements: CLASS_TO_REQ[taskClass] };
}

/** Derived capability requirements. */
export function requirementsToCapabilities(req: TaskRequirements): Capability[] {
	const caps: Capability[] = ["streaming"];
	if (req.toolsRequired) caps.push("tools");
	if (req.reasoningRequired) caps.push("reasoning");
	if (req.visionRequired) caps.push("vision");
	return caps;
}
