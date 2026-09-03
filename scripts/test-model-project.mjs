#!/usr/bin/env node
// test-model-project.mjs — integration proof (deterministic): the CLI assembles a complete
// project from an --impl header, compiles it, and runs it — WITHOUT LocalAI.
// Asserts the bridge returns PROJECT_COMPILED. Exits 0 on PASS, 1 on FAIL.
import { spawnSync } from "node:child_process";
import { writeFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");

// Use the textkit workspace (created during the real test) if present; else skip honestly.
const ws = "C:\\Users\\eiden\\Desktop\\dev\\projects\\textkit";
if (!existsSync(path.join(ws, ".project-os"))) {
	console.log("SKIP: textkit workspace not present (run: create textkit --type=cpp)");
	process.exit(0);
}

// Clear any stale generated project so the proof is reproducible on re-run.
rmSync(path.join(ws, "work", "fixture"), { recursive: true, force: true });

// Fixture header with a run() that returns a nonzero status.
const fixture = `#pragma once\n#include <cstdio>\ninline int run(){ std::printf("run() executed\\n"); return 37; }\n`;
const fixturePath = path.join(ws, "src", "fixture_impl.hpp");
writeFileSync(fixturePath, fixture, "utf8");

const env = { ...process.env, PROJECT_OS_REPO: repo, PROJECT_OS_REGISTRY: path.join("C:\\Users\\eiden\\Desktop\\dev\\projects", ".hub-managed.json"), PROJECT_OS_ACTIVE_SLUG: "textkit" };
const line = "model project fixture --impl=src/fixture_impl.hpp (fixture)";
const r = spawnSync("node", [path.join(repo, "bin", "project-os-bridge.mjs"), line], { encoding: "utf8", env, timeout: 120000 });
const out = (r.stdout || "").trim();
let envp = null; try { const nl = out.split("\n").find((l) => l.includes("\"protocol\"")); envp = nl ? JSON.parse(nl) : null; } catch {}
const ok = !!(envp && envp.ok && envp.status === "PROJECT_COMPILED");
console.log(`model project --impl: ${ok ? "PASS" : "FAIL"} ${envp ? `status=${envp.status} runExit=${envp.result?.runExit ?? envp.runExit ?? "-"}` : r.stderr || out}`);
process.exit(ok ? 0 : 1);
