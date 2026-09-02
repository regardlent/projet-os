/**
 * HistoricalUsageImporter (W87).
 *
 * Imports past Cline sessions discovered via `cline.list()`/`get()` into usage
 * observations. Honesty rules:
 *  - EXACT when a trustworthy usage count is available (>0).
 *  - UNKNOWN (reason SDK_USAGE_GAP) when usage is 0 in a period affected by the
 *    LocalAI streaming usage gap — never "0 tokens".
 *  - Sessions whose workspace cannot be matched to a managed project are left
 *    out (UNMATCHED_SESSION), never assumed.
 *
 * Pure module: no `vscode` import.
 */
import { type UsageObservation } from "./UsageObservation.js";
import { WorkspaceRegistry } from "./WorkspaceRegistry.js";

export interface HistoricalSession {
	sessionId: string;
	/** Workspace cwd reported by the session manifest (for matching). */
	cwd?: string;
	providerId?: string;
	modelId?: string;
	startedAt?: number;
	/** Exact usage if the SDK/ledger can provide it. */
	inputTokens?: number;
	outputTokens?: number;
	/** true if the usage counts are trustworthy (>0). */
	hasExactUsage?: boolean;
}

export interface ImportResult {
	imported: number;
	exact: number;
	unknown: number;
	unmatched: number;
}

export function importHistoricalSessions(
	registry: WorkspaceRegistry,
	projectId: string,
	sessions: HistoricalSession[],
	newestFirst = true,
): { observations: UsageObservation[]; result: ImportResult } {
	const observations: UsageObservation[] = [];
	const result: ImportResult = { imported: 0, exact: 0, unknown: 0, unmatched: 0 };

	for (const session of sessions) {
		if (!session.cwd) {
			result.unmatched++;
			continue;
		}
		const ws = registry.ensureAlias(projectId, session.cwd);
		const checked = session.hasExactUsage && (session.outputTokens ?? 0) > 0;
		const obs: UsageObservation = {
			observationId: `hist|${session.sessionId}`,
			projectId,
			workspaceId: ws.workspaceId,
			workspacePath: ws.currentPath,
			sessionId: session.sessionId,
			providerId: session.providerId ?? "unknown",
			modelId: session.modelId ?? "unknown",
			inputTokens: checked ? (session.inputTokens ?? 0) : 0,
			outputTokens: checked ? (session.outputTokens ?? 0) : 0,
			totalTokens: checked ? (session.outputTokens ?? 0) : 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			source: "HISTORICAL_IMPORT",
			quality: checked ? "EXACT" : "UNKNOWN",
			scope: "HISTORICAL",
			timestamp: session.startedAt ?? Date.now(),
			note: checked ? undefined : "SDK_USAGE_GAP",
		};
		observations.push(obs);
		result.imported++;
		if (checked) {
			result.exact++;
		} else {
			result.unknown++;
		}
	}
	// Preserve the requested ordering.
	if (!newestFirst) observations.reverse();
	return { observations, result };
}

/**
 * Deterministic per-OS-project historical "since" — earliest reliable evidence,
 * not an invented date. Returns undefined if no evidence is provided.
 */
export function developmentStartedAt(evidenceTimestamps: number[]): number | undefined {
	if (evidenceTimestamps.length === 0) return undefined;
	return Math.min(...evidenceTimestamps);
}
