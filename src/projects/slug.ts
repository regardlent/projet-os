/**
 * Slug normalization + child-workspace path guard (Phase 13).
 * Pure, no I/O — unit-testable under node.
 */
import path from "node:path";

/** Produce a safe filesystem slug from an arbitrary project name. */
export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9-_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[-_]+|[-_]+$/g, "");
}

/** A slug that may be used as a single path segment. */
export function isSafeSlug(slug: string): boolean {
	return /^[a-z0-9][a-z0-9-_]*$/.test(slug);
}

const RESERVED_NAMES = new Set([
	"con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
	"lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

/**
 * Resolve a child workspace path strictly inside `projectsRoot`.
 * Returns the absolute child path, or `null` when the slug/path would escape
 * the root (traversal, absolute/drive injection, reserved device name).
 */
export function resolveChildPath(projectsRoot: string, slug: string): string | null {
	if (!isSafeSlug(slug)) return null;
	if (RESERVED_NAMES.has(slug)) return null;
	const root = path.resolve(projectsRoot);
	const target = path.resolve(root, slug);
	if (target === root) return null;
	const rel = path.relative(root, target);
	if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
	return target;
}
