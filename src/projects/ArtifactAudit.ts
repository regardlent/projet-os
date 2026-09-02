/**
 * ArtifactAudit (Phase 24, W11). Verifies the REAL coherence of the artifact enums against an
 * expected declaration (the documented set), the UI type list and the registry's accepted types.
 * It reports actual counts and any drift — it never fixes the enum implicitly. Pure + testable.
 */
import { ARTIFACT_STATUSES } from "../artifacts/ArtifactStateMachine.js";
import type { ArtifactStatus, ArtifactType } from "../artifacts/Artifact.js";

export const EXPECTED_ARTIFACT_TYPES: ArtifactType[] = [
	"implementation_plan", "change_contract", "project_dna", "workspace_drift",
	"architecture", "dependency_graph", "project_map", "code_diff", "changed_files",
	"markdown", "documentation", "test_report", "bug_report", "audit_report",
	"benchmark", "chart", "image", "screenshot", "terminal_log", "command_log",
	"build_report", "qa_report", "security_report", "performance_report",
	"release_report", "checkpoint", "ADR", "reference",
];

export const EXPECTED_ARTIFACT_STATUSES: ArtifactStatus[] = [
	"DRAFT", "GENERATING", "READY_FOR_REVIEW", "CHANGES_REQUESTED", "APPROVED",
	"APPLYING", "VERIFYING", "VERIFIED", "FAILED", "SUPERSEDED", "ARCHIVED",
];

export interface ArtifactEnumAudit {
	actualTypeCount: number;
	expectedTypeCount: number;
	actualStatusCount: number;
	expectedStatusCount: number;
	missingTypes: ArtifactType[];
	missingStatuses: ArtifactStatus[];
	typesMatch: boolean;
	statusesMatch: boolean;
}

/** Compare the real runtime enums against the expected declaration. */
export function auditArtifactEnums(actualTypes: readonly ArtifactType[]): ArtifactEnumAudit {
	const missingTypes = EXPECTED_ARTIFACT_TYPES.filter((t) => !actualTypes.includes(t));
	const missingStatuses = EXPECTED_ARTIFACT_STATUSES.filter((s) => !ARTIFACT_STATUSES.includes(s));
	return {
		actualTypeCount: actualTypes.length,
		expectedTypeCount: EXPECTED_ARTIFACT_TYPES.length,
		actualStatusCount: ARTIFACT_STATUSES.length,
		expectedStatusCount: EXPECTED_ARTIFACT_STATUSES.length,
		missingTypes,
		missingStatuses,
		typesMatch: missingTypes.length === 0,
		statusesMatch: missingStatuses.length === 0,
	};
}

/** The literal ArtifactType union members, extracted from a value list (runtime). */
export function artifactTypeMembers(types: readonly ArtifactType[]): ArtifactType[] {
	return [...types];
}
