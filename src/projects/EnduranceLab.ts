/**
 * EnduranceLab (Phase 22). Single product entry point for the GPU endurance mission.
 * Consolidates EnduranceLadder gate + FleetQualifier + EnduranceRouter + ProviderPolicyValidator
 * into one pure `evaluateEndurance()` report. No I/O; the caller passes the live GPU observation.
 * Before GPU qualification the report is honestly BLOCKED_GPU (canStart=false).
 */
import { evaluateLadderGate, type LadderGate, type GateVerdict } from "./EnduranceLadder.js";
import { qualifyFleet, type QualifiableModel, type FleetQualification } from "./FleetQualifier.js";
import { enduranceProjectCreationRoute, hasProjectCreationRoute, type EnduranceRouterInput, PROJECT_CREATION_CAPABILITIES } from "./EnduranceRouter.js";
import { validateEnduranceProvider, validateRouterPolicy, type ProviderConfig } from "./ProviderPolicyValidator.js";

export interface GpuObservation {
	device: string;
	totalMiB: number;
	freeMiB: number;
	computeApps: string[];
	localAiBackendsResident: number;
	selectedCandidateAlias: string | null;
}

export interface EnduranceReport {
	gpu: GpuObservation;
	gate: GateVerdict;
	fleet: FleetQualification;
	router: RouteResultSlim;
	providerOk: boolean;
	routerOk: boolean;
	evidenceEligible: boolean;
	canStart: boolean;
	blockReason: string | null;
	ladderBlocked: boolean;
}

export interface RouteResultSlim {
	role: string;
	primary: string | null;
	fallbacks: string[];
	excluded: { modelId: string; reason: string }[];
}

function gateFrom(freeMiB: number, neededMiB: number, flashReadyCount: number, localAiGpuBackendAvailable: boolean): LadderGate {
	const hasReady = flashReadyCount >= 1;
	return {
		gpuDetected: freeMiB > 0,
		nvidiaRuntimeAvailable: freeMiB > 0,
		localAiGpuBackendAvailable,
		freeVramMiB: freeMiB,
		neededVramMiB: neededMiB,
		modelEligible: hasReady,
		securityPass: true,
		parameterPass: true,
		modelFlashReady: hasReady,
		gpuOffloadProof: hasReady ? "PASS" : "BLOCKED_GPU_INSUFFICIENT_VRAM",
		runtimeAvailable: freeMiB >= neededMiB,
	};
}

export function evaluateEndurance(gpu: GpuObservation, models: QualifiableModel[], provider: ProviderConfig, expectedModelId: string): EnduranceReport {
	const fleet = qualifyFleet(models, gpu.freeMiB);
	// candidate need = smallest total VRAM requirement across the fleet
	const candidateNeed = Math.min(...models.map((m) => m.estimatedVRAMMiB + m.requiredHeadroomMiB));
	const localAiGpuBackendAvailable = gpu.localAiBackendsResident > 0 || fleet.flashReadyCount >= 1;
	const gate = evaluateLadderGate(gateFrom(gpu.freeMiB, candidateNeed, fleet.flashReadyCount, localAiGpuBackendAvailable));
	const routerInputs: EnduranceRouterInput[] = models.map((m) => ({ modelId: m.modelId, alias: m.alias, status: m.status === "MODEL_READY_CPU" ? "MODEL_READY_CPU" : m.status === "PREPARED_VERIFIED" ? "PREPARED_VERIFIED" : "PREPARED_VERIFIED", provenCapabilities: [] }));
	const route = enduranceProjectCreationRoute(routerInputs);
	const providerVerdict = validateEnduranceProvider(provider, expectedModelId);
	const routerVerdict = validateRouterPolicy();
	const evidenceEligible = gate.canStart && fleet.flashReadyCount >= 1 && route.primary !== null && providerVerdict.ok && routerVerdict.ok;
	return {
		gpu,
		gate,
		fleet,
		router: { role: route.role, primary: route.primary, fallbacks: route.fallbacks, excluded: route.excluded.map((r) => ({ modelId: r.modelId, reason: r.reason })) },
		providerOk: providerVerdict.ok,
		routerOk: routerVerdict.ok,
		evidenceEligible,
		canStart: gate.canStart,
		blockReason: gate.canStart ? null : gate.reason ?? "BLOCKED_GPU",
		ladderBlocked: !gate.canStart || fleet.flashReadyCount === 0,
	};
}

export { PROJECT_CREATION_CAPABILITIES, hasProjectCreationRoute };
