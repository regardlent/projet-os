/**
 * ArtifactStateMachine
 *
 * Pure state machine for `ArtifactStatus` transitions. Valid transitions are
 * declared once and enforced; any invalid transition throws. Unit-testable.
 */
import type { ArtifactStatus } from "./Artifact.js";

const ALL: Record<ArtifactStatus, readonly ArtifactStatus[]> = {
	DRAFT: ["GENERATING", "READY_FOR_REVIEW", "FAILED"],
	GENERATING: ["READY_FOR_REVIEW", "FAILED"],
	READY_FOR_REVIEW: ["CHANGES_REQUESTED", "APPROVED", "SUPERSEDED", "ARCHIVED"],
	CHANGES_REQUESTED: ["READY_FOR_REVIEW", "SUPERSEDED", "ARCHIVED"],
	APPROVED: ["APPLYING", "SUPERSEDED", "ARCHIVED"],
	APPLYING: ["VERIFYING", "FAILED", "SUPERSEDED"],
	VERIFYING: ["VERIFIED", "FAILED", "SUPERSEDED"],
	VERIFIED: ["SUPERSEDED", "ARCHIVED"],
	FAILED: ["DRAFT", "READY_FOR_REVIEW", "ARCHIVED"],
	SUPERSEDED: ["ARCHIVED"],
	ARCHIVED: [],
};

export const ARTIFACT_STATUSES: readonly ArtifactStatus[] = [
	"DRAFT",
	"GENERATING",
	"READY_FOR_REVIEW",
	"CHANGES_REQUESTED",
	"APPROVED",
	"APPLYING",
	"VERIFYING",
	"VERIFIED",
	"FAILED",
	"SUPERSEDED",
	"ARCHIVED",
];

export function canTransition(from: ArtifactStatus, to: ArtifactStatus): boolean {
	return ALL[from].includes(to);
}

export function assertValidTransition(from: ArtifactStatus, to: ArtifactStatus): void {
	if (!canTransition(from, to)) {
		throw new Error(
			`Invalid artifact transition: ${from} -> ${to} (allowed: ${ALL[from].join(", ") || "none"})`,
		);
	}
}

/** Returns the list of statuses reachable from the given status. */
export function nextStatuses(from: ArtifactStatus): readonly ArtifactStatus[] {
	return ALL[from];
}

/** Terminal statuses (no further transitions). */
export function isTerminal(status: ArtifactStatus): boolean {
	return ALL[status].length === 0;
}
