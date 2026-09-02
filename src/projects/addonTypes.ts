/**
 * Antigravity addon contracts (Phase 13). Pure types; no I/O.
 */
export type AddonType = "PLUGIN" | "SKILL" | "RULE" | "WORKFLOW" | "SUBAGENT" | "MCP" | "HOOK";
export type AddonScope = "workspace";
export type AddonStatus = "INSTALLED" | "ENABLED" | "DISABLED" | "BROKEN" | "QUARANTINED" | "REMOVED";

/** A file staged under a project's `.agents/` tree on install. */
export interface AddonBundleFile {
	/** Path relative to `.agents/` (e.g. `rules/project-scope.md`). */
	path: string;
	content: string;
}

/** A Project OS-owned addon bundle (deterministic; no remote fetch, no execution). */
export interface AddonProfile {
	id: string;
	name: string;
	description: string;
	types: AddonType[];
	version: string;
	revision: string;
	/** Other addon ids this profile depends on / requires. */
	requires?: string[];
	/** Files to materialize under `.agents/`; secrets never present. */
	files: AddonBundleFile[];
	security: { remoteCode: boolean; scripts: boolean; network: boolean };
	/** Slash commands / MCP ids this profile exposes (for conflict detection). */
	commands: string[];
	mcpServers: string[];
	agents: string[];
}

/** One entry recorded in `.project-os/addons.lock.json`. */
export interface AddonLockEntry {
	addonId: string;
	name: string;
	types: AddonType[];
	scope: AddonScope;
	source: string;
	version: string;
	revision: string;
	sha256: string;
	installedAt: number;
	enabled: boolean;
	requiredBy: string[];
	security: { remoteCode: boolean; scripts: boolean; network: boolean };
	status: AddonStatus;
}
