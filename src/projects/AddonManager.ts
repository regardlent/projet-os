/**
 * AddonManager — workspace-scoped Antigravity customization manager (Phase 13).
 * Stages Project OS-owned addon profiles under `.agents/`, keeps
 * `.project-os/addons.lock.json`. No global mutation. No remote execution.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CORE_PROFILE, profileForType, listAddonProfiles } from "./AddonCatalog.js";
import type { AddonLockEntry, AddonProfile } from "./addonTypes.js";

function sha256(s: string): string {
	return crypto.createHash("sha256").update(s).digest("hex");
}

export interface AddonActionResult {
	ok: boolean;
	message: string;
}

export class AddonManager {
	private readonly lockPath: string;
	private readonly agentsDir: string;
	private readonly backupsDir: string;

	constructor(projectRoot: string) {
		this.lockPath = path.join(projectRoot, ".project-os", "addons.lock.json");
		this.agentsDir = path.join(projectRoot, ".agents");
		this.backupsDir = path.join(projectRoot, ".project-os", "addon-backups");
	}

	private loadLock(): AddonLockEntry[] {
		try {
			const raw = JSON.parse(fs.readFileSync(this.lockPath, "utf8")) as { addons?: AddonLockEntry[] };
			return Array.isArray(raw.addons) ? raw.addons : [];
		} catch {
			return [];
		}
	}

	private saveLock(entries: AddonLockEntry[]): void {
		fs.mkdirSync(path.dirname(this.lockPath), { recursive: true });
		fs.writeFileSync(this.lockPath, JSON.stringify({ addons: entries }, null, 2), "utf8");
	}

	list(): AddonLockEntry[] {
		return this.loadLock();
	}

	get(id: string): AddonLockEntry | undefined {
		return this.loadLock().find((e) => e.addonId === id);
	}

	catalog(): AddonProfile[] {
		return listAddonProfiles();
	}

	profile(id: string): AddonProfile | undefined {
		return listAddonProfiles().find((p) => p.id === id);
	}

	install(profileId: string): AddonLockEntry | { error: string } {
		const prof = this.profile(profileId);
		if (!prof) return { error: "UNKNOWN_ADDON" };
		if (prof.security.remoteCode || prof.security.scripts || prof.security.network) {
			return { error: "ADDON_SECURITY_BLOCKED" };
		}
		const lock = this.loadLock();
		const existing = lock.find((e) => e.addonId === profileId);
		if (existing) {
			existing.enabled = true;
			existing.status = "ENABLED";
			this.saveLock(lock);
			return existing;
		}
		const missing = (prof.requires ?? []).filter((r) => !lock.some((e) => e.addonId === r));
		if (missing.length) return { error: `DEPENDENCY_MISSING:${missing.join(",")}` };

		for (const f of prof.files) {
			const dest = path.join(this.agentsDir, f.path);
			fs.mkdirSync(path.dirname(dest), { recursive: true });
			fs.writeFileSync(dest, f.content, "utf8");
		}
		const entry: AddonLockEntry = {
			addonId: prof.id,
			name: prof.name,
			types: prof.types,
			scope: "workspace",
			source: "project-os",
			version: prof.version,
			revision: prof.revision,
			sha256: sha256(prof.files.map((f) => f.path + f.content).join("|")),
			installedAt: Date.now(),
			enabled: true,
			requiredBy: prof.requires ?? [],
			security: prof.security,
			status: "ENABLED",
		};
		lock.push(entry);
		this.saveLock(lock);
		return entry;
	}

	disable(id: string): AddonActionResult {
		const lock = this.loadLock();
		const e = lock.find((x) => x.addonId === id);
		if (!e) return { ok: false, message: "ADDON_NOT_INSTALLED" };
		e.enabled = false;
		e.status = "DISABLED";
		this.saveLock(lock);
		return { ok: true, message: "disabled (files retained)" };
	}

	enable(id: string): AddonActionResult {
		const lock = this.loadLock();
		const e = lock.find((x) => x.addonId === id);
		if (!e) return { ok: false, message: "ADDON_NOT_INSTALLED" };
		e.enabled = true;
		e.status = "ENABLED";
		this.saveLock(lock);
		return { ok: true, message: "enabled" };
	}

	uninstall(id: string): AddonActionResult {
		const lock = this.loadLock();
		const e = lock.find((x) => x.addonId === id);
		if (!e) return { ok: false, message: "ADDON_NOT_INSTALLED" };
		const blocked = lock.find((x) => x.addonId !== id && (x.requiredBy ?? []).includes(id) && x.enabled);
		if (blocked) return { ok: false, message: `ADDON_REQUIRED_BY:${blocked.addonId}` };
		const prof = this.profile(id);
		if (prof) {
			const backupDir = path.join(this.backupsDir, String(Date.now()), id);
			for (const f of prof.files) {
				const src = path.join(this.agentsDir, f.path);
				if (fs.existsSync(src)) {
					const dest = path.join(backupDir, f.path);
					fs.mkdirSync(path.dirname(dest), { recursive: true });
					fs.renameSync(src, dest);
				}
			}
		}
		const idx = lock.findIndex((x) => x.addonId === id);
		lock.splice(idx, 1);
		this.saveLock(lock);
		return { ok: true, message: "uninstalled (files backed up to .project-os/addon-backups)" };
	}

	health(): AddonLockEntry[] {
		return this.loadLock().map((e) => ({ ...e, status: e.enabled ? "ENABLED" : "DISABLED" }));
	}

	/** Detect conflicts (duplicate slash commands / MCP ids / agent names) among ENABLED addons. */
	conflicts(): string[] {
		const enabled = this.loadLock().filter((e) => e.enabled);
		const seen: Record<string, string> = {};
		const conflicts: string[] = [];
		for (const e of enabled) {
			const prof = this.profile(e.addonId);
			if (!prof) continue;
			for (const c of prof.commands ?? []) {
				if (seen[c]) conflicts.push(`command ${c} shared by ${seen[c]} and ${e.addonId}`);
				else seen[c] = e.addonId;
			}
			for (const m of prof.mcpServers ?? []) {
				if (seen[m]) conflicts.push(`mcp ${m} shared by ${seen[m]} and ${e.addonId}`);
				else seen[m] = e.addonId;
			}
			for (const a of prof.agents ?? []) {
				if (seen[a]) conflicts.push(`agent ${a} shared by ${seen[a]} and ${e.addonId}`);
				else seen[a] = e.addonId;
			}
		}
		return conflicts;
	}

	/**
	 * Production health verification (Phase 24, W12). Recomputes the sha256 of each installed
	 * addon's staged files from the catalog and compares with the lock entry. Any mismatch or
	 * missing staged file is reported as a health finding — never silently repaired.
	 */
	verifyLock(): { addonId: string; ok: boolean; issues: string[] }[] {
		const lock = this.loadLock();
		return lock.map((e) => {
			const prof = this.profile(e.addonId);
			const issues: string[] = [];
			if (!prof) {
				issues.push("UNKNOWN_ADDON_IN_LOCK");
				return { addonId: e.addonId, ok: false, issues };
			}
			const expectedSha = sha256(prof.files.map((f) => f.path + f.content).join("|"));
			if (e.sha256 !== expectedSha) issues.push("SHA_MISMATCH");
			for (const f of prof.files) {
				const staged = path.join(this.agentsDir, f.path);
				if (!fs.existsSync(staged)) issues.push(`MISSING_FILE:${f.path}`);
			}
			return { addonId: e.addonId, ok: issues.length === 0, issues };
		});
	}

	/** Default profiles by project type (core + stack). */
	static defaultSet(projectType: string): string[] {
		const stack = projectType !== "auto" && projectType !== "empty" ? profileForType(projectType).id : "";
		return ["project-os-core", stack].filter(Boolean);
	}
}

export { CORE_PROFILE };

