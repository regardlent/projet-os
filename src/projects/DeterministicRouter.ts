/**
 * DeterministicRouter (Phase 19, W903-906).
 * Proven-only eligibility: a model may be selected for a role only when it is
 * FLASH_READY and every required capability is empirically PROVEN. Prepared /
 * CPU-only / empty-output models are excluded with an explicit reason.
 * Pure + testable (extends the existing IntelligentModelRouter contract).
 */
export type CapabilityState = "PROVEN" | "FAILED" | "UNTESTED" | "BLOCKED_DEPENDENCY";

export type RouterModelStatus = "FLASH_READY" | "MODEL_READY_CPU" | "PREPARED_VERIFIED" | "INSTALLED_ONLY" | "BLOCKED" | "QUARANTINED";

export interface RouterModel {
	modelId: string;
	alias: string;
	status: RouterModelStatus;
	capability: Record<string, CapabilityState>;
}

export type ExclusionReason =
	| "NOT_FLASH_READY"
	| "MODEL_EMPTY_OUTPUT"
	| "TOOL_UNRELIABLE"
	| "GPU_BLOCKED"
	| "PARAMETER_BLOCK"
	| "LICENSE_BLOCK"
	| "SECURITY_BLOCK"
	| "CAPABILITY_UNPROVEN";

export interface RouteResult {
	role: string;
	primary: string | null;
	fallbacks: string[];
	excluded: { modelId: string; reason: ExclusionReason }[];
}

export function isModelEligible(model: RouterModel, requiredCaps: string[]): boolean {
	if (model.status !== "FLASH_READY") return false;
	for (const cap of requiredCaps) if (model.capability[cap] !== "PROVEN") return false;
	return true;
}

export function exclusionReason(model: RouterModel, requiredCaps: string[]): ExclusionReason {
	if (model.status !== "FLASH_READY") {
		if (model.status === "MODEL_READY_CPU" || model.status === "PREPARED_VERIFIED" || model.status === "INSTALLED_ONLY") return "GPU_BLOCKED";
		return "NOT_FLASH_READY";
	}
	for (const cap of requiredCaps) {
		if (model.capability[cap] !== "PROVEN") return model.capability[cap] === "BLOCKED_DEPENDENCY" ? "GPU_BLOCKED" : "CAPABILITY_UNPROVEN";
	}
	return "CAPABILITY_UNPROVEN";
}

export function selectRoute(models: RouterModel[], role: string, requiredCaps: string[]): RouteResult {
	const eligible = models.filter((m) => isModelEligible(m, requiredCaps));
	const excluded = models.filter((m) => !isModelEligible(m, requiredCaps)).map((m) => ({ modelId: m.modelId, reason: exclusionReason(m, requiredCaps) }));
	return { role, primary: eligible[0]?.modelId ?? null, fallbacks: eligible.slice(1, 3).map((m) => m.modelId), excluded };
}

export interface RouteExplanation {
	role: string;
	requiredCapabilities: string[];
	candidates: string[];
	excluded: { modelId: string; reason: ExclusionReason }[];
	selected: string | null;
	fallbacks: string[];
	reason: string;
}

export function explainRoute(models: RouterModel[], role: string, requiredCaps: string[]): RouteExplanation {
	const r = selectRoute(models, role, requiredCaps);
	return {
		role,
		requiredCapabilities: requiredCaps,
		candidates: models.filter((m) => isModelEligible(m, requiredCaps)).map((m) => m.modelId),
		excluded: r.excluded,
		selected: r.primary,
		fallbacks: r.fallbacks,
		reason: r.primary ? `${r.primary} is FLASH_READY with proven ${requiredCaps.join(", ")}` : "No proven model for this role",
	};
}
