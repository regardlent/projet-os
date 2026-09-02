/**
 * WorkspaceRegistry / Stable IDs (W86).
 *
 * Gives a stable `projectId` to an OS project and a stable `workspaceId` to each
 * workspace path, with a path-alias registry. The same OS project may have been
 * developed under several paths (e.g. OLD `...\ancien\project-os` and NEW
 * `...\projet-os`); both resolve to the same `projectId`, so lifetime counters
 * survive a path migration.
 *
 * Pure module: no `vscode` import.
 */
import * as crypto from "node:crypto";

export interface ManagedWorkspace {
	workspaceId: string;
	projectId: string;
	currentPath: string;
	pathAliases: string[];
	firstSeenAt: number;
	lastSeenAt: number;
	canonical: boolean;
}

function hashId(input: string): string {
	return crypto.createHash("sha1").update(input, "utf8").digest("hex").slice(0, 12);
}

export function normalizePath(p: string): string {
	return p.replace(/[\\/]+$/, "").toLowerCase();
}

export class WorkspaceRegistry {
	private readonly byProject = new Map<string, ManagedWorkspace>();
	private readonly aliasIndex = new Map<string, string>(); // normalized path -> workspaceId

	/** Register a workspace path (idempotent); all paths of a project share one workspaceId. */
	registerWorkspace(projectId: string, fsPath: string, canonical = false): ManagedWorkspace {
		const normalized = normalizePath(fsPath);
		const existing = this.byProject.get(projectId);
		if (existing) {
			existing.lastSeenAt = Date.now();
			if (canonical) existing.canonical = true;
			if (!existing.pathAliases.includes(fsPath)) existing.pathAliases.push(fsPath);
			this.aliasIndex.set(normalized, existing.workspaceId);
			if (!this.byProject.has(projectId)) this.byProject.set(projectId, existing);
			return existing;
		}
		const workspaceId = hashId(`project|${projectId}`);
		const ws: ManagedWorkspace = {
			workspaceId,
			projectId,
			currentPath: fsPath,
			pathAliases: [fsPath],
			firstSeenAt: Date.now(),
			lastSeenAt: Date.now(),
			canonical,
		};
		this.byProject.set(projectId, ws);
		this.aliasIndex.set(normalized, workspaceId);
		return ws;
	}

	/** Alias an additional path to the project (migration-agnostic, idempotent). */
	ensureAlias(projectId: string, fsPath: string): ManagedWorkspace {
		const normalized = normalizePath(fsPath);
		const existingByPath = this.aliasIndex.get(normalized);
		if (existingByPath) {
			const ws = this.byProject.get(projectId) ?? [...this.byProject.values()].find((w) => w.workspaceId === existingByPath);
			if (ws) {
				ws.lastSeenAt = Date.now();
				if (!ws.pathAliases.includes(fsPath)) ws.pathAliases.push(fsPath);
				return ws;
			}
		}
		return this.registerWorkspace(projectId, fsPath, false);
	}

	getByPath(fsPath: string): ManagedWorkspace | undefined {
		const id = this.aliasIndex.get(normalizePath(fsPath));
		return id ? [...this.byProject.values()].find((w) => w.workspaceId === id) : undefined;
	}

	hasAlias(projectId: string, fsPathA: string, fsPathB: string): boolean {
		const a = this.ensureAlias(projectId, fsPathA);
		const b = this.ensureAlias(projectId, fsPathB);
		return a.workspaceId === b.workspaceId;
	}

	list(): ManagedWorkspace[] {
		return [...this.byProject.values()];
	}
}
