/**
 * GpuQualificationQueue + eligibility (Phase 19, W875-877).
 * VRAM-block-tolerant: computes eligibility from observed free VRAM + per-model
 * requirement + headroom. Never loads when not eligible. Pure, testable.
 */
export interface GpuBlockState {
	observedAt: number;
	totalMiB: number;
	usedMiB: number;
	freeMiB: number;
	localAiResidentBackends: number;
	externalPressure: boolean;
	status: "OK" | "EXTERNAL_VRAM_PRESSURE";
}

export type QueueStatus = "WAITING_PREPARATION" | "PREPARED_VERIFIED" | "WAITING_GPU" | "QUALIFYING" | "READY" | "FAILED" | "REPLACED";

export interface ModelQueueEntry {
	modelId: string;
	alias: string;
	variant: string;
	requiredContext: number;
	estimatedVRAMMiB: number;
	requiredHeadroomMiB: number;
	priority: number;
	status: QueueStatus;
	securityStatus: "PASS" | "UNVERIFIED" | "BLOCK";
	parameterStatus: "PASS" | "BLOCK" | "UNKNOWN";
	reason?: string;
}

export type Eligibility = "ELIGIBLE" | "GPU_PRESSURE_BLOCK";

export function requiredFreeVRAM(entry: ModelQueueEntry): number {
	return entry.estimatedVRAMMiB + entry.requiredHeadroomMiB;
}

export function classifyEligibility(entry: ModelQueueEntry, freeMiB: number): Eligibility {
	return freeMiB >= requiredFreeVRAM(entry) ? "ELIGIBLE" : "GPU_PRESSURE_BLOCK";
}

export class GpuQualificationQueue {
	private entries: ModelQueueEntry[] = [];

	add(entry: ModelQueueEntry): void {
		this.entries = this.entries.filter((e) => e.modelId !== entry.modelId);
		this.entries.push(entry);
	}

	list(): ModelQueueEntry[] {
		return this.entries.slice();
	}

	recalcEligibility(freeMiB: number): Map<string, Eligibility> {
		const m = new Map<string, Eligibility>();
		for (const e of this.entries) m.set(e.modelId, classifyEligibility(e, freeMiB));
		return m;
	}

	nextEligible(freeMiB: number): ModelQueueEntry | null {
		const elig = this.entries
			.filter((e) => e.status === "WAITING_GPU" && classifyEligibility(e, freeMiB) === "ELIGIBLE")
			.sort((a, b) => a.priority - b.priority);
		return elig[0] ?? null;
	}

	blockedCount(freeMiB: number): number {
		return this.entries.filter((e) => e.status === "WAITING_GPU" && classifyEligibility(e, freeMiB) === "GPU_PRESSURE_BLOCK").length;
	}
}

export function makeGpuBlockState(observed: { totalMiB: number; usedMiB: number; freeMiB: number; localAiResidentBackends: number }): GpuBlockState {
	return {
		observedAt: Date.now(),
		totalMiB: observed.totalMiB,
		usedMiB: observed.usedMiB,
		freeMiB: observed.freeMiB,
		localAiResidentBackends: observed.localAiResidentBackends,
		externalPressure: observed.freeMiB < 512,
		status: observed.freeMiB < 512 ? "EXTERNAL_VRAM_PRESSURE" : "OK",
	};
}
