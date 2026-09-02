#!/usr/bin/env node
// release-gh.mjs — publie la release GitHub v1.0 via l'API REST (nécessite GITHUB_TOKEN).
// Usage: GITHUB_TOKEN=<token> node scripts/release-gh.mjs [tag]
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");
const tag = process.argv[2] || "v1.0";
const owner = "regardlent";
const name = "projet-os";
const token = process.env.GITHUB_TOKEN;
if (!token) { console.error("GITHUB_TOKEN requis. Obtenez un PAT (repo) et relancez."); process.exit(1); }

const notes = readFileSync(path.join(repo, "docs", "RELEASE_NOTES_v1.0.md"), "utf8");

// 1. Crée la release (target = tag), pré-release=false.
const api = `https://api.github.com/repos/${owner}/${name}/releases`;
const payload = JSON.stringify({ tag_name: tag, target_commitish: "main", name: tag, body: notes, draft: false, prerelease: false });
const create = spawnSync("curl", [
	"-sS", "-X", "POST", api, "-H", `Authorization: Bearer ${token}`, "-H", "Accept: application/vnd.github+json",
	"-H", "Content-Type: application/json", "-d", payload,
], { encoding: "utf8" });
let relId = null;
try { const j = JSON.parse(create.stdout); relId = j.id; if (!relId) throw new Error(j.message || "no id"); } catch (e) { console.error("create failed:", create.stdout || e.message); process.exit(1); }
console.log(`release created id=${relId}`);

// 2. Upload l'asset (zip CPack) si présent.
const zip = path.join(repo, "cli-cpp", `project-os-cli-0.1.0-v3.zip`);
if (require("node:fs").existsSync(zip)) {
	const up = spawnSync("curl", [
		"-sS", "-X", "POST", `${api}/${relId}/assets?name=${path.basename(zip)}`,
		"-H", `Authorization: Bearer ${token}`, "-H", "Content-Type: application/zip", "--data-binary", `@${zip}`,
	], { encoding: "utf8" });
	console.log("asset upload:", up.stdout || up.stderr || "ok");
} else console.log(`(aucune archive ${path.basename(zip)} — produisez-la via CPack)`);
console.log(`terminé. https://github.com/${owner}/${name}/releases/tag/${tag}`);
