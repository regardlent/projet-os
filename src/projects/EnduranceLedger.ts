/**
 * EnduranceLedger (Phase 22, W1312). Typed records for the endurance bug ledger
 * (artifacts/endurance/BUG_LEDGER.json) and GPU ledger (artifacts/endurance/GPU_LEDGER.json).
 * Pure + testable factories; no I/O.
 */
import type { RungMinutes, OffloadProof } from "./EnduranceLadder.js";

export type BugBoundary =
	| "PROJECT_FACTORY"
	| "ROUTER"
	| "MODEL"
	| "GPU_RUNTIME"
	| "LOCALAI"
	| "CLINE"
	| "FILESYSTEM"
	| "UI"
	| "BUILD"
	| "TEST"
	| "PERSISTENCE"
	| "OTHER";

export type BugSeverity = "critical" | "high" | "medium" | "low";

export interface BugEntry {
	bugId: string;
	rung: RungMinutes | null;
	attempt: number;
	elapsedMs: number;
	severity: BugSeverity;
	boundary: BugBoundary;
	symptom: string;
	rootCause: string;
	filesChanged: string[];
	fix: string;
	tests: string[];
	regression: number;
	checkpoint: boolean;
	retestedFromZero: boolean;
	finalStatus: "OPEN" | "FIXED" | "PENDING";
}

export function createBugEntry(input: {
	bugId: string;
	rung: RungMinutes | null;
	attempt: number;
	elapsedMs: number;
	severity: BugSeverity;
	boundary: BugBoundary;
	symptom: string;
	rootCause: string;
	filesChanged?: string[];
	fix?: string;
	tests?: string[];
	regression?: number;
	checkpoint?: boolean;
	retestedFromZero?: boolean;
	finalStatus?: "OPEN" | "FIXED" | "PENDING";
}): BugEntry {
	return {
		bugId: input.bugId,
		rung: input.rung,
		attempt: input.attempt,
		elapsedMs: input.elapsedMs,
		severity: input.severity,
		boundary: input.boundary,
		symptom: input.symptom,
		rootCause: input.rootCause,
		filesChanged: input.filesChanged ?? [],
		fix: input.fix ?? "",
		tests: input.tests ?? [],
		regression: input.regression ?? 0,
		checkpoint: input.checkpoint ?? false,
		retestedFromZero: input.retestedFromZero ?? false,
		finalStatus: input.finalStatus ?? "OPEN",
	};
}

export interface GpuEntry {
	runId: string;
	model: string | null;
	runtime: string;
	gpu: string;
	vramTotal: number;
	vramBefore: number | null;
	vramAfterLoad: number | null;
	vramPeak: number | null;
	offloadProof: OffloadProof;
	backendState: string;
	context: number | null;
	failure: string | null;
}

export function createGpuEntry(input: {
	runId: string;
	model: string | null;
	runtime: string;
	gpu: string;
	vramTotal: number;
	vramBefore: number | null;
	vramAfterLoad?: number | null;
	vramPeak?: number | null;
	offloadProof: OffloadProof;
	backendState: string;
	context?: number | null;
	failure?: string | null;
}): GpuEntry {
	return {
		runId: input.runId,
		model: input.model,
		runtime: input.runtime,
		gpu: input.gpu,
		vramTotal: input.vramTotal,
		vramBefore: input.vramBefore,
		vramAfterLoad: input.vramAfterLoad ?? null,
		vramPeak: input.vramPeak ?? null,
		offloadProof: input.offloadProof,
		backendState: input.backendState,
		context: input.context ?? null,
		failure: input.failure ?? null,
	};
}
