/**
 * GpuEvidence (Phase 24, W04). Canonical object that centralizes every GPU proof point.
 * A boolean offloadProof is NEVER PASS without linked evidence (delta VRAM + backend
 * observed + smoke inference). `collectGpuEvidence` consumes injected sensors so it is
 * testable, but qualification never fabricates a reading — sensors report real state.
 */
export interface GpuSensorReading {
	totalMiB: number;
	freeMiB: number;
	usedMiB: number;
	/** Detected by nvidia-smi (name/driver) or null if absent. */
	gpuName: string | null;
	driver: string | null;
}

export interface BackendEvidence {
	backend: string | null;
	loaded: boolean;
	model: string | null;
}

export type EvidenceQuality = "MEASURED" | "UNVERIFIED" | "BLOCKED";

export interface GpuEvidence {
	timestamp: number;
	gpuName: string | null;
	driver: string | null;
	totalVramMiB: number;
	freeVramBeforeMiB: number;
	freeVramAfterMiB: number;
	deltaVramMiB: number;
	model: string | null;
	backend: string | null;
	smokeInference: boolean;
	offloadProof: boolean;
	evidenceQuality: EvidenceQuality;
	reasons: string[];
}

export const GPU_MIN_FREE_MIB = 512;

/** Build the canonical evidence object from real sensor + backend + smoke data. */
export function buildGpuEvidence(input: {
	gpu: GpuSensorReading;
	backend: BackendEvidence;
	model: string | null;
	smokeInferenceOk: boolean;
	freeVramAfterMiB?: number;
}): GpuEvidence {
	const reasons: string[] = [];
	const hasGpu = Boolean(input.gpu.gpuName && input.gpu.driver);
	const backendLoaded = input.backend.loaded && Boolean(input.backend.backend);
	const after = input.freeVramAfterMiB ?? input.gpu.freeMiB;
	const delta = after - input.gpu.freeMiB;

	if (!hasGpu) reasons.push("NO_GPU_DETECTED");
	if (!backendLoaded) reasons.push("BACKEND_NOT_LOADED");
	if (!input.smokeInferenceOk) reasons.push("SMOKE_INFERENCE_FAILED");
	// A real offload grows VRAM usage (free decreases after load => delta < 0).
	if (!(delta < -32)) reasons.push("NO_DELTA_VRAM");

	let quality: EvidenceQuality = "MEASURED";
	if (after < GPU_MIN_FREE_MIB) {
		quality = "BLOCKED";
		reasons.push("INSUFFICIENT_FREE_VRAM");
	} else if (!hasGpu || !backendLoaded || !input.smokeInferenceOk) {
		quality = "UNVERIFIED";
	}

	const offloadProof = reasons.length === 0;

	return {
		timestamp: Date.now(),
		gpuName: input.gpu.gpuName,
		driver: input.gpu.driver,
		totalVramMiB: input.gpu.totalMiB,
		freeVramBeforeMiB: input.gpu.freeMiB,
		freeVramAfterMiB: after,
		deltaVramMiB: delta,
		model: input.model,
		backend: input.backend.backend,
		smokeInference: input.smokeInferenceOk,
		offloadProof,
		evidenceQuality: quality,
		reasons,
	};
}
