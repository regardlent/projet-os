/**
 * Autonomy write plan + scope + write-path guard (Phase 14). Pure + guarded.
 * All writes must stay inside the active managed project workspace.
 */
import path from "node:path";

export type WriteOperation = "create" | "modify" | "patch" | "delete" | "rename";

export interface AutonomyWritePlan {
	runId: string;
	projectId: string;
	workspaceRoot: string;
	goal: string;
	requestedMinutes: number;
	selectedModel: string;
	filesExpected: string[];
	operations: WriteOperation[];
	risk: "low" | "medium" | "high";
	testsExpected: string[];
	rollbackPlan: string;
	createdAt: number;
}

export interface AutonomyWriteScope {
	runId: string;
	workspaceRoot: string;
	allowedPaths: string[];
	deniedPaths: string[];
	allowedOperations: WriteOperation[];
	maxFiles: number;
	maxBytesChanged: number;
	maxPatchLines: number;
	allowCreate: boolean;
	allowOverwrite: boolean;
	allowDelete: boolean;
	allowRename: boolean;
	expiresAt: number;
}

export function buildWritePlan(input: {
	runId: string;
	projectId: string;
	workspaceRoot: string;
	goal: string;
	minutes: number;
	model: string;
	allowedOperations: WriteOperation[];
	testsExpected?: string[];
}): AutonomyWritePlan {
	return {
		runId: input.runId,
		projectId: input.projectId,
		workspaceRoot: input.workspaceRoot,
		goal: input.goal,
		requestedMinutes: input.minutes,
		selectedModel: input.model,
		filesExpected: [],
		operations: input.allowedOperations,
		risk: input.allowedOperations.includes("delete") ? "high" : input.allowedOperations.length > 1 ? "medium" : "low",
		testsExpected: input.testsExpected ?? [],
		rollbackPlan: ".project-os/autonomy-backups/<runId>",
		createdAt: Date.now(),
	};
}

export function buildWriteScope(input: {
	runId: string;
	workspaceRoot: string;
	complexity: "small" | "medium" | "large";
	now?: number;
}): AutonomyWriteScope {
	const now = input.now ?? Date.now();
	const maxFiles = input.complexity === "large" ? 30 : input.complexity === "medium" ? 15 : 5;
	return {
		runId: input.runId,
		workspaceRoot: input.workspaceRoot,
		allowedPaths: [],
		deniedPaths: [],
		allowedOperations: ["create", "modify", "patch"],
		maxFiles: Math.min(50, maxFiles),
		maxBytesChanged: 250_000,
		maxPatchLines: Math.min(50, maxFiles) * 60,
		allowCreate: true,
		allowOverwrite: true,
		allowDelete: false,
		allowRename: false,
		expiresAt: now + 60 * 60_000,
	};
}

export const PROTECTED_DIRS = [".git", "node_modules", "dist", "build", ".project-os", ".agents"] as const;

const SECRET_RE =
	/(^|[./])(env|env\.[^/]*|pem|key|p12|pfx|crt|pem)(\.[^/]*)?$|id_rsa|id_ed25519|credentials[^/]*|secrets[^/]*/i;

export function isSecretFile(name: string): boolean {
	return SECRET_RE.test(name);
}

/** Resolve a relative request and test it stays inside the workspace and is not protected. */
export function isProtectedPath(root: string, absolute: string): boolean {
	const rel = path.relative(root, absolute);
	if (rel.startsWith("..") || path.isAbsolute(rel)) return true;
	for (const d of PROTECTED_DIRS) if (rel.split(path.sep)[0] === d) return true;
	return false;
}

export type WritePathReason = "OUTSIDE" | "PROTECTED" | "SECRET" | "NOT_ALLOWED";

/** Guard: allow a write only if it resolves inside the workspace, is not protected, not a secret. */
export function guardWritePath(
	root: string,
	requested: string,
	allowedOps: WriteOperation[],
	op: WriteOperation,
): { ok: true; absolute: string } | { ok: false; reason: WritePathReason } {
	const absolute = path.resolve(root, requested);
	const rel = path.relative(root, absolute);
	if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") return { ok: false, reason: "OUTSIDE" };
	if (isProtectedPath(root, absolute)) return { ok: false, reason: "PROTECTED" };
	if (isSecretFile(path.basename(absolute))) return { ok: false, reason: "SECRET" };
	if (!allowedOps.includes(op)) return { ok: false, reason: "NOT_ALLOWED" };
	return { ok: true, absolute };
}
