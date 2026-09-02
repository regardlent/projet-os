/**
 * ModelCapabilityBenchmark (W160/W54/W55).
 *
 * Merges catalog-declared capabilities with empirically observed ones. When the
 * catalog says tools=YES but the benchmark repeatedly fails, we keep BOTH facts
 * (catalogTools=true, observedTools=false) and surface the conflict instead of
 * hiding it. Pure module.
 */
import type { Capability } from "./ModelCandidate.js";

export type CapabilitySource = "CATALOG" | "EMPIRICAL" | "BOTH";

export interface ModelBenchmarkResult {
	providerId: string;
	modelId: string;
	completion: boolean;
	tools: boolean;
	json: boolean;
	reasoning: boolean;
	vision: boolean;
	latencyMs?: number;
	ttftMs?: number;
	tokens?: number;
	success: boolean;
	errors: string[];
}

export interface ModelFitnessCapabilities {
	tools: boolean;
	reasoning: boolean;
	json: boolean;
	vision: boolean;
	/** Where each bool came from; if catalog and observed disagree, conflict= true. */
	source: CapabilitySource;
	conflict: boolean;
}

export function mergeCapabilities(
	catalog: readonly Capability[],
	observed: ModelBenchmarkResult,
): ModelFitnessCapabilities {
	const catTools = catalog.includes("tools");
	const capTools = observed.tools;
	const conflict = catTools !== capTools;
	return {
		tools: capTools,
		reasoning: observed.reasoning,
		json: observed.json,
		vision: observed.vision,
		source: conflict ? "BOTH" : catTools ? "CATALOG" : "EMPIRICAL",
		conflict,
	};
}

/** Effective capability set used for routing (empirical wins on conflict). */
export function effectiveCapabilities(fit: ModelFitnessCapabilities, base: readonly Capability[]): Capability[] {
	const caps = new Set<Capability>(base as Capability[]);
	if (!fit.tools) caps.delete("tools");
	else caps.add("tools");
	if (!fit.reasoning) caps.delete("reasoning");
	else caps.add("reasoning");
	if (!fit.json) caps.delete("json");
	else caps.add("json");
	if (!fit.vision) caps.delete("vision");
	else caps.add("vision");
	return [...caps];
}
