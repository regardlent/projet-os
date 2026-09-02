/**
 * ManagedProjectRegistry — hub-side registry of managed projects (Phase 13).
 * Persists to a single JSON file (path injected) and is unit-testable.
 */
import fs from "node:fs";
import path from "node:path";
import type { ManagedProjectManifest } from "./projectTypes.js";

export class ManagedProjectRegistry {
	private projects: ManagedProjectManifest[] = [];

	constructor(private readonly filePath: string) {
		this.load();
	}

	private load(): void {
		try {
			const raw = fs.readFileSync(this.filePath, "utf8");
			const parsed = JSON.parse(raw) as { projects?: ManagedProjectManifest[] };
			this.projects = Array.isArray(parsed.projects) ? parsed.projects : [];
		} catch {
			this.projects = [];
		}
	}

	save(): void {
		fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
		fs.writeFileSync(this.filePath, JSON.stringify({ projects: this.projects }, null, 2), "utf8");
	}

	list(): ManagedProjectManifest[] {
		return this.projects.slice();
	}

	get(slugOrId: string): ManagedProjectManifest | undefined {
		return this.projects.find((p) => p.slug === slugOrId || p.projectId === slugOrId);
	}

	has(slug: string): boolean {
		return this.projects.some((p) => p.slug === slug);
	}

	add(manifest: ManagedProjectManifest): void {
		const existing = this.projects.findIndex((p) => p.projectId === manifest.projectId);
		if (existing >= 0) {
			this.projects[existing] = manifest;
		} else {
			this.projects.push(manifest);
		}
		this.save();
	}

	update(slug: string, patch: Partial<ManagedProjectManifest>): ManagedProjectManifest | undefined {
		const idx = this.projects.findIndex((p) => p.slug === slug);
		if (idx < 0) return undefined;
		this.projects[idx] = { ...this.projects[idx], ...patch, slug: this.projects[idx].slug, projectId: this.projects[idx].projectId };
		this.save();
		return this.projects[idx];
	}

	/** Remove a managed project by slug or id (registry only; does not delete files). */
	remove(slugOrId: string): boolean {
		const before = this.projects.length;
		this.projects = this.projects.filter((p) => p.slug !== slugOrId && p.projectId !== slugOrId);
		if (this.projects.length !== before) {
			this.save();
			return true;
		}
		return false;
	}
}
