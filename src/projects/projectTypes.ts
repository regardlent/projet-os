/**
 * Project Factory — shared contracts & types (Phase 13).
 * Pure types only; no I/O. Kept separate so services stay small.
 */

export type ProjectType =
	| "auto"
	| "node"
	| "typescript"
	| "python"
	| "cpp"
	| "rust"
	| "go"
	| "web"
	| "desktop"
	| "docker"
	| "localai"
	| "empty";

export type ProjectStatus =
	| "CREATING"
	| "BOOTSTRAPPING"
	| "CONFIGURING"
	| "READY"
	| "ACTIVE"
	| "PAUSED"
	| "BLOCKED"
	| "ARCHIVED"
	| "BROKEN";

export type GoalStatus = "DRAFT" | "ACTIVE" | "BLOCKED" | "ACHIEVED" | "CANCELLED";

export interface ManagedProjectManifest {
	schemaVersion: number;
	projectId: string;
	slug: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	managedBy: string;
	controlPlaneRoot: string;
	workspaceRoot: string;
	projectType: ProjectType;
	status: ProjectStatus;
	goal: GoalContract | null;
	git: { initialized: boolean };
	addons: string[];
	modelProfile: Record<string, string>;
}

export interface GoalContract {
	goalId: string;
	projectId: string;
	objective: string;
	acceptanceCriteria: string[];
	constraints: string[];
	nonGoals: string[];
	priority: "low" | "normal" | "high";
	status: GoalStatus;
	createdAt: number;
	updatedAt: number;
	progress: number;
}

export interface CommandResult {
	command: string;
	ok: boolean;
	projectId?: string;
	status: string;
	message: string;
	warnings: string[];
	actions: string[];
	artifacts: string[];
	next?: string;
}

export interface ProjectCreateInput {
	name: string;
	type: ProjectType;
	goal?: string;
	objective?: string;
	git?: boolean;
}

export interface ProjectCreateResult {
	ok: boolean;
	projectId?: string;
	slug?: string;
	workspaceRoot?: string;
	status: ProjectStatus;
	message: string;
	warnings: string[];
}

export const SCHEMA_VERSION = 1;
export const MANAGED_BY = "cline-project-os";
