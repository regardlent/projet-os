/**
 * EnduranceLadder (Phase 22, W1309). GPU-mandatory project-creation endurance.
 * Pure state machine: sequential rungs (5/10/20/30/60, no skip), reset-on-failure
 * (accumulated time is lost; attempt restarts at 00:00 on the SAME rung), and a hard
 * gate that the timer can only start once GPU_OFFLOAD_PROOF = PASS. CPU fallback is
 * FORBIDDEN for the validation ladder. Never fakes a PASS. Pure + testable (no vscode).
 */

export type RungMinutes = 5 | 10 | 20 | 30 | 60;

export const RUNG_SEQUENCE: RungMinutes[] = [5, 10, 20, 30, 60];

export interface LadderPolicy {
	requireGpu: boolean;
	requireFlashReady: boolean;
	allowCpuFallback: boolean;
}

export const DEFAULT_LADDER_POLICY: LadderPolicy = { requireGpu: true, requireFlashReady: true, allowCpuFallback: false };

export type OffloadProof = "PASS" | "BLOCKED_GPU_INSUFFICIENT_VRAM" | "UNVERIFIED";

export interface LadderGate {
	gpuDetected: boolean;
	nvidiaRuntimeAvailable: boolean;
	localAiGpuBackendAvailable: boolean;
	freeVramMiB: number;
	neededVramMiB: number;
	modelEligible: boolean;
	securityPass: boolean;
	parameterPass: boolean;
	modelFlashReady: boolean;
	gpuOffloadProof: OffloadProof;
	runtimeAvailable: boolean;
}

export type GateCategory =
	| "OK"
	| "BLOCKED_GPU"
	| "BLOCKED_POLICY"
	| "BLOCKED_SECURITY"
	| "BLOCKED_PARAMETER"
	| "BLOCKED_NOT_FLASH_READY";

export interface GateVerdict {
	canStart: boolean;
	category: GateCategory;
	reason: string | null;
}

export function evaluateLadderGate(gate: LadderGate): GateVerdict {
	if (gate.gpuOffloadProof !== "PASS") return { canStart: false, category: "BLOCKED_GPU", reason: "GPU_OFFLOAD_PROOF != PASS" };
	if (!gate.gpuDetected || !gate.nvidiaRuntimeAvailable || !gate.localAiGpuBackendAvailable) {
		return { canStart: false, category: "BLOCKED_GPU", reason: "GPU/NVIDIA runtime/LocalAI GPU backend unavailable" };
	}
	if (gate.freeVramMiB < gate.neededVramMiB) return { canStart: false, category: "BLOCKED_GPU", reason: "INSUFFICIENT_FREE_VRAM" };
	if (!gate.modelEligible) return { canStart: false, category: "BLOCKED_GPU", reason: "MODEL_NOT_ELIGIBLE" };
	if (!gate.runtimeAvailable) return { canStart: false, category: "BLOCKED_GPU", reason: "RUNTIME_NOT_AVAILABLE" };
	if (!gate.securityPass) return { canStart: false, category: "BLOCKED_SECURITY", reason: "SECURITY_NOT_PASS" };
	if (!gate.parameterPass) return { canStart: false, category: "BLOCKED_PARAMETER", reason: "PARAMETER_NOT_PASS" };
	if (!gate.modelFlashReady) return { canStart: false, category: "BLOCKED_NOT_FLASH_READY", reason: "MODEL_NOT_FLASH_READY" };
	return { canStart: true, category: "OK", reason: null };
}

export type RunResult = "PASS" | "FAIL" | "BLOCKED_GPU" | "NOT_STARTED";

export interface RunRecord {
	runId: string;
	rungMinutes: RungMinutes;
	attempt: number;
	projectId: string | null;
	startedAt: number | null;
	endedAt: number | null;
	durationMs: number;
	modelAlias: string | null;
	gpuOffloadProof: OffloadProof;
	vramBeforeMiB: number | null;
	vramPeakMiB: number | null;
	provider: "localai";
	bugs: string[];
	result: RunResult;
	resetPerformed: boolean;
	evidence: string[];
}

export function createRunRecord(input: {
	runId: string;
	rungMinutes: RungMinutes;
	attempt: number;
	projectId: string | null;
	modelAlias: string | null;
	gpuOffloadProof: OffloadProof;
	vramBeforeMiB: number | null;
	vramPeakMiB?: number | null;
}): RunRecord {
	return {
		runId: input.runId,
		rungMinutes: input.rungMinutes,
		attempt: input.attempt,
		projectId: input.projectId,
		startedAt: null,
		endedAt: null,
		durationMs: 0,
		modelAlias: input.modelAlias,
		gpuOffloadProof: input.gpuOffloadProof,
		vramBeforeMiB: input.vramBeforeMiB,
		vramPeakMiB: input.vramPeakMiB ?? null,
		provider: "localai",
		bugs: [],
		result: "NOT_STARTED",
		resetPerformed: false,
		evidence: [],
	};
}
export class EnduranceLadder {
	readonly policy: LadderPolicy;
	private completed: RungMinutes[] = [];
	private attempts: Map<RungMinutes, number> = new Map();
	private runs: RunRecord[] = [];

	constructor(policy: Partial<LadderPolicy> = {}, initialCompleted: RungMinutes[] = []) {
		this.policy = { ...DEFAULT_LADDER_POLICY, ...policy };
		// Accept only a strict prefix of RUNG_SEQUENCE (anti-skip). Ignores anything out of order.
		this.completed = [];
		for (const rung of initialCompleted) {
			if (this.completed.length < RUNG_SEQUENCE.length && rung === RUNG_SEQUENCE[this.completed.length]) this.completed.push(rung);
			else break;
		}
	}
	/** Persistable snapshot of the ladder progress (rung order is the source of truth). */
	toSnapshot(): { policy: LadderPolicy; completed: RungMinutes[]; attempts: Record<string, number> } {
		const attempts: Record<string, number> = {};
		for (const [k, v] of this.attempts) attempts[String(k)] = v;
		return { policy: this.policy, completed: this.completed.slice(), attempts };
	}

	get completedRungs(): RungMinutes[] { return this.completed.slice(); }
	get allRuns(): RunRecord[] { return this.runs.slice(); }
	get isComplete(): boolean { return this.completed.length >= RUNG_SEQUENCE.length; }

	/** The next rung to run (no-skip: strictly sequential). Null when the ladder is done. */
	nextRungMinutes(): RungMinutes | null {
		const idx = this.completed.length;
		return idx < RUNG_SEQUENCE.length ? RUNG_SEQUENCE[idx] : null;
	}

	attemptsFor(rung: RungMinutes): number { return this.attempts.get(rung) ?? 0; }
	private countAttempt(rung: RungMinutes): number {
		const n = (this.attempts.get(rung) ?? 0) + 1;
		this.attempts.set(rung, n);
		return n;
	}

	evaluateGate(gate: LadderGate): GateVerdict {
		if (this.policy.allowCpuFallback) return { canStart: false, category: "BLOCKED_POLICY", reason: "CPU_FALLBACK_FORBIDDEN" };
		return evaluateLadderGate(gate);
	}

	/**
	 * Attempt to start a run. A run can only start on the current rung and only if the
	 * GPU gate passes (GPU_OFFLOAD_PROOF = PASS). Otherwise BLOCKED_GPU is returned and
	 * no timer may begin.
	 */
	startRun(input: { runId: string; rungMinutes: RungMinutes; projectId: string | null; modelAlias: string | null; gate: LadderGate }): { ok: boolean; record: RunRecord | null; verdict: GateVerdict } {
		if (this.policy.allowCpuFallback) return { ok: false, record: null, verdict: { canStart: false, category: "BLOCKED_POLICY", reason: "CPU_FALLBACK_FORBIDDEN" } };
		const verdict = evaluateLadderGate(input.gate);
		if (this.nextRungMinutes() !== input.rungMinutes) return { ok: false, record: null, verdict: { canStart: false, category: "BLOCKED_GPU", reason: "RUNG_OUT_OF_ORDER" } };
		if (!verdict.canStart) return { ok: false, record: null, verdict };
		const attempt = this.countAttempt(input.rungMinutes);
		const rec = createRunRecord({
			runId: input.runId, rungMinutes: input.rungMinutes, attempt,
			projectId: input.projectId, modelAlias: input.modelAlias, gpuOffloadProof: input.gate.gpuOffloadProof,
			vramBeforeMiB: input.gate.freeVramMiB,
		});
		rec.startedAt = Date.now();
		this.runs.push(rec);
		return { ok: true, record: rec, verdict };
	}

	/**
	 * Complete a run. PASS advances the ladder (only the current rung). Any other result
	 * (FAIL / BLOCKED_GPU) does NOT advance and marks resetPerformed=true — the SAME rung
	 * must be re-run from 00:00 (accumulated time is lost).
	 */
	completeRun(runId: string, result: RunResult, bugs: string[] = [], evidence: string[] = []): { record: RunRecord | null; advanced: boolean } {
		const r = this.runs.find((x) => x.runId === runId);
		if (!r) return { record: null, advanced: false };
		r.endedAt = Date.now();
		r.durationMs = r.endedAt - (r.startedAt ?? r.endedAt);
		r.result = result;
		r.bugs = bugs.slice();
		r.evidence = evidence.slice();
		let advanced = false;
		if (result === "PASS") {
			if (!this.completed.includes(r.rungMinutes)) this.completed.push(r.rungMinutes);
			advanced = true;
		} else {
			r.resetPerformed = true;
		}
		return { record: r, advanced };
	}
}

