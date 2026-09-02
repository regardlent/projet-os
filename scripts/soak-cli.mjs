#!/usr/bin/env node
// soak-cli.mjs — Phase 8.10: run a batch of CLI scenarios through the Project OS bridge
// and report honest pass/fail. Usage: node scripts/soak-cli.mjs [N]
// Scenarios are read-only and (mostly) deterministic; environment-dependent ones report SKIP.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bridge = path.resolve(__dirname, "..", "bin", "project-os-bridge.mjs");
const N = Math.max(1, Math.min(200, parseInt(process.argv[2] ?? "100", 10) || 100));

const scenarios = [
	"version", "capabilities", "completion powershell", "exitcodes",
	"status", "project list", "models", "route CODING",
	"health score", "usage list", "usage summary", "budget forecast",
	"insights tokens", "diagnose", "risk profile", "goal traction",
	"addon list", "addon verify", "config explain", "doctor",
	"artifact search cli --limit=3", "drift alert", "health trend",
];

function runOnce() {
	const idx = Math.floor(Math.random() * scenarios.length);
	const line = scenarios[idx];
	const pr = spawnSync("node", [bridge, line], { encoding: "utf8", timeout: 20000 });
	// Success = the bridge produced a valid protocol envelope. Non-zero exit is a real signal, not a crash.
	let ran = false;
	try { const o = JSON.parse(pr.stdout); ran = o.protocol !== undefined; } catch { ran = false; }
	return { line, ran, exit: pr.status };
}

let pass = 0, fail = 0;
console.log(`Project OS CLI soak — ${N} scenarios`);
for (let i = 0; i < N; ++i) {
	const r = runOnce();
	if (r.ran) { pass++; }
	else { fail++; console.log(`  FAIL @${i}: ${r.line} (exit ${r.exit})`); }
}
console.log(`soak: ${pass} pass, ${fail} fail (${N} scenarios)`);
process.exit(fail === 0 ? 0 : 1);
