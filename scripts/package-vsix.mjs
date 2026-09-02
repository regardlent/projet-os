#!/usr/bin/env node
// package-vsix.mjs — Phase 4.8: package the VS Code extension as a .vsix via @vscode/vsce.
// Honest: if vsce is unavailable it reports the install command instead of faking success.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");

const probe = spawnSync("npx", ["--no-install", "@vscode/vsce", "--version"], { cwd: repo, encoding: "utf8" });
if (probe.status !== 0) {
	console.log("vsce not installed. Run: npm i -D @vscode/vsce, then: npx @vscode/vsce package");
	process.exit(1);
}
const r = spawnSync("npx", ["@vscode/vsce", "package", "--no-dependencies"], { cwd: repo, encoding: "utf8" });
console.log(r.stdout || "");
console.log(r.stderr || "");
process.exit(r.status ?? 1);
