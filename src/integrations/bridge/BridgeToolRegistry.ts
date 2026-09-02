/**
 * BridgeToolRegistry — MCP tool definitions + schemas + dispatch.
 * Pure handlers (no vscode import). Read tools bounded; run tools from a
 * known-scripts allowlist; never accept arbitrary command strings.
 */
import { boundaryRead, isSecretPath } from "./WorkspaceBoundary.js";
import { toolClassOf } from "./ApprovalService.js";
import { runProcess } from "./ProcessRunner.js";
import { redactLog } from "./AuditLogger.js";
import type { IAntigravityAdapter } from "./AntigravityCliAdapter.js";

export type ToolResult = { content: { type: "text"; text: string }[] };

export interface ToolCallInput {
	toolName: string;
	args: Record<string, unknown>;
	workspaceRoot: string;
	readTimeoutMs: number;
	runTimeoutMs: number;
	antigravity: IAntigravityAdapter | null;
	allowedScripts: string[];
}

export type ToolHandler = (input: ToolCallInput) => Promise<ToolResult>;

export interface BridgeTool {
	name: string;
	description: string;
	required: string[];
	properties: Record<string, { type: string; description?: string }>;
	handler: ToolHandler;
	schema?: string;
}

export function validateArgs(args: Record<string, unknown>, tool: BridgeTool): string[] {
	const errors: string[] = [];
	for (const req of tool.required) {
		if (args[req] === undefined || args[req] === null || args[req] === "") errors.push(`missing required: ${req}`);
	}
	for (const [key, val] of Object.entries(args)) {
		if (!(key in tool.properties)) errors.push(`unknown property: ${key}`);
		else {
			const prop = tool.properties[key];
			if (prop.type === "string" && typeof val !== "string") errors.push(`wrong type: ${key}`);
			if (prop.type === "integer" && (typeof val !== "number" || !Number.isInteger(val))) errors.push(`wrong type: ${key}`);
			if (typeof val === "string" && val.length > 4096) errors.push(`oversized: ${key}`);
		}
	}
	return errors;
}
async function gitRun(args: string[], cwd: string, timeoutMs: number): Promise<{ code: number | null; out: string; err: string }> {
	const pr = await runProcess({ executable: "git", args, cwd, timeoutMs, maxOutputBytes: 500_000 });
	return { code: pr.exitCode, out: redactLog(pr.output), err: redactLog(pr.stderr) };
}

const READ_HANDLERS: Record<string, ToolHandler> = {
	async bridge_health() {
		return { content: [{ type: "text", text: "{\"projectOS\":\"v0.1.0\",\"bridge\":\"v1\",\"mcp\":\"1.30.0\",\"transport\":\"streamable-http-loopback\"}" }] };
	},
	async project_status(input) {
		const r = await gitRun(["status", "--short", "--branch"], input.workspaceRoot, input.readTimeoutMs);
		return { content: [{ type: "text", text: JSON.stringify({ branch: (r.out.split("\n")[0] ?? "").replace("## ", ""), dirty: r.out.trim().length > 0, ok: r.code === 0 }) }] };
	},
	async project_tree(input) {
		const depth = typeof input.args.depth === "number" ? Math.max(1, Math.min(4, Math.floor(input.args.depth))) : 2;
		const maxEntries = typeof input.args.maxEntries === "number" ? Math.max(1, Math.min(200, Math.floor(input.args.maxEntries))) : 50;
		const rel = typeof input.args.path === "string" ? String(input.args.path) : ".";
		const b = boundaryRead(input.workspaceRoot, rel);
		if (!b.ok) return { content: [{ type: "text", text: JSON.stringify({ error: b.reason }) }] };
		const fs = await import("node:fs");
		const path = await import("node:path");
		const skip = new Set([".git", "node_modules", "dist", "build", ".project-os"]);
		let count = 0;
		const lines: string[] = [];
		const walk = (dir: string, level: number): void => {
			if (level > depth || count >= maxEntries) return;
			let entries: import("node:fs").Dirent[];
			try {
				entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, z) => (a.isDirectory() === z.isDirectory() ? a.name.localeCompare(z.name) : a.isDirectory() ? -1 : 1));
			} catch {
				return;
			}
			for (const e of entries) {
				if (count >= maxEntries) return;
				if (e.isDirectory() && skip.has(e.name)) continue;
				lines.push("  ".repeat(level) + (e.isDirectory() ? e.name + "/" : e.name));
				count++;
				if (e.isDirectory()) walk(path.join(dir, e.name), level + 1);
			}
		};
		walk(b.absolute, 0);
		return { content: [{ type: "text", text: lines.join("\n") }] };
	},
	async file_read(input) {
		const rel = String(input.args.path ?? "");
		if (isSecretPath(rel)) return { content: [{ type: "text", text: JSON.stringify({ error: "SECRET" }) }] };
		const b = boundaryRead(input.workspaceRoot, rel);
		if (!b.ok) return { content: [{ type: "text", text: JSON.stringify({ error: b.reason }) }] };
		const fs = await import("node:fs");
		try {
			const content = fs.readFileSync(b.absolute, "utf8").slice(0, 200_000);
			return { content: [{ type: "text", text: content }] };
		} catch (e) {
			return { content: [{ type: "text", text: JSON.stringify({ error: e instanceof Error ? e.message : "read failed" }) }] };
		}
	},
	async code_search(input) {
		const query = String(input.args.query ?? "");
		const fs = await import("node:fs");
		const path = await import("node:path");
		const skip = new Set(["node_modules", ".git", "dist", "build", ".project-os"]);
		const hits: string[] = [];
		let scanned = 0;
		const maxFiles = typeof input.args.maxResults === "number" ? Math.max(1, Math.min(100, Math.floor(input.args.maxResults))) : 25;
		let re: RegExp;
		try {
			re = new RegExp(query, "i");
		} catch {
			return { content: [{ type: "text", text: JSON.stringify({ error: "invalid regex" }) }] };
		}
		const walk = (dir: string): void => {
			if (scanned > 400) return;
			let entries: import("node:fs").Dirent[];
			try {
				entries = fs.readdirSync(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const e of entries) {
				if (scanned > 400) return;
				if (skip.has(e.name)) continue;
				const p = path.join(dir, e.name);
				if (e.isDirectory()) walk(p);
				else if (e.isFile()) {
					scanned++;
					try {
						const text = fs.readFileSync(p, "utf8").slice(0, 100_000);
						if (re.test(text)) {
							hits.push(path.relative(input.workspaceRoot, p).replaceAll("\\", "/"));
							if (hits.length >= maxFiles) return;
						}
					} catch {
						/* skip */
					}
				}
			}
		};
		walk(input.workspaceRoot);
		return { content: [{ type: "text", text: JSON.stringify({ count: hits.length, hits }) }] };
	},
	async git_status(input) {
		const r = await gitRun(["status", "--porcelain=v1", "--branch"], input.workspaceRoot, input.readTimeoutMs);
		return { content: [{ type: "text", text: r.out || "(clean)" }] };
	},
	async git_diff(input) {
		const r = await gitRun(["diff", "--color=never"], input.workspaceRoot, input.readTimeoutMs);
		return { content: [{ type: "text", text: redactLog(r.out).slice(0, 200_000) }] };
	},
	async artifact_verify(input) {
		const rel = String(input.args.id ?? "");
		if (!rel.startsWith("artifacts")) return { content: [{ type: "text", text: JSON.stringify({ error: "outside artifacts" }) }] };
		const b = boundaryRead(input.workspaceRoot, rel);
		if (!b.ok) return { content: [{ type: "text", text: JSON.stringify({ error: b.reason }) }] };
		const fs = await import("node:fs");
		const crypto = await import("node:crypto");
		try { const buf = fs.readFileSync(b.absolute); const sha = crypto.createHash("sha256").update(buf).digest("hex"); return { content: [{ type: "text", text: JSON.stringify({ id: b.absolute, size: buf.length, sha256: sha, ok: buf.length > 0 }) }] }; }
		catch (e) { return { content: [{ type: "text", text: JSON.stringify({ error: e instanceof Error ? e.message : "read failed" }) }] }; }
	},
	async artifact_search(input) {
		const q = String(input.args.query ?? "").toLowerCase();
		const max = typeof input.args.limit === "number" ? Math.max(1, Math.min(50, Math.floor(input.args.limit))) : 10;
		const fs = await import("node:fs");
		const path = await import("node:path");
		const root = path.join(input.workspaceRoot, "artifacts");
		const hits: { id: string; score: number; snippet: string }[] = [];
		let scanned = 0;
		const terms = q.split(/\s+/).filter(Boolean);
		const walk = (dir: string): void => {
			if (scanned > 500) return;
			let entries: import("node:fs").Dirent[];
			try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
			for (const e of entries) {
				if (scanned > 500) return;
				const full = path.join(dir, e.name);
				if (e.isDirectory()) walk(full);
				else if (/\.(json|md)$/i.test(e.name)) {
					scanned++;
					let content = ""; try { content = fs.readFileSync(full, "utf8"); } catch { continue; }
					const cc = content.toLowerCase(); let score = 0;
					for (const t of terms) { score += e.name.toLowerCase().includes(t) ? 3 : 0; const m = cc.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")); score += m ? m.length : 0; }
					if (terms.every((t) => e.name.toLowerCase().includes(t) || cc.includes(t))) {
						const idx = cc.indexOf(terms[0]); let snippet = "";
						if (idx >= 0) snippet = content.slice(Math.max(0, idx - 40), idx + 80).replace(/\s+/g, " ").trim();
						hits.push({ id: path.relative(input.workspaceRoot, full).replace(/\\/g, "/"), score, snippet });
					}
				}
			}
		};
		walk(root);
		hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
		return { content: [{ type: "text", text: JSON.stringify({ query: q, count: hits.length, items: hits.slice(0, max) }) }] };
	},
};

const RUN_HANDLERS: Record<string, ToolHandler> = {
	async tests_run(input) {
		const script = String(input.args.script ?? "");
		if (!input.allowedScripts.includes(script)) return { content: [{ type: "text", text: JSON.stringify({ error: "script not allowed" }) }] };
		const pr = await runProcess({ executable: "npm", args: ["run", script, "--if-present"], cwd: input.workspaceRoot, timeoutMs: input.runTimeoutMs, maxOutputBytes: 400_000 });
		return { content: [{ type: "text", text: JSON.stringify({ script, exitCode: pr.exitCode, out: redactLog(pr.output).slice(0, 200_000), err: redactLog(pr.stderr).slice(0, 20_000) }) }] };
	},
	async build_run(input) {
		const script = String(input.args.script ?? "");
		if (!input.allowedScripts.includes(script)) return { content: [{ type: "text", text: JSON.stringify({ error: "script not allowed" }) }] };
		const pr = await runProcess({ executable: "npm", args: ["run", script, "--if-present"], cwd: input.workspaceRoot, timeoutMs: input.runTimeoutMs, maxOutputBytes: 400_000 });
		return { content: [{ type: "text", text: JSON.stringify({ script, exitCode: pr.exitCode, out: redactLog(pr.output).slice(0, 200_000), err: redactLog(pr.stderr).slice(0, 20_000) }) }] };
	},
	async antigravity_run(input) {
		if (!input.antigravity) return { content: [{ type: "text", text: JSON.stringify({ error: "antigravity not available" }) }] };
		const prompt = String(input.args.prompt ?? "");
		const readOnly = input.args.readOnly !== false;
		const res = await input.antigravity.run({ prompt, cwd: input.workspaceRoot, readOnly, sandbox: input.args.sandbox === true, printTimeout: typeof input.args.printTimeout === "string" ? String(input.args.printTimeout) : "5m", timeoutMs: input.runTimeoutMs });
		return { content: [{ type: "text", text: JSON.stringify({ detected: res.detected, status: res.status, error: res.error ? redactLog(String(res.error)) : null, response: redactLog(res.response).slice(0, 100_000), softDeny: res.softDeny ?? false, elapsedMs: res.elapsedMs }) }] };
	},
};

export const BRIDGE_TOOLS: BridgeTool[] = [
	{ name: "bridge_health", description: "Bridge + Project-OS health (no secrets)", required: [], properties: {}, handler: READ_HANDLERS.bridge_health },
	{ name: "project_status", description: "Project root, branch, dirty state", required: [], properties: { path: { type: "string" } }, handler: READ_HANDLERS.project_status },
	{ name: "project_tree", description: "Bounded workspace tree", required: [], properties: { path: { type: "string" }, depth: { type: "integer" }, maxEntries: { type: "integer" } }, handler: READ_HANDLERS.project_tree },
	{ name: "file_read", description: "Read one file (bounded, secret-guarded)", required: ["path"], properties: { path: { type: "string" } }, handler: READ_HANDLERS.file_read },
	{ name: "code_search", description: "Regex search inside workspace (bounded)", required: ["query"], properties: { query: { type: "string" }, maxResults: { type: "integer" } }, handler: READ_HANDLERS.code_search },
	{ name: "git_status", description: "Read-only git status", required: [], properties: {}, handler: READ_HANDLERS.git_status },
	{ name: "git_diff", description: "Read-only git diff (redacted)", required: [], properties: {}, handler: READ_HANDLERS.git_diff },
	{ name: "artifact_verify", description: "Verify an artifact (size + sha256)", required: ["id"], properties: { id: { type: "string" } }, handler: READ_HANDLERS.artifact_verify },
	{ name: "artifact_search", description: "Full-text search over artifacts/", required: ["query"], properties: { query: { type: "string" }, limit: { type: "integer" } }, handler: READ_HANDLERS.artifact_search },
	{ name: "tests_run", description: "Run a known npm test script (approval)", required: ["script"], properties: { script: { type: "string" } }, handler: RUN_HANDLERS.tests_run },
	{ name: "build_run", description: "Run a known npm build script (approval)", required: ["script"], properties: { script: { type: "string" } }, handler: RUN_HANDLERS.build_run },
	{ name: "antigravity_run", description: "Run an Antigravity headless mission on the workspace (approval)", required: ["prompt"], properties: { prompt: { type: "string" }, readOnly: { type: "string" }, sandbox: { type: "string" }, printTimeout: { type: "string" } }, handler: RUN_HANDLERS.antigravity_run },
];

export function findTool(name: string): BridgeTool | undefined {
	return BRIDGE_TOOLS.find((t) => t.name === name);
}

export async function dispatchTool(input: ToolCallInput): Promise<{ ok: boolean; result?: ToolResult; error?: string; class_: string }> {
	const tool = findTool(input.toolName);
	if (!tool) return { ok: false, error: "unknown tool", class_: toolClassOf(input.toolName) };
	const errs = validateArgs(input.args, tool);
	if (errs.length) return { ok: false, error: errs.join("; "), class_: toolClassOf(input.toolName) };
	try {
		const result = await tool.handler(input);
		return { ok: true, result, class_: toolClassOf(input.toolName) };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : "tool error", class_: toolClassOf(input.toolName) };
	}
}