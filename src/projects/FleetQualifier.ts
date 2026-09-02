/**
 * FleetQualifier (Phase 22, W1306/W1307). Given the fleet of prepared models and the
 * LIVE free-VRAM budget, computes which models are actually FLASH_READY (all GPU gates
 * proven + fits VRAM), the GPU qualification order, and the best project-creation
 * selection. Reuses family-diversity scoring so clones/over-represented families rank lower.
 * Pure + testable; never invents readiness. A MODEL_READY_CPU model is NEVER FLASH_READY here.
 */
import { familyDiversityPenalty } from "./FamilyDiversityAnalyzer.js";

export interface FlashGates {
	gpuLoad: boolean;
	gpuOffloadProven: boolean;
	smoke: boolean;
	correctness: boolean;
	stability: boolean;
	benchmark: boolean;
	vramMeasured: boolean;
}

export type FleetStatus = "PREPARED_VERIFIED" | "MODEL_READY_CPU" | "PREPARED" | "INSTALLED_ONLY";

export interface QualifiableModel {
	modelId: string;
	alias: string;
	quantization: string;
	license: string;
	family: string;
	estimatedVRAMMiB: number;
	requiredHeadroomMiB: number;
	securityPass: boolean;
	parameterPass: boolean;
	status: FleetStatus;
	roleHints: string[];
	flashGates: FlashGates;
}

export interface QualifiableResult {
	alias: string;
	modelId: string;
	neededMiB: number;
	fits: boolean;
	gated: boolean;
	securityPass: boolean;
	parameterPass: boolean;
	eligibility: "FLASH_READY" | "WAITING_GPU" | "GPU_PRESSURE_BLOCK" | "NOT_READY";
	reason: string;
}

export interface ProjectCreationCandidate {
	alias: string;
	score: number;
	roles: string[];
}

export interface FleetQualification {
	freeVramMiB: number;
	flashReady: { alias: string; modelId: string }[];
	waitingGpu: { alias: string; neededMiB: number }[];
	nextEligible: { alias: string; neededMiB: number } | null;
	flashReadyCount: number;
	projectCreationSelection: ProjectCreationCandidate[];
	qualified: QualifiableResult[];
}

export const PROJECT_CREATION_ROLES = ["CODING", "FAST_TOOL", "GENERAL", "JSON", "AUTONOMY_READ"];

function allFlashGates(g: FlashGates): boolean {
	return g.gpuLoad && g.gpuOffloadProven && g.smoke && g.correctness && g.stability && g.benchmark && g.vramMeasured;
}

function neededMiB(m: QualifiableModel): number {
	return m.estimatedVRAMMiB + m.requiredHeadroomMiB;
}

function eligibilityOf(m: QualifiableModel, freeMiB: number): QualifiableResult["eligibility"] {
	if (m.status === "MODEL_READY_CPU") return "NOT_READY"; // CPU-only model can never be FLASH_READY here
	if (!m.securityPass) return "NOT_READY";
	if (!m.parameterPass) return "NOT_READY";
	if (!allFlashGates(m.flashGates)) return "WAITING_GPU";
	return freeMiB >= neededMiB(m) ? "FLASH_READY" : "GPU_PRESSURE_BLOCK";
}

function reasonOf(m: QualifiableModel, eligibility: QualifiableResult["eligibility"]): string {
	switch (eligibility) {
		case "FLASH_READY": return "ALL GATES + VRAM";
		case "WAITING_GPU": return "GATES_PENDING";
		case "GPU_PRESSURE_BLOCK": return "INSUFFICIENT_FREE_VRAM";
		default: return m.status === "MODEL_READY_CPU" ? "CPU_ONLY_NOT_FLASH_READY" : "BLOCKED";
	}
}

function projectScore(m: QualifiableModel, all: QualifiableModel[]): number {
	let score = 0;
	for (const role of PROJECT_CREATION_ROLES) if (m.roleHints.includes(role)) score += 2;
	score -= familyDiversityPenalty(m.alias, all.map((x) => x.alias)) * 0.5;
	if (m.estimatedVRAMMiB < 2000) score += 1;
	if (m.license && /apache-2.0/i.test(m.license)) score += 1;
	return score;
}

export function qualifyFleet(models: QualifiableModel[], freeVramMiB: number): FleetQualification {
	const qualified: QualifiableResult[] = models.map((m) => {
		const eligibility = eligibilityOf(m, freeVramMiB);
		return { alias: m.alias, modelId: m.modelId, neededMiB: neededMiB(m), fits: eligibility === "FLASH_READY", gated: allFlashGates(m.flashGates), securityPass: m.securityPass, parameterPass: m.parameterPass, eligibility, reason: reasonOf(m, eligibility) };
	});
	const flashReady = qualified.filter((q) => q.eligibility === "FLASH_READY").map((q) => ({ alias: q.alias, modelId: q.modelId }));
	const waitingGpu = qualified.filter((q) => q.eligibility === "WAITING_GPU" || q.eligibility === "GPU_PRESSURE_BLOCK").map((q) => ({ alias: q.alias, neededMiB: q.neededMiB }));
	const blocked = qualified.filter((q) => q.eligibility === "GPU_PRESSURE_BLOCK").sort((a, b) => a.neededMiB - b.neededMiB);
	const nextEligible = blocked[0] ? { alias: blocked[0].alias, neededMiB: blocked[0].neededMiB } : null;
	const projectCandidates = qualified.filter((q) => q.eligibility === "FLASH_READY" || q.eligibility === "GPU_PRESSURE_BLOCK");
	const projectCreationSelection = projectCandidates
		.map((q) => {
			const m = models.find((x) => x.alias === q.alias)!;
			return { alias: q.alias, score: projectScore(m, models), roles: m.roleHints };
		})
		.sort((a, b) => b.score - a.score);
	return { freeVramMiB, flashReady, waitingGpu, nextEligible, flashReadyCount: flashReady.length, projectCreationSelection, qualified };
}
