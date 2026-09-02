/**
 * WorkspaceBoundary — Windows path security for MCP bridge tools.
 * Reuses Project-OS guards (guardPath / guardWritePath / isSecretFile /
 * PROTECTED_DIRS) instead of duplicating them. Adds Windows-specific hardening
 * (realpath check against symlink/junction escape, device paths, null bytes,
 * drives/UNC, encoded traversal) on top.
 */
import path from "node:path";
import fs from "node:fs";
import { guardWritePath, isSecretFile, PROTECTED_DIRS, type WriteOperation } from "../../projects/AutonomyWriteScope.js";

export type BoundaryVerdict =
	| { ok: true; absolute: string }
	| { ok: false; reason: "OUTSIDE" | "TRAVERSAL" | "DEVICE" | "NULL_BYTE" | "SYMLINK_ESCAPE" | "NOT_FOUND" | "UNSUPPORTED_DRIVE" };

const DEVICE_RE = /^\\\\(\.|\\\?)\\/i;
// Shell/restricted metacharacters: fail-closed (paths must be plain relative paths).
// Backslash is allowed (Windows separators); reserved Windows chars are blocked.
const META_RE = /[;&|<>"$`*?]/;

/** Reject raw hostile path fragments before any resolution. Returns true = blocked. */
export function hasHostilePathFragment(requested: string): boolean {
	if (requested.includes("\0")) return true;
	if (DEVICE_RE.test(requested)) return true;
	if (/%2e%2e/i.test(requested)) return true;
	if (META_RE.test(requested)) return true;
	if (requested.endsWith("..") || requested.includes("/../") || requested.includes("\\..\\") || requested.includes("/..\\") || requested.includes("\\../")) return true;
	return false;
}

/**
 * Resolve + realpath-verify that the final target remains inside the real root.
 * READ boundary: returns absolute path if safe, else a reason (fail-closed).
 */
export function boundaryRead(root: string, requested: string): BoundaryVerdict {
	// Normalize the Windows long-path volume prefix (\\?\C:\...) that path APIs
	// may produce; it is not itself a hostile device path.
	let req = requested;
	if (req.startsWith("\\\\?\\")) req = req.slice(4);
	if (typeof req !== "string" || req.length === 0 || req.length > 4096) return { ok: false, reason: "NOT_FOUND" };
	if (req.startsWith("\\\\") && !/^[a-z]:[\\/]/i.test(req)) return { ok: false, reason: "DEVICE" };
	if (hasHostilePathFragment(req)) return { ok: false, reason: "TRAVERSAL" };

	const rootAbs = path.resolve(root);
	try {
		fs.realpathSync(rootAbs);
	} catch {
		return { ok: false, reason: "NOT_FOUND" };
	}
	// Absolute requested path: enforce same drive + containment.
	let target: string;
	if (path.isAbsolute(req)) {
		const reqDrive = path.parse(req).root.toLowerCase();
		const rootDrive = path.parse(rootAbs).root.toLowerCase();
		if (reqDrive !== rootDrive) return { ok: false, reason: "UNSUPPORTED_DRIVE" };
		target = req;
	} else {
		target = path.resolve(rootAbs, req);
	}
	const rel = path.relative(rootAbs, target);
	if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return { ok: false, reason: "OUTSIDE" };

	try {
		const real = fs.realpathSync(target);
		const realRoot = fs.realpathSync(rootAbs);
		const relReal = path.relative(realRoot, real);
		if (relReal.startsWith("..") || path.isAbsolute(relReal)) return { ok: false, reason: "SYMLINK_ESCAPE" };
		return { ok: true, absolute: real };
	} catch {
		// Target may not exist yet (write). Fall back to lexical containment only.
		return { ok: true, absolute: target };
	}
}

/**
 * WRITE boundary: reuses the Project-OS write guard (guardWritePath) which
 * already enforces workspace containment + protected dirs + secret files +
 * allowed operations. No parallel write path is created.
 */
export type WriteBoundaryInput = {
	root: string;
	requested: string;
	op: WriteOperation;
	allowedOps: WriteOperation[];
};

export type WriteBoundaryVerdict =
	| { ok: true; absolute: string }
	| { ok: false; reason: "OUTSIDE" | "PROTECTED" | "SECRET" | "NOT_ALLOWED" | "TRAVERSAL" };

export function boundaryWrite(input: WriteBoundaryInput): WriteBoundaryVerdict {
	if (hasHostilePathFragment(input.requested)) return { ok: false, reason: "TRAVERSAL" };
	const g = guardWritePath(input.root, input.requested, input.allowedOps, input.op);
	if (!g.ok) return g;
	return { ok: true, absolute: g.absolute };
}

/** True if the basename looks like a secret env/config file (reuses existing guard). */
export function isSecretPath(p: string): boolean {
	return isSecretFile(path.basename(p));
}

/** List of top-level protected directories (reused constant). */
export const BRIDGE_PROTECTED_DIRS: readonly string[] = [...PROTECTED_DIRS];