/**
 * ModelPreparationTransaction (Phase 20/21, W1153-1157).
 * Supply-chain transaction for a single model preparation. Persist the plan
 * BEFORE mutation so a crash can be reconciled against the LocalAI job and the
 * on-disk artifact. "PREPARED_VERIFIED" never implies FLASH_READY.
 */

export type PrepState =
	| "PLANNED"
	| "PREFLIGHT"
	| "INSTALLING"
	| "VERIFYING"
	| "SCANNING"
	| "COMMITTING"
	| "PREPARED_VERIFIED"
	| "FAILED"
	| "QUARANTINED";

export type HashState = "MATCH" | "RECORDED_NO_REFERENCE" | "MISMATCH";
export type SecurityScan = "PASS" | "FINDING" | "SCAN_INCOMPLETE" | "UNKNOWN";

export interface PreparationArtifact {
	filename: string;
	sizeBytes: number;
	sha256: string;
	hashState: HashState;
	security: SecurityScan;
}

export interface ModelPreparationTransaction {
	transactionId: string;
	candidate: string; // alias
	upstream: string;
	variant: string;
	expectedSha256?: string;
	license: string;
	effectiveParameters: number | null;
	parameterConfidence: "HIGH" | "VERIFIED" | "LOW" | "UNKNOWN";
	trustTier: 1 | 2 | 3 | 4 | 5;
	diskBeforeBytes: number;
	state: PrepState;
	jobId: string | null;
	artifact?: PreparationArtifact;
	startedAt: number;
	completedAt?: number;
	failReasons: string[];
}

export function createPreparation(input: {
	candidate: string;
	upstream: string;
	license: string;
	effectiveParameters: number | null;
	parameterConfidence: ModelPreparationTransaction["parameterConfidence"];
	trustTier: ModelPreparationTransaction["trustTier"];
	variant: string;
	expectedSha256?: string;
	diskBeforeBytes: number;
}): ModelPreparationTransaction {
	return {
		transactionId: `prep-${Date.now()}-${input.candidate.replace(/[^a-z0-9-]/gi, "")}`,
		candidate: input.candidate,
		upstream: input.upstream,
		variant: input.variant,
		expectedSha256: input.expectedSha256,
		license: input.license,
		effectiveParameters: input.effectiveParameters,
		parameterConfidence: input.parameterConfidence,
		trustTier: input.trustTier,
		diskBeforeBytes: input.diskBeforeBytes,
		state: "PLANNED",
		jobId: null,
		startedAt: Date.now(),
		failReasons: [],
	};
}

/** Transition state machine; returns null on illegal transition (caller should abort). */
export function advancePreparation(tx: ModelPreparationTransaction, next: PrepState): ModelPreparationTransaction | null {
	const order: PrepState[] = ["PLANNED", "PREFLIGHT", "INSTALLING", "VERIFYING", "SCANNING", "COMMITTING", "PREPARED_VERIFIED"];
	const i = order.indexOf(tx.state);
	const j = order.indexOf(next);
	const isTerminal = tx.state === "FAILED" || tx.state === "QUARANTINED";
	if (isTerminal) return null; // terminal states do not advance
	if (next === "FAILED" || next === "QUARANTINED") return { ...tx, state: next, completedAt: Date.now() };
	// block skipping straight to the final prepared state before the commit stage
	if (next === "PREPARED_VERIFIED" && tx.state !== "COMMITTING") return null;
	if (i === -1 || j === -1 || j <= i) return null; // no backward
	return { ...tx, state: next };
}

/**
 * Register a completed download. Hash is compared against the reference when
 * available (MISMATCH blocks); otherwise recorded. A Defender finding flips the
 * transaction to QUARANTINED.
 */
export function commitDownloadedArtifact(
	tx: ModelPreparationTransaction,
	artifact: Omit<PreparationArtifact, "hashState">,
): ModelPreparationTransaction {
	const hashState: HashState = tx.expectedSha256
		? artifact.sha256.toLowerCase() === tx.expectedSha256.toLowerCase()
			? "MATCH"
			: "MISMATCH"
		: "RECORDED_NO_REFERENCE";
	const next: ModelPreparationTransaction = {
		...tx,
		artifact: { ...artifact, hashState },
		state: hashState === "MISMATCH" ? "FAILED" : "SCANNING",
		failReasons: hashState === "MISMATCH" ? [...tx.failReasons, "HASH_MISMATCH"] : tx.failReasons,
	};
	return next;
}

/** Finalize after Defender + config verification pass. */
export function finalizePrepared(tx: ModelPreparationTransaction, configVerified: boolean): ModelPreparationTransaction {
	if (tx.artifact?.security === "FINDING") return { ...tx, state: "QUARANTINED", completedAt: Date.now() };
	if (!configVerified || tx.artifact?.security === "SCAN_INCOMPLETE") {
		return { ...tx, state: "FAILED", completedAt: Date.now(), failReasons: [...tx.failReasons, configVerified ? "SCAN_INCOMPLETE" : "CONFIG_UNVERIFIED"] };
	}
	return { ...tx, state: "PREPARED_VERIFIED", completedAt: Date.now() };
}

export function isPrepared(tx: ModelPreparationTransaction): boolean {
	return tx.state === "PREPARED_VERIFIED";
}
