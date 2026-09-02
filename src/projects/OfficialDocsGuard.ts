/**
 * OfficialDocsGuard (Phase 20/21, W1105-1107, W1113-1117).
 * "Official-doc-first" runtime: before trusting an exact API/model claim, record
 * the official source and compare it to the installed runtime behaviour. Runtime
 * behaviour wins for execution; official upstream wins for license/parameters.
 * Pure + testable.
 */

export type DocsResult = "CONFIRMED" | "RUNTIME_OVERRIDE" | "CONFLICT" | "UNKNOWN" | "STALE";

export type DocsTopic =
	| "LOCALAI_DISCOVERY"
	| "LOCALAI_MODEL_GALLERY"
	| "LOCALAI_VARIANTS"
	| "LOCALAI_MODEL_INSTALL"
	| "LOCALAI_CONFIG"
	| "LOCALAI_VRAM"
	| "LOCALAI_BACKEND_MANAGEMENT"
	| "CLINE_APPROVAL_API"
	| "ANTIGRAVITY_WORKFLOWS"
	| "MODEL_LICENSES"
	| "MODEL_PARAMETER_COUNTS";

export interface SourceLockEntry {
	sourceId: string;
	topic: DocsTopic;
	entity?: string;
	claim: string;
	officialSource: string;
	checkedAt: number;
	runtimeVersion?: string;
	runtimeProbe?: string;
	result: DocsResult;
	notes?: string;
}

export class OfficialDocsGuard {
	private locks = new Map<string, SourceLockEntry>();

	record(entry: Omit<SourceLockEntry, "checkedAt"> & { checkedAt?: number }): SourceLockEntry {
		const full: SourceLockEntry = { ...entry, checkedAt: entry.checkedAt ?? Date.now() };
		this.locks.set(entry.sourceId, full);
		return full;
	}

	get(sourceId: string): SourceLockEntry | undefined {
		return this.locks.get(sourceId);
	}

	list(): SourceLockEntry[] {
		return [...this.locks.values()];
	}
}

/**
 * Compare an official-doc claim against the observed runtime behaviour.
 * Returns RUNTIME_OVERRIDE when runtime conclusively differs, CONFLICT when both
 * are present but unattributable, CONFIRMED when they agree, UNKNOWN otherwise.
 */
export function compareDocsRuntime(
	docClaim: string | null | undefined,
	runtimeObserved: string | null | undefined,
): DocsResult {
	if (!docClaim && !runtimeObserved) return "UNKNOWN";
	if (!runtimeObserved) return "STALE"; // doc known but runtime unobservable
	if (!docClaim) return "RUNTIME_OVERRIDE"; // runtime observed, no doc => runtime is authority
	return (docClaim.trim().toLowerCase() === runtimeObserved.trim().toLowerCase()) ? "CONFIRMED" : "RUNTIME_OVERRIDE";
}

/** Every "exact/uncertain" topic is proactively watchlisted so it gets re-verified, not cached forever. */
export const OfficialDocsWatchlist: DocsTopic[] = [
	"LOCALAI_DISCOVERY",
	"LOCALAI_MODEL_GALLERY",
	"LOCALAI_VARIANTS",
	"LOCALAI_MODEL_INSTALL",
	"LOCALAI_CONFIG",
	"LOCALAI_VRAM",
	"LOCALAI_BACKEND_MANAGEMENT",
	"CLINE_APPROVAL_API",
	"ANTIGRAVITY_WORKFLOWS",
	"MODEL_LICENSES",
	"MODEL_PARAMETER_COUNTS",
];
