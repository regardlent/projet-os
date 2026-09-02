/**
 * Artifact domain model (Project OS).
 *
 * Plain data structures only — no `vscode` import, so this stays unit-testable.
 * The shape mirrors the governing PROJECT_OS spec while remaining framework-free.
 */

export type ArtifactStatus =
	| "DRAFT"
	| "GENERATING"
	| "READY_FOR_REVIEW"
	| "CHANGES_REQUESTED"
	| "APPROVED"
	| "APPLYING"
	| "VERIFYING"
	| "VERIFIED"
	| "FAILED"
	| "SUPERSEDED"
	| "ARCHIVED";

export type ArtifactType =
	| "implementation_plan"
	| "change_contract"
	| "project_dna"
	| "workspace_drift"
	| "architecture"
	| "dependency_graph"
	| "project_map"
	| "code_diff"
	| "changed_files"
	| "markdown"
	| "documentation"
	| "test_report"
	| "bug_report"
	| "audit_report"
	| "benchmark"
	| "chart"
	| "image"
	| "screenshot"
	| "terminal_log"
	| "command_log"
	| "build_report"
	| "qa_report"
	| "security_report"
	| "performance_report"
	| "release_report"
	| "checkpoint"
	| "ADR"
	| "reference";

export interface ArtifactComment {
	id: string;
	author: string;
	text: string;
	at: number;
}

export interface ArtifactVerification {
	status: ArtifactStatus;
	evidence: string[];
	checkedAt?: number;
}

export interface Artifact {
	id: string;
	/** Auto-incremented on each critical content change. */
	version: number;
	type: ArtifactType;
	title: string;
	status: ArtifactStatus;
	agentId?: string;
	sessionId?: string;
	runId?: string;
	parentArtifactId?: string;
	createdAt: number;
	updatedAt: number;
	/** Opaque content reference (URI or file path). */
	contentUri: string;
	sourceFiles: string[];
	comments: ArtifactComment[];
	pinned: boolean;
	archived: boolean;
	verification?: ArtifactVerification;
	metadata: Record<string, unknown>;
}

/** The persisted envelope split between index and content. */
export interface ArtifactRecord extends Artifact {
	sha256: string;
}

export type ArtifactSearchFilter = {
	types?: ArtifactType[];
	status?: ArtifactStatus[];
	agentId?: string;
	sessionId?: string;
	pinned?: boolean;
	archived?: boolean;
	query?: string;
};
