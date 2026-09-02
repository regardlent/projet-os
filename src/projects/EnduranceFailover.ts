/**
 * EnduranceFailover (Phase 22, W1330). GPU_MODEL_FAILOVER_TEST.
 * Models a primary->fallback switch. A primary failure ALWAYS records a finding. Under the
 * strict clean-endurance ladder, a primary failure fails the rung even if a fallback could
 * continue (no silent rescue). The dedicated failover scenario may continue on a valid GPU
 * fallback, but its result is a FAILOVER_TEST result - never merged into a clean endurance PASS.
 * Pure + testable.
 */

export interface CandidateModel {
	alias: string;
	flashReady: boolean;
	gpuOffloadProven: boolean;
	provenCapabilities: string[];
}

export type FailoverOutcome = "PRIMARY_HEALTHY" | "FALLBACK_SELECTED" | "FALLBACK_REFUSED" | "FALLBACK_UNAVAILABLE";

export interface FailoverDecision {
	allowed: boolean;
	reason: string | null;
	finding: boolean;
	outcome: FailoverOutcome;
	fallback: string | null;
}

export type Scenario = "CLEAN_ENDURANCE" | "GPU_MODEL_FAILOVER_TEST";

export interface FailoverClassification {
	rungResult: "PASS" | "FAIL";
	classification: string;
	finding: boolean;
}

/** Decide whether a fallback may take over after a primary failure. A finding is ALWAYS recorded on failure. */
export function decideFailover(primaryFailed: boolean, fallback: CandidateModel | null, requiredCapability: string): FailoverDecision {
	if (!primaryFailed) return { allowed: true, reason: null, finding: false, outcome: "PRIMARY_HEALTHY", fallback: null };
	if (fallback === null) return { allowed: false, reason: "FALLBACK_UNAVAILABLE", finding: true, outcome: "FALLBACK_UNAVAILABLE", fallback: null };
	if (!fallback.flashReady) return { allowed: false, reason: "FALLBACK_NOT_FLASH_READY", finding: true, outcome: "FALLBACK_REFUSED", fallback: fallback.alias };
	if (!fallback.gpuOffloadProven) return { allowed: false, reason: "FALLBACK_GPU_OFFLOAD_NOT_PROVEN", finding: true, outcome: "FALLBACK_REFUSED", fallback: fallback.alias };
	if (!fallback.provenCapabilities.includes(requiredCapability)) {
		return { allowed: false, reason: "FALLBACK_CAPABILITY_NOT_PROVEN", finding: true, outcome: "FALLBACK_REFUSED", fallback: fallback.alias };
	}
	return { allowed: true, reason: null, finding: true, outcome: "FALLBACK_SELECTED", fallback: fallback.alias };
}

/**
 * Classify a run after a primary failure / fallback attempt.
 * - CLEAN_ENDURANCE: any primary failure FAILS the rung (strict ladder). A fallback never rescues a clean PASS.
 * - GPU_MODEL_FAILOVER_TEST: a valid GPU fallback that continues yields a FAILOVER-specific PASS (separate from clean PASS).
 */
export function classifyFailoverRun(scenario: Scenario, decision: FailoverDecision): FailoverClassification {
	if (decision.outcome === "PRIMARY_HEALTHY") return { rungResult: "PASS", classification: "CLEAN_PASS", finding: false };
	if (scenario === "CLEAN_ENDURANCE") return { rungResult: "FAIL", classification: "PRIMARY_FAILURE_FAILED_RUNG", finding: true };
	if (decision.allowed) return { rungResult: "PASS", classification: "FAILOVER_TEST_PASS (fallback continued on GPU)", finding: true };
	return { rungResult: "FAIL", classification: "FAILOVER_TEST_FAIL", finding: true };
}
