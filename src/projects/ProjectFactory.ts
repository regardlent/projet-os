/**
 * ProjectFactory — transactional creation of managed child projects (Phase 13).
 * Isolated from vscode; storage paths injected. Unit-testable under node.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { slugify, resolveChildPath } from "./slug.js";
import { GoalService, makeGoal } from "./GoalService.js";
import { AddonManager } from "./AddonManager.js";
import type { ManagedProjectRegistry } from "./ManagedProjectRegistry.js";
import type { ManagedProjectManifest, ProjectCreateInput, ProjectCreateResult, ProjectType } from "./projectTypes.js";
import { SCHEMA_VERSION, MANAGED_BY } from "./projectTypes.js";

export interface ProjectFactoryOptions {
	projectsRoot: string;
	controlPlaneRoot: string;
}

/** Normalize a `--type=` value against the known set; unknown/auto => "auto". */
export function resolveProjectType(raw: string | undefined): ProjectType {
	const t = (raw ?? "auto").toLowerCase();
	switch (t) {
		case "node":
		case "typescript":
		case "python":
		case "cpp":
		case "rust":
		case "go":
		case "web":
		case "desktop":
		case "docker":
		case "localai":
		case "empty":
			return t;
		default:
			return "auto";
	}
}

export class ProjectFactory {
	constructor(
		private readonly opts: ProjectFactoryOptions,
		private readonly registry: ManagedProjectRegistry,
	) {}

	async createProject(input: ProjectCreateInput): Promise<ProjectCreateResult> {
		const slug = slugify(input.name);
		if (!slug) return { ok: false, status: "BROKEN", message: "INVALID_NAME", warnings: [] };

		const root = resolveChildPath(this.opts.projectsRoot, slug);
		if (!root) return { ok: false, status: "BLOCKED", message: "PATH_TRAVERSAL_BLOCKED", warnings: [] };
		if (fs.existsSync(root)) return { ok: false, status: "BLOCKED", message: "PROJECT_ALREADY_EXISTS", warnings: [] };
		if (this.registry.has(slug)) return { ok: false, status: "BLOCKED", message: "PROJECT_ALREADY_EXISTS", warnings: [] };

		const projectId = crypto.randomUUID();
		const now = Date.now();
		const type = resolveProjectType(input.type);
		const dotProjectOs = path.join(root, ".project-os");

		// Base structure (v1). Never write secrets — only placeholders.
		fs.mkdirSync(dotProjectOs, { recursive: true });
		fs.mkdirSync(path.join(root, ".agents", "rules"), { recursive: true });
		fs.mkdirSync(path.join(root, "docs"), { recursive: true });
		fs.mkdirSync(path.join(root, "src"), { recursive: true });
		fs.mkdirSync(path.join(root, "tests"), { recursive: true });
		fs.writeFileSync(path.join(root, "README.md"), `# ${input.name}\n\nManaged by ${MANAGED_BY}.\n`, "utf8");
		fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\ndist/\nbuild/\n.env\n*.log\n", "utf8");
		fs.writeFileSync(path.join(root, ".env.example"), "# Placeholders only — no real secrets.\n", "utf8");

		// Goal (optional at create).
		let goal: ManagedProjectManifest["goal"] = null;
		const objective = input.objective ?? input.goal;
		if (objective) {
			const goalService = new GoalService(root);
			goal = makeGoal({ projectId, objective });
			goalService.save(goal);
			goalService.appendHistory(goal);
		}

		// Workspace-scoped addons (core + stack profile) staged under .agents/.
		const addonMan = new AddonManager(root);
		const defaultAddons = AddonManager.defaultSet(type);
		for (const id of defaultAddons) addonMan.install(id);

		const manifest: ManagedProjectManifest = {
			schemaVersion: SCHEMA_VERSION,
			projectId,
			slug,
			name: input.name,
			createdAt: now,
			updatedAt: now,
			managedBy: MANAGED_BY,
			controlPlaneRoot: this.opts.controlPlaneRoot,
			workspaceRoot: root,
			projectType: type,
			status: "READY",
			goal,
			git: { initialized: false },
			addons: defaultAddons,
			modelProfile: {},
		};

		fs.writeFileSync(path.join(dotProjectOs, "project.json"), JSON.stringify(manifest, null, 2), "utf8");
		if (goal) fs.writeFileSync(path.join(dotProjectOs, "goal.json"), JSON.stringify(goal, null, 2), "utf8");

		// Git (default on; failure is non-fatal).
		if (input.git !== false) {
			try {
				execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
				manifest.git.initialized = true;
			} catch {
				manifest.git.initialized = false;
			}
		}
		fs.writeFileSync(path.join(dotProjectOs, "project.json"), JSON.stringify(manifest, null, 2), "utf8");

		// Transactional commit: only after the manifest is fully valid do we register it.
		// If registry persistence throws, roll back the created workspace so no partial
		// project is left behind (Phase 06 hardening: partial-creation rollback).
		try {
			this.registry.add(manifest);
		} catch (err) {
			try {
				fs.rmSync(root, { recursive: true, force: true });
			} catch {
				// best-effort cleanup
			}
			return { ok: false, status: "BROKEN", message: `ROLLBACK: registry add failed (${err instanceof Error ? err.message : String(err)})`, warnings: [] };
		}

		return {
			ok: true,
			projectId,
			slug,
			workspaceRoot: root,
			status: "READY",
			message: "Project created",
			warnings: manifest.git.initialized ? [] : ["git init failed/absent"],
		};
	}
}
