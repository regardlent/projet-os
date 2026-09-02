/**
 * FailureRecovery (Phase 24, W28). Classifies a runtime failure into a boundary and a safe
 * recovery action, so a broken gate can be diagnosed without guesswork. Pure + testable.
 * Never returns PASS; it only classifies and proposes the next safe action.
 */
export type FailureBoundary =
	| "FILESYSTEM"
	| "SECURITY"
	| "PROVIDER"
	| "GPU_RUNTIME"
	| "LOCALAI"
	| "CLINE"
	| "ROUTER"
	| "BUDGET"
	| "PERSISTENCE"
	| "UI"
	| "BUILD"
	| "TEST"
	| "OTHER";

export type RecoveryAction =
	| "RETRY"
	| "RESTORE_FROM_BACKUP"
	| "RELOAD_PROVIDER"
	| "RELOAD_GPU_CONFIG"
	| "REVIEW_GUARDS"
	| "ROLLBACK_CHANGE"
	| "REBUILD"
	| "RESET_COUNTER"
	| "ESCALATE_HUMAN";

export interface FailureVerdict {
	boundary: FailureBoundary;
	action: RecoveryAction;
	safe: boolean;
	reason: string;
}

/** Classify a failure from an occurrence kind / signal. */
export function classifyFailure(signal: {
	kind: string;
	message?: string;
}): FailureVerdict {
	const m = signal.message?.toLowerCase() ?? "";
	const k = signal.kind.toLowerCase();
	const has = (...ns: string[]) => ns.some((n) => k.includes(n) || m.includes(n));

	if (has("gpu", "vram", "cuda", "out of memory") && has("gpu", "vram", "cuda", "out of memory")) {
		return { boundary: "GPU_RUNTIME", action: "RELOAD_GPU_CONFIG", safe: true, reason: "GPU/VRAM boundary; reload config or wait for VRAM. Never CPU fallback." };
	}
	if (has("provider", "baseurl", "endpoint", "401", "403", "cloud")) {
		return { boundary: "PROVIDER", action: "RELOAD_PROVIDER", safe: true, reason: "Provider boundary; reload/verify loopback LocalAI, no cloud fallback." };
	}
	if (has("localai", "models", "inference")) {
		return { boundary: "LOCALAI", action: "RETRY", safe: true, reason: "LocalAI boundary; verify /v1/models then retry." };
	}
	if (has("traversal", "secret", "protected", "denied", "write", "approval", "expired")) {
		return { boundary: "SECURITY", action: "REVIEW_GUARDS", safe: true, reason: "Security boundary; review write-lane/guards/approval, never bypass." };
	}
	if (has("budget", "reservation", "spend", "payg")) {
		return { boundary: "BUDGET", action: "RESET_COUNTER", safe: true, reason: "Budget boundary; reset stale reservation, never fabricate cost." };
	}
	if (has("registry", "json", "corrupt", "persist", "store")) {
		return { boundary: "PERSISTENCE", action: "RESTORE_FROM_BACKUP", safe: true, reason: "Persistence boundary; restore from backup, drop corrupt record, never fatal." };
	}
	if (has("build", "compile", "link", "cmake", "g++")) {
		return { boundary: "BUILD", action: "REBUILD", safe: true, reason: "Build boundary; rebuild and re-run." };
	}
	if (has("test", "fail", "assert")) {
		return { boundary: "TEST", action: "RESET_COUNTER", safe: true, reason: "Test boundary; re-run from a clean baseline." };
	}
	return { boundary: "OTHER", action: "ESCALATE_HUMAN", safe: false, reason: "Unclassified failure; escalate to a human, do not guess." };
}
