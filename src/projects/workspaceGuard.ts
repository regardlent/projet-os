/**
 * Workspace guard for the autonomy agent's read-only tools (Phase 13).
 * Pure path/read logic; never lets a tool escape the project workspace.
 */
import fs from "node:fs";
import path from "node:path";

/** Resolve a requested path strictly inside `root`; null if it would escape. */
export function guardPath(root: string, requested: string): string | null {
	const resolvedRoot = path.resolve(root);
	const target = path.resolve(resolvedRoot, requested);
	if (target === resolvedRoot) return null;
	const rel = path.relative(resolvedRoot, target);
	if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
	return target;
}

/** Read a set of text files, skipping any that escape the workspace. */
export function safeReadFiles(root: string, files: string[]): { path: string; content: string; skip: string[] } {
	const out: { path: string; content: string }[] = [];
	const skip: string[] = [];
	for (const f of files) {
		const p = guardPath(root, f);
		if (!p) {
			skip.push(f);
			continue;
		}
		try {
			const content = fs.readFileSync(p, "utf8").slice(0, 200_000);
			out.push({ path: f, content });
		} catch {
			skip.push(f);
		}
	}
	return { path: out.map((o) => o.path).join(","), content: out.map((o) => `--- ${o.path} ---\n${o.content}`).join("\n\n"), skip };
}

/** Regex search over files in the workspace, skipping ignored folders. */
export function safeSearch(root: string, pattern: string, maxFiles = 500): string[] {
	const skip = new Set(["node_modules", ".git", "dist", "build", ".project-os", ".agents"]);
	const hits: string[] = [];
	let re: RegExp;
	try {
		re = new RegExp(pattern, "i");
	} catch {
		return [];
	}
	let scanned = 0;
	const walk = (dir: string): void => {
		if (scanned > maxFiles) return;
		let entries: import("node:fs").Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true }) as import("node:fs").Dirent[];
		} catch {
			return;
		}
		for (const e of entries) {
			if (scanned > maxFiles) return;
			if (skip.has(e.name)) continue;
			const p = path.join(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.isFile()) {
				scanned++;
				try {
					const text = fs.readFileSync(p, "utf8").slice(0, 100_000);
					if (re.test(text)) hits.push(path.relative(root, p).replace(/\\/g, "/"));
				} catch {
					// unreadable
				}
			}
		}
	};
	walk(root);
	return hits.slice(0, 40);
}
