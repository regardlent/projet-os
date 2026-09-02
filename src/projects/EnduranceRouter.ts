/**
 * EnduranceRouter (Phase 22, W1307). Wires the qualified fleet into the existing
 * DeterministicRouter for the Project-Creation role. Only a model that is FLASH_READY and
 * has the required capabilities PROVEN can be selected. Before GPU qualification this
 * yields an EMPTY primary with explicit exclusions - proving the router has no CPU escape
 * and refuses unproven models. Pure + testable.
 */
import { selectRoute, type RouterModel, type RouterModelStatus, type RouteResult } from "./DeterministicRouter.js";

export const PROJECT_CREATION_ROLE = "project-creation";
export const PROJECT_CREATION_CAPABILITIES = ["CODING", "TOOLS", "GENERAL", "JSON"];

export interface EnduranceRouterInput {
	modelId: string;
	alias: string;
	status: RouterModelStatus;
	provenCapabilities: string[];
	capabilityDetail?: Record<string, "PROVEN" | "FAILED" | "UNTESTED" | "BLOCKED_DEPENDENCY">;
}

export function toRouterModel(input: EnduranceRouterInput): RouterModel {
	const capability: Record<string, "PROVEN" | "FAILED" | "UNTESTED" | "BLOCKED_DEPENDENCY"> = {};
	for (const cap of PROJECT_CREATION_CAPABILITIES) {
		capability[cap] = input.capabilityDetail?.[cap] ?? (input.provenCapabilities.includes(cap) ? "PROVEN" : "UNTESTED");
	}
	return { modelId: input.modelId, alias: input.alias, status: input.status, capability };
}

/** Select a route for the Project-Creation role over the given fleet. */
export function enduranceProjectCreationRoute(inputs: EnduranceRouterInput[]): RouteResult {
	return selectRoute(inputs.map(toRouterModel), PROJECT_CREATION_ROLE, PROJECT_CREATION_CAPABILITIES);
}

/** Convenience: is any model selectable (FLASH_READY + all required caps PROVEN)? */
export function hasProjectCreationRoute(inputs: EnduranceRouterInput[]): boolean {
	return enduranceProjectCreationRoute(inputs).primary !== null;
}
