/**
 * ProjectCreationEvidence (Phase 22, W1307/W1311/W1313). Typed record capturing every
 * fact a GPU endurance PASS must prove: timer/duration, fresh isolated project, GPU offload,
 * exact model, LocalAI-only provider, Cline openai-compatible provider, build/test/runtime.
 * Pure + testable. Enforces the no-cloud / no-CPU-policy so a record can never be mis-labeled PASS.
 */
import type { RunResult, OffloadProof } from "./EnduranceLadder.js";

export const LOCALAI_BASE_URL = "http://127.0.0.1:8080/v1";

export interface ProjectCreationTestModelRecord {
	modelAlias: string | null;
	modelFamily: string | null;
	quantization: string | null;
	localAiRuntime: string;
	gpuDevice: string;
	vramBeforeMiB: number | null;
	vramAfterLoadMiB: number | null;
	vramPeakMiB: number | null;
	gpuOffloadProof: OffloadProof;
	contextSize: number | null;
	routerRole: string[];
	fallbackModel: string | null;
}

export interface LocalAiProviderRecord {
	provider: "localai";
	baseUrl: string;
	noCloudFallback: boolean;
}

export interface ClineProviderRecord {
	providerId: "openai-compatible";
	baseUrl: string;
	selectedModel: string | null;
	noFallbackProvider: boolean;
}

export interface BuildTestRuntimeRecord {
	build: { success: boolean; evidence: string[] };
	tests: { total: number; pass: number; fail: number };
	runtime: { opened: boolean; ran: boolean };
}

export interface EnduranceEvidencePack {
	runId: string;
	timer: { startedAt: number | null; endedAt: number | null; durationMs: number; fullRung: boolean };
	freshProject: { isolated: boolean; underRoot: boolean; reused: boolean };
	gpu: { offloadProof: OffloadProof; vramBeforeMiB: number | null; vramPeakMiB: number | null; backendState: string };
	model: ProjectCreationTestModelRecord | null;
	localAi: LocalAiProviderRecord;
	clineProvider: ClineProviderRecord;
	buildTestRuntime: BuildTestRuntimeRecord;
	finalState: { result: RunResult; bugs: string[] };
	passEligible: boolean;
}

export function createModelRecord(input: {
	modelAlias: string;
	modelFamily: string;
	quantization: string;
	localAiRuntime?: string;
	gpuDevice?: string;
	vramBeforeMiB?: number | null;
	vramAfterLoadMiB?: number | null;
	vramPeakMiB?: number | null;
	gpuOffloadProof: OffloadProof;
	contextSize?: number | null;
	routerRole?: string[];
	fallbackModel?: string | null;
}): ProjectCreationTestModelRecord {
	return {
		modelAlias: input.modelAlias,
		modelFamily: input.modelFamily,
		quantization: input.quantization,
		localAiRuntime: input.localAiRuntime ?? "localai",
		gpuDevice: input.gpuDevice ?? "unknown",
		vramBeforeMiB: input.vramBeforeMiB ?? null,
		vramAfterLoadMiB: input.vramAfterLoadMiB ?? null,
		vramPeakMiB: input.vramPeakMiB ?? null,
		gpuOffloadProof: input.gpuOffloadProof,
		contextSize: input.contextSize ?? null,
		routerRole: input.routerRole ?? [],
		fallbackModel: input.fallbackModel ?? null,
	};
}

/**
 * Build an evidence pack. `passEligible` is true only when every hard invariant holds:
 * GPU offload proven, localai-only (no cloud), Cline openai-compatible with no fallback,
 * full rung duration, isolated fresh project, clean build/test, and final result is PASS.
 * Callers must NOT call this PASS when passEligible=false.
 */
export function buildEvidencePack(input: {
	runId: string;
	timer: { startedAt: number | null; endedAt: number | null; durationMs: number; fullRung: boolean };
	freshProject: { isolated: boolean; underRoot: boolean; reused: boolean };
	gpu: { offloadProof: OffloadProof; vramBeforeMiB: number | null; vramPeakMiB: number | null; backendState: string };
	model: ProjectCreationTestModelRecord | null;
	localAi?: Partial<LocalAiProviderRecord>;
	clineProvider?: Partial<ClineProviderRecord>;
	buildTestRuntime: BuildTestRuntimeRecord;
	finalState: { result: RunResult; bugs: string[] };
}): EnduranceEvidencePack {
	const localAi: LocalAiProviderRecord = { provider: "localai", baseUrl: LOCALAI_BASE_URL, noCloudFallback: true, ...input.localAi };
	const clineProvider: ClineProviderRecord = { providerId: "openai-compatible", baseUrl: LOCALAI_BASE_URL, selectedModel: input.model?.modelAlias ?? null, noFallbackProvider: true, ...input.clineProvider };
	const pack: EnduranceEvidencePack = { ...input, localAi, clineProvider } as EnduranceEvidencePack;
	pack.passEligible =
		input.gpu.offloadProof === "PASS" &&
		localAi.provider === "localai" &&
		localAi.noCloudFallback &&
		clineProvider.providerId === "openai-compatible" &&
		clineProvider.noFallbackProvider &&
		clineProvider.baseUrl === LOCALAI_BASE_URL &&
		input.timer.fullRung &&
		input.freshProject.isolated &&
		input.freshProject.underRoot &&
		!input.freshProject.reused &&
		input.buildTestRuntime.build.success &&
		input.buildTestRuntime.tests.fail === 0 &&
		input.finalState.result === "PASS";
	return pack;
}
