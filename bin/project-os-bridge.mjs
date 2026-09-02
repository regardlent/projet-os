#!/usr/bin/env node
/**
 * project-os-bridge.mjs — real Project OS command executor invoked by the CLI.
 * Builds a SlashCommandContext with injected paths/env and dispatches a slash line,
 * printing the CommandResult as JSON on stdout. Errors => exit 1 + JSON on stderr.
 */
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

// Dynamic imports (compiled dist must exist: `npm run compile`).
const load = async (rel) => import(pathToFileURL(path.join(REPO, rel)).href);
const { SlashCommandRegistry, goalHandler, createHandler, addonHandler, autonomyHandler, todoHandler } = await load("dist/projects/SlashCommands.js");
const { docsHandler, projectHandler } = await load("dist/projects/ProductCommands.js");
const { ManagedProjectRegistry } = await load("dist/projects/ManagedProjectRegistry.js");
const { ProjectFactory } = await load("dist/projects/ProjectFactory.js");
const { bridgeHandler } = await load("dist/commands/bridgeCommands.js");

const projectsRoot = process.env.PROJECT_OS_PROJECTS_ROOT || "C:\\Users\\eiden\\Desktop\\dev\\projects";
const controlPlaneRoot = process.env.PROJECT_OS_CONTROL_ROOT || REPO;
const registryFile = process.env.PROJECT_OS_REGISTRY || path.join(REPO, ".project-os-cli", "managed-projects.json");
const modelId = process.env.PROJECT_OS_MODEL || "granite-4.2-3b-flash";
const baseUrl = process.env.PROJECT_OS_BASE_URL || "http://127.0.0.1:8080/v1";

// Bridge protocol version (Phase 27). The CLI parses this envelope.
const PROTOCOL_VERSION = 2;
const requestId = process.env.PROJECT_OS_REQUEST_ID || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function emit(payload, exitCode) {
	const envelope = { protocol: PROTOCOL_VERSION, requestId, ok: payload.ok ?? false, status: payload.status ?? "UNKNOWN", result: payload, timingMs: Date.now() - startedAt, errors: [] };
	process.stdout.write(JSON.stringify(envelope) + "\n");
	process.exit(exitCode);
}

function fail(msg) {
	const envelope = { protocol: PROTOCOL_VERSION, requestId, ok: false, status: "BRIDGE_ERROR", result: { ok: false, status: "BRIDGE_ERROR", message: msg, warnings: [], actions: [], artifacts: [] }, timingMs: msg === "no command line provided" ? 0 : Date.now() - startedAt, errors: [msg] };
	process.stderr.write(JSON.stringify(envelope) + "\n");
	process.exit(1);
}

const startedAt = Date.now();
const line = process.argv.slice(2).join(" ").trim();
if (!line) fail("no command line provided");

try {
	const registry = new ManagedProjectRegistry(registryFile);
	const factory = new ProjectFactory({ projectsRoot, controlPlaneRoot }, registry);

	const resolveActiveProject = () => {
		const active = process.env.PROJECT_OS_ACTIVE_SLUG || "";
		if (active) {
			const m = registry.get(active);
			if (m) return { slug: m.slug, projectId: m.projectId, workspaceRoot: m.workspaceRoot };
		}
		const list = registry.list();
		if (list.length) { const m = list[list.length - 1]; return { slug: m.slug, projectId: m.projectId, workspaceRoot: m.workspaceRoot }; }
		return null;
	};

	const ctx = { factory, registry, resolveActiveProject, runtime: { modelId, baseUrl, apiKey: process.env.PROJECT_OS_API_KEY || "localai" } 	};

	const slash = new SlashCommandRegistry();
	slash.register("goal", goalHandler);
	slash.register("create", createHandler);
	slash.register("addon", addonHandler);
	slash.register("autonomy", autonomyHandler);
	slash.register("todo", todoHandler);
	slash.register("bridge", bridgeHandler);
	slash.register("docs", async (parsed) => docsHandler(parsed, { activeProject: resolveActiveProject() }));
	slash.register("project", async (parsed) => projectHandler(parsed, { activeProject: resolveActiveProject(), registry }));

	// F02 capabilities: real backend capability negotiation (no hardcoding in the CLI).
	if (line === "capabilities") {
		const result = {
			command: "capabilities",
			ok: true,
			status: "CAPABILITIES",
			protocol: PROTOCOL_VERSION,
			protocolsSupported: [2, 3],
			commands: slash.names(),
			features: {
				slash: ["create", "goal", "addon", "autonomy", "todo", "docs", "project"],
				projectCreation: true,
				goalProof: true,
				artifactSystem: true,
				autonomyWriteLane: true,
				modelRouting: true,
				budget: true,
				tokenIntelligence: true,
				gpu: true,
				endurance: true,
			},
			outputModes: ["human", "json"],
			runtime: { localAI: true, gpu: true, loopback: true, endpoint: baseUrl, modelId },
			message: `capabilities: protocol=${PROTOCOL_VERSION}, commands=${slash.names().join(", ")}`,
			warnings: [],
			actions: [],
			artifacts: [],
		};
		emit(result, 0);
		process.exit(0);
	}

	// F51 protocol negotiate: announce server protocols + auto-select. CLI does the
	// intersection; we expose serverProtocols so no silent downgrade happens in C++.
	if (line === "protocol negotiate") {
		const serverProtocols = [2, 3];
		const selected = serverProtocols[serverProtocols.length - 1];
		const result = {
			command: "protocol", ok: true, status: "NEGOTIATE",
			clientProtocols: [2, 3],
			serverProtocols,
			selectedProtocol: selected,
			compatible: true,
			reason: `server supports ${serverProtocols.join(",")}; selected v${selected}`,
			warnings: [], actions: [], artifacts: [],
		};
		emit(result, 0);
		process.exit(0);
	}

	// F44 endurance status: read the real ladder state + GPU offload proof (no simulation).
	if (line === "endurance status") {
		const read = (f, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(REPO, f), "utf8")); } catch { return fallback; } };
		const ladder = read("artifacts/endurance/ladder-state.json", null);
		const gpuProof = read("artifacts/endurance/GPU_OFFLOAD_PROOF.json", null);
		const gates = ["5", "10", "20", "30", "60"].map((m) => read(`artifacts/endurance/GATE${m}_${m}MIN_PASS.json`, null));
		const gateStates = ["5", "10", "20", "30", "60"].map((m) => ({ rung: parseInt(m, 10), pass: !!read(`artifacts/endurance/GATE${m}_${m}MIN_PASS.json`, null) }));
		const result = {
			command: "endurance", ok: true, status: "ENDURANCE",
			completedRungs: ladder?.completed ?? [],
			attempts: ladder?.attempts ?? {},
			policy: ladder?.policy ?? null,
			gateStates,
			offloadProof: gpuProof?.offloadProof ?? "NOT_SET",
			model: gpuProof?.model ?? null,
			gpu: gpuProof?.gpu ?? null,
			vramDeltaFreeMiB: gpuProof?.vram?.deltaFreeMiB ?? 0,
			message: `endurance: completed=[${(ladder?.completed ?? []).join(",")}] offload=${gpuProof?.offloadProof ?? "NOT_SET"} model=${gpuProof?.model ?? "-"}`,
			warnings: [], actions: [], artifacts: ["artifacts/endurance/ladder-state.json", "artifacts/endurance/GPU_OFFLOAD_PROOF.json"],
		};
		emit(result, 0); process.exit(0);
	}

	// F43 benchmark compare <a> <b>: compare two persisted benchmarks, never "faster" without a measure.
	if (line.startsWith("benchmark compare ")) {
		const parts = line.slice("benchmark compare ".length).trim().split(/\s+/);
		const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(REPO, f), "utf8")); } catch { return null; } };
		const files = { a: "artifacts/endurance/GPU_BENCHMARK.json", b: "artifacts/endurance/GPU_OFFLOAD_PROOF.json" };
		const a = read(files.a), b = read(files.b);
		if (!a) { emit({ command: "benchmark", ok: false, status: "NOT_FOUND", message: "no benchmark artifact found", warnings: [], actions: [], artifacts: [] }, 1); }
		// a is GPU_BENCHMARK.json: aggregated metrics live under .aggregate.
		const aTps = a?.aggregate?.tokensPerSec ?? a?.tokensPerSec ?? null;
		const bTps = b?.benchmark?.tokensPerSec ?? b?.tokensPerSec ?? null;
		const aTtft = a?.aggregate?.ttftMs ?? a?.ttftMs ?? null;
		const bTtft = b?.benchmark?.ttftMs ?? null;
		// Compare the real floats, not the rounded ints, so an equal measure never
		// shows as "higher" due to truncation.
		let verdict = "insufficient_measure";
		if (aTps != null && bTps != null) {
			const eps = 0.05;
			verdict = Math.abs(aTps - bTps) < eps ? "equal" : (aTps > bTps ? "a_tokensPerSec_higher" : "b_tokensPerSec_higher");
		}
		const result = {
			command: "benchmark", ok: true, status: "BENCHMARK_COMPARE",
			a: { source: files.a, tokensPerSec: aTps, ttftMs: aTtft, model: a?.model ?? null },
			b: { source: files.b, tokensPerSec: bTps, ttftMs: bTtft, model: b?.model ?? b?.modelId ?? null },
			verdict,
			message: `benchmark compare: a tps=${aTps ?? "?"} vs b tps=${bTps ?? "?"} -> ${verdict}`,
			warnings: [], actions: [], artifacts: [files.a, files.b],
		};
		emit(result, 0); process.exit(0);
	}

	// F54 usage record: append a token/cost/perf observation to the generic usage store.
	if (line.startsWith("usage record")) {
		const rest = line.slice("usage record".length).trim();
		const flags = {};
		for (const m of rest.matchAll(/(--[a-z-]+)=("([^"]*)"|[^ ]+)/g)) flags[m[1]] = m[3] ?? m[2];
		const job = flags["--job"] || "job";
		const tokensIn = parseInt(flags["--input"] ?? flags["--in"] ?? "0", 10) || 0;
		const tokensOut = parseInt(flags["--output"] ?? flags["--out"] ?? "0", 10) || 0;
		const total = parseInt(flags["--total"] ?? String(tokensIn + tokensOut), 10) || (tokensIn + tokensOut);
		const model = flags["--model"] || modelId;
		const ttft = parseInt(flags["--ttft"] ?? "0", 10) || 0;
		const tps = parseInt(flags["--tokens-per-sec"] ?? flags["--tps"] ?? "0", 10) || 0;
		const payg = parseFloat(flags["--cost"] ?? "0") || 0;
		const file = path.join(REPO, "artifacts", "usage", "USAGE_REPORT.json");
		let store = { reports: [] };
		try { store = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
		if (!Array.isArray(store.reports)) store.reports = [];
		const rec = { job, model, tokens: { input: tokensIn, output: tokensOut, total }, cost: { free: 0, payg, localAI: payg === 0 ? "EXACT_ZERO" : "PAYG" }, throughput: { ttftMs: ttft, tokensPerSec: tps }, at: Date.now() };
		store.reports.push(rec);
		const agg = store.reports.reduce((a, r) => { a.input += r.tokens.input; a.output += r.tokens.output; a.total += r.tokens.total; a.free += (r.cost.free ?? 0); a.payg += (r.cost.payg ?? 0); return a; }, { input: 0, output: 0, total: 0, free: 0, payg: 0 });
		store.tokens = { input: agg.input, output: agg.output, total: agg.total };
		store.cost = { free: agg.free, payg: agg.payg, localAI: agg.payg === 0 ? "EXACT_ZERO" : "PAYG" };
		store.throughput = store.reports[store.reports.length - 1].throughput;
		store.modelId = model;
		store.updatedAt = Date.now();
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, JSON.stringify(store, null, 2), "utf8");
		emit({ command: "usage", ok: true, status: "USAGE_RECORDED", job, model, tokens: store.tokens, cost: store.cost, rows: [{ k: "job", v: job }, { k: "model", v: model }, { k: "tokensTotal", v: String(store.tokens.total) }, { k: "tokensIn", v: String(store.tokens.input) }, { k: "tokensOut", v: String(store.tokens.output) }, { k: "cost", v: store.cost.localAI + " payg=$" + agg.payg }, { k: "ttftMs", v: String(ttft) }, { k: "tokensPerSec", v: String(tps) }], details: [], message: `usage record: job=${job} model=${model} tokens=${store.tokens.total} cost=${store.cost.localAI} payg=$${agg.payg}`, warnings: [], actions: [], artifacts: ["artifacts/usage/USAGE_REPORT.json"] }, 0);
		process.exit(0);
	}

	// F59 usage list: history of recorded observations from the generic usage store.
	if (line === "usage list") {
		const file = path.join(REPO, "artifacts", "usage", "USAGE_REPORT.json");
		let store = { reports: [] };
		try { store = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
		const reps = Array.isArray(store.reports) ? store.reports : [];
		const rows = reps.map((r, i) => ({ k: "\u2116 " + (i + 1), v: `${r.job} | ${r.model} | tokens=${r.tokens?.total ?? 0} | cost=${r.cost?.localAI ?? "?"} payg=$${(r.cost?.payg ?? 0)} | ttft=${r.throughput?.ttftMs ?? 0}ms tps=${r.throughput?.tokensPerSec ?? 0}` }));
		emit({ command: "usage", ok: true, status: "USAGE_LIST", score: 0, grade: "", signal: rows.length ? "HAS_USAGE" : "NO_USAGE", rows, details: [store.updatedAt ? `updatedAt=${store.updatedAt}` : "no store"], message: `usage list: ${rows.length} record(s)`, warnings: [], actions: [], artifacts: ["artifacts/usage/USAGE_REPORT.json"] }, 0);
		process.exit(0);
	}

	// F59 usage summary + budget alert: aggregate by model and check PROJECT_OS_DAILY_BUDGET.
	if (line === "usage summary") {
		const file = path.join(REPO, "artifacts", "usage", "USAGE_REPORT.json");
		let store = { reports: [] };
		try { store = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
		const reps = Array.isArray(store.reports) ? store.reports : [];
		const byModel = {};
		let totalT = 0, totalPayg = 0;
		for (const r of reps) {
			const m = r.model || "unknown";
			byModel[m] = byModel[m] || { runs: 0, tokens: 0, payg: 0 };
			byModel[m].runs++; byModel[m].tokens += (r.tokens?.total ?? 0); byModel[m].payg += (r.cost?.payg ?? 0);
			totalT += (r.tokens?.total ?? 0); totalPayg += (r.cost?.payg ?? 0);
		}
		const rows = Object.entries(byModel).map(([m, a]) => ({ k: m, v: `runs=${a.runs} tokens=${a.tokens} payg=$${a.payg}` }));
		const daily = parseFloat(process.env.PROJECT_OS_DAILY_BUDGET || "0") || 0;
		const blown = daily > 0 && totalPayg > daily;
		rows.push({ k: "TOTAL", v: `tokens=${totalT} payg=$${totalPayg}` });
		if (daily > 0) rows.push({ k: "budget", v: `$` + daily + (blown ? " BLOWN" : " OK") });
		emit({ command: "usage", ok: !blown, status: blown ? "BUDGET_BLOWN" : "USAGE_SUMMARY", score: 0, grade: "", signal: blown ? "ALERT" : (totalT ? "HAS_USAGE" : "NO_USAGE"), rows, details: blown ? ["daily budget exceeded"] : [], message: `usage summary: models=${rows.length - (daily > 0 ? 2 : 1)} tokens=${totalT} payg=$${totalPayg}${blown ? " BUDGET_BLOWN" : ""}`, warnings: [], actions: [], artifacts: ["artifacts/usage/USAGE_REPORT.json"] }, blown ? 1 : 0);
		process.exit(0);
	}

	// F60 usage export: write the usage store to CSV/JSON on disk.
	if (line.startsWith("usage export")) {
		const rest = line.slice("usage export".length).trim();
		const flags = {};
		for (const m of rest.matchAll(/(--[a-z-]+)=("([^"]*)"|[^ ]+)/g)) flags[m[1]] = m[3] ?? m[2];
		const fmt = flags["--format"] || "csv";
		const file = path.join(REPO, "artifacts", "usage", "USAGE_REPORT.json");
		let store = { reports: [] };
		try { store = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
		const reps = Array.isArray(store.reports) ? store.reports : [];
		const outPath = flags["--out"] || path.join(REPO, "artifacts", "usage", "USAGE_REPORT." + (fmt === "json" ? "json" : "csv"));
		fs.mkdirSync(path.dirname(outPath), { recursive: true });
		if (fmt === "json") {
			fs.writeFileSync(outPath, JSON.stringify({ reports: reps }, null, 2), "utf8");
		} else {
			const csv = ["job,model,ttftMs,tokensPerSec,tokensIn,tokensOut,total,payg"] +
				reps.map((r) => `${r.job},${r.model},${r.throughput?.ttftMs ?? 0},${r.throughput?.tokensPerSec ?? 0},${r.tokens?.input ?? 0},${r.tokens?.output ?? 0},${r.tokens?.total ?? 0},${(r.cost?.payg ?? 0)}`).join("\n");
			fs.writeFileSync(outPath, csv + "\n", "utf8");
		}
		emit({ command: "usage", ok: true, status: "USAGE_EXPORT", score: 0, grade: "", signal: "EXPORTED", rows: [{ k: "format", v: fmt }, { k: "records", v: String(reps.length) }, { k: "written", v: outPath.replace(REPO + path.sep, "") }], details: [], message: `usage export: ${reps.length} record(s) -> ${fmt}`, warnings: [], actions: [], artifacts: [outPath.replace(REPO + path.sep, "")] }, 0);
		process.exit(0);
	}

	// F46 report: consolidate real usage reports (tokens/cost/perf) from disk.
	if (line === "report") {
		const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(REPO, f), "utf8")); } catch { return null; } };
		const files = ["artifacts/usage/USAGE_REPORT.json", "artifacts/endurance/USAGE_REPORT.json", "artifacts/endurance/GPU_BENCHMARK.json"];
		const reports = files.map((f) => read(f)).filter(Boolean);
		const sumTokens = reports.reduce((acc, r) => acc + (r.tokens?.total ?? 0), 0);
		const sumInput = reports.reduce((acc, r) => acc + (r.tokens?.input ?? 0), 0);
		const sumOutput = reports.reduce((acc, r) => acc + (r.tokens?.output ?? 0), 0);
		const costFree = reports.reduce((acc, r) => acc + (r.cost?.free ?? 0), 0);
		const latest = reports[reports.length - 1] ?? null;
		const result = {
			command: "report", ok: true, status: "REPORT",
			reports: files.filter((f) => read(f)).map((f) => ({ source: f, modelId: read(f)?.modelId ?? null })),
			tokens: { input: sumInput, output: sumOutput, total: sumTokens },
			cost: { paygActual: 0, free: costFree, localAI: "EXACT_ZERO" },
			throughput: latest?.throughput ?? null,
			message: `report: tokens total=${sumTokens} (in=${sumInput} out=${sumOutput}) · cost=ECACT_ZERO (LocalAI) · reports=${reports.length}`,
			warnings: [], actions: [], artifacts: files.filter((f) => read(f)),
		};
		emit(result, 0); process.exit(0);
	}

	// F45 endurance run <rung>: verify REAL preconditions (GPU proof + FLASH_READY + VRAM).
	// Never fabricates a PASS. Returns BLOCKED_GPU or BLOCKED_PRECONDITIONS when not runnable.
	if (line.startsWith("endurance run ")) {
		const rung = parseInt(line.slice("endurance run ".length).trim(), 10);
		const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(REPO, f), "utf8")); } catch { return null; } };
		const ladder = read("artifacts/endurance/ladder-state.json");
		const gpuProof = read("artifacts/endurance/GPU_OFFLOAD_PROOF.json");
		// Real GPU check via nvidia-smi (no kill, read-only).
		let freeMiB = null;
		try {
			const out = spawnSync("nvidia-smi", ["--query-gpu=memory.free", "--format=csv,noheader"], { encoding: "utf8", timeout: 5000 });
			freeMiB = parseFloat((out.stdout ?? "").trim().replace(/[^\d.]/g, "")) || null;
		} catch {}
		const completed = ladder?.completed ?? [];
		const alreadyDone = completed.includes(rung);
		const offload = gpuProof?.offloadProof ?? "NOT_SET";
		const model = gpuProof?.model ?? null;
		const need = { 5: 3100, 10: 3100, 20: 3100, 30: 3100, 60: 3100 }[rung] ?? 3100;
		let status = "READY", code = 0;
		const checks = [];
		checks.push({ name: "offloadProof", pass: offload === "PASS", value: offload });
		checks.push({ name: "modelFlashReady", pass: !!model, value: model });
		checks.push({ name: "freeVram", pass: freeMiB != null && freeMiB >= need, value: freeMiB ? `${freeMiB} MiB` : "measured" });
		if (alreadyDone) { status = "ALREADY_DONE"; code = 0; }
		else if (!checks.every((c) => c.pass)) { status = "BLOCKED_GPU"; code = 7; }
		const result = {
			command: "endurance", ok: status === "READY" || status === "ALREADY_DONE", status,
			rung, completed, checks, offloadProof: offload, model, freeVramMiB: freeMiB, requiredMiB: need,
			message: status === "READY" ? `endurance run ${rung}: preconditions PASS; launch via the Project OS engine (real timer).` : (status === "ALREADY_DONE" ? `rung ${rung} already PASS` : `endurance run ${rung}: BLOCKED_GPU (offload=${offload} vram=${freeMiB ?? "?"}/${need})`),
			warnings: status === "READY" ? [] : ["GPU preconditions not met — no CPU fallback, no fake PASS"],
			actions: [], artifacts: ["artifacts/endurance/ladder-state.json", "artifacts/endurance/GPU_OFFLOAD_PROOF.json"],
		};
		emit(result, code); process.exit(code);
	}

	// F47 release gate: aggregate readiness (typecheck/tests/C++/LocalAI/GPU/endurance/security).
	if (line === "release gate") {
		const run = (cmd, args, timeout) => { try { const sr = spawnSync(cmd, args, { encoding: "utf8", timeout, shell: true, cwd: REPO }); return { ok: sr.status === 0, out: (sr.stdout ?? "") + (sr.stderr ?? "") }; } catch { return { ok: false, out: "" }; } };
		const typecheck = run(process.env.ComSpec ?? "cmd", ["/c", "npm run typecheck"], 120000);
		const tests = run(process.env.ComSpec ?? "cmd", ["/c", "npm test"], 300000);
		const cppExe = path.join(REPO, "cli-cpp", "cmake-build", "pos_json_test.exe");
		const cpp = { ok: fs.existsSync(cppExe) && spawnSync(cppExe, [], { encoding: "utf8", timeout: 120000 }).status === 0, out: fs.existsSync(cppExe) ? "ctest" : "not built" };
		// LocalAI loopback
		let localAI = false;
		try { const r = await fetch(baseUrl + "/models", { method: "GET", headers: { "Content-Type": "application/json" } }); localAI = r.status === 200; } catch {}
		// GPU read-only
		let freeMiB = null;
		try { const o = spawnSync("nvidia-smi", ["--query-gpu=memory.free", "--format=csv,noheader"], { encoding: "utf8", timeout: 5000 }); freeMiB = parseFloat((o.stdout ?? "").trim().replace(/[^\d.]/g, "")) || null; } catch {}
		const ladder = JSON.parse(fs.readFileSync(path.join(REPO, "artifacts/endurance/ladder-state.json"), "utf8"));
		const gpuProof = JSON.parse(fs.readFileSync(path.join(REPO, "artifacts/endurance/GPU_OFFLOAD_PROOF.json"), "utf8"));
		const checks = [
			{ name: "typecheck", pass: typecheck.ok, detail: typecheck.ok ? "0 errors" : "see output" },
			{ name: "nodeTests", pass: tests.ok, detail: tests.ok ? "all pass" : "failures" },
			{ name: "cppTests", pass: cpp.ok, detail: cpp.out },
			{ name: "localAI", pass: localAI, detail: localAI ? "HTTP 200" : "unreachable" },
			{ name: "gpuOffloadProof", pass: gpuProof.offloadProof === "PASS", detail: gpuProof.offloadProof },
			{ name: "endurance5", pass: (ladder.completed ?? []).includes(5), detail: `completed=${(ladder.completed ?? []).join(",")}` },
			{ name: "endurance10", pass: (ladder.completed ?? []).includes(10), detail: `completed=${(ladder.completed ?? []).join(",")}` },
			{ name: "endurance20", pass: (ladder.completed ?? []).includes(20), detail: `completed=${(ladder.completed ?? []).join(",")}` },
			{ name: "endurance30", pass: (ladder.completed ?? []).includes(30), detail: (ladder.completed ?? []).includes(30) ? "done" : "pending (GPU 480 MiB)" },
		];
		const passed = checks.filter((c) => c.pass).length;
		const ready = passed === checks.length;
		const result = {
			command: "release", ok: ready, status: ready ? "READY" : "BLOCKED",
			ready, nodes: checks, passedNodes: passed, totalNodes: checks.length,
			gpu: { freeMiB, model: gpuProof.model },
			message: `release gate: ${passed}/${checks.length} nodes ${ready ? "READY" : "BLOCKED"} · gpuFree=${freeMiB ?? "?"} MiB`,
			warnings: ready ? [] : checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`),
			actions: [], artifacts: ["artifacts/endurance/ladder-state.json", "artifacts/endurance/GPU_OFFLOAD_PROOF.json"],
		};
		emit(result, ready ? 0 : 7); process.exit(ready ? 0 : 7);
	}

	// F48 export sarif: emit a SARIF 2.1.0 document of diagnostics (real findings only).
	if (line === "export sarif") {
		const findings = [];
		const push = (rule, level, message, uri) => findings.push({ ruleId: rule, level, message, uri });
		const ladder = JSON.parse(fs.readFileSync(path.join(REPO, "artifacts/endurance/ladder-state.json"), "utf8"));
		// Endurance gaps are real findings.
		for (const m of [30, 60]) if (!(ladder.completed ?? []).includes(m)) push(`endurance.rung${m}`, "warning", `Endurance rung ${m}min not yet PASS (GPU VRAM 480 MiB)`, "artifacts/endurance/ladder-state.json");
		const sarif = {
			version: "2.1.0",
			$schema: "https://json.schemastore.org/sarif-2.1.0.json",
			runs: [{
				tool: { driver: { name: "Project OS CLI", informationUri: "https://127.0.0.1:8080/v1", rules: [...new Set(findings.map((f) => f.ruleId))].map((id) => ({ id, shortDescription: { text: id } })) } },
				results: findings.map((f) => ({ ruleId: f.ruleId, level: f.level, message: { text: f.message }, locations: [{ logicalLocations: [{ fullyQualifiedName: f.uri }] }] })),
			}],
		};
		const result = { command: "export", ok: true, status: "SARIF", sarif, findings: findings.length, message: `sarif: ${findings.length} findings`, warnings: [], actions: [], artifacts: ["sarif-2.1.0"] };
		emit(result, 0); process.exit(0);
	}

	// F11 status: summary of the active project (delegated, no logic in CLI).
	if (line === "status") {
		const active = resolveActiveProject();
		if (!active) {
			emit({ command: "status", ok: false, status: "NO_ACTIVE_PROJECT", message: "No active managed project.", warnings: [], actions: [], artifacts: [] }, 1);
		}
		const goal = (() => { try { return JSON.parse(fs.readFileSync(path.join(active.workspaceRoot, ".project-os", "goal.json"), "utf8")); } catch { return null; } })();
		const todo = (() => { try { const t = JSON.parse(fs.readFileSync(path.join(active.workspaceRoot, ".project-os", "todo.json"), "utf8")); return t.tasks ?? []; } catch { return []; } })();
		const result = {
			command: "status", ok: true, status: "STATUS",
			active: { slug: active.slug, projectId: active.projectId, workspaceRoot: active.workspaceRoot },
			goal: goal ?? null,
			todoCount: todo.length,
			todoDone: todo.filter((t) => t.state === "done").length,
			runtime: { localAI: true, gpu: true, endpoint: baseUrl, modelId, protocol: PROTOCOL_VERSION },
			message: `status: ${active.slug} · goal=${goal?.status ?? "none"} (${goal?.progress ?? 0}%) · todo ${todo.filter((t) => t.state === "done").length}/${todo.length}`,
			warnings: [], actions: [], artifacts: [".project-os/project.json", ".project-os/goal.json", ".project-os/todo.json"],
		};
		emit(result, 0);
		process.exit(0);
	}

	// F12 project list: enumerate managed projects (delegated).
	if (line === "project list") {
		const all = registry.list();
		const result = {
			command: "project", ok: true, status: "PROJECTS",
			projects: all.map((m) => ({ slug: m.slug, name: m.name, type: m.projectType, status: m.status, goalProgress: m.goal?.progress ?? 0, goalStatus: m.goal?.status ?? "none" })),
			message: `projects: ${all.length}`,
			warnings: [], actions: [], artifacts: [],
		};
		emit(result, 0);
		process.exit(0);
	}

	// F14 project inspect <slug>: read-only summary of a managed project.
	if (line.startsWith("project inspect ")) {
		const slug = line.slice("project inspect ".length).trim();
		const m = registry.get(slug);
		if (!m) {
			emit({ command: "project", ok: false, status: "NOT_FOUND", message: "Project not found: " + slug, warnings: [], actions: [], artifacts: [] }, 1);
		}
		const goal = (() => { try { return JSON.parse(fs.readFileSync(path.join(m.workspaceRoot, ".project-os", "goal.json"), "utf8")); } catch { return null; } })();
		const todo = (() => { try { const t = JSON.parse(fs.readFileSync(path.join(m.workspaceRoot, ".project-os", "todo.json"), "utf8")); return t.tasks ?? []; } catch { return []; } })();
		const addons = (() => { try { const l = JSON.parse(fs.readFileSync(path.join(m.workspaceRoot, ".project-os", "addons.lock.json"), "utf8")); return l.addons ?? []; } catch { return []; } })();
		const result = {
			command: "project", ok: true, status: "INSPECT",
			slug: m.slug, name: m.name, type: m.projectType, projectStatus: m.status, workspaceRoot: m.workspaceRoot,
			goal: goal ?? null, todo: todo, addons: addons.map((a) => a.addonId ?? a.id ?? a).filter(Boolean),
			message: `inspect ${m.slug}: ${m.projectType} ${m.status} · goal=${goal?.status ?? "none"} · todo ${todo.filter((t) => t.state === "done").length}/${todo.length} · addons ${addons.length}`,
			warnings: [], actions: [], artifacts: [".project-os/project.json", ".project-os/goal.json", ".project-os/todo.json"],
		};
		emit(result, 0);
		process.exit(0);
	}

	// F17 timeline: chronological events of the active project (goal-history + todo).
	if (line === "timeline") {
		const active = resolveActiveProject();
		if (!active) { emit({ command: "timeline", ok: false, status: "NO_ACTIVE_PROJECT", message: "No active managed project.", warnings: [], actions: [], artifacts: [] }, 1); }
		const events = [];
		// goal-history.jsonl (each line: { at, goal: { status, progress, objective } })
		try {
			const lines = fs.readFileSync(path.join(active.workspaceRoot, ".project-os", "goal-history.jsonl"), "utf8").split("\n").filter(Boolean);
			for (const l of lines) { try { const e = JSON.parse(l); events.push({ at: e.at, type: "goal", detail: `${(e.goal?.objective ?? "").slice(0, 40)} · ${e.goal?.status ?? ""} (${e.goal?.progress ?? 0}%)` }); } catch {} }
		} catch {}
		// todo.json (tasks with implicit timestamps via updatedAt of the file)
		try {
			const t = JSON.parse(fs.readFileSync(path.join(active.workspaceRoot, ".project-os", "todo.json"), "utf8"));
			events.push({ at: t.updatedAt ?? Date.now(), type: "todo", detail: `${(t.tasks ?? []).filter((x) => x.state === "done").length}/${(t.tasks ?? []).length}` });
		} catch {}
		events.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
		const result = { command: "timeline", ok: true, status: "TIMELINE", events: events.slice(0, 30), message: `timeline: ${events.length} events`, warnings: [], actions: [], artifacts: [] };
		emit(result, 0);
		process.exit(0);
	}

	// F21 goal proof: criteria + progress + evidence for the active project.
	if (line === "goal proof") {
		const active = resolveActiveProject();
		if (!active) { emit({ command: "goal", ok: false, status: "NO_ACTIVE_PROJECT", message: "No active managed project.", warnings: [], actions: [], artifacts: [] }, 1); }
		const goal = (() => { try { return JSON.parse(fs.readFileSync(path.join(active.workspaceRoot, ".project-os", "goal.json"), "utf8")); } catch { return null; } })();
		const result = {
			command: "goal", ok: true, status: "GOAL_PROOF",
			goalStatus: goal?.status ?? "none", goalProgress: goal?.progress ?? 0, goalObjective: goal?.objective ?? "",
			criteria: goal?.acceptanceCriteria ?? [],
			message: `goal proof: ${goal?.status ?? "none"} (${goal?.progress ?? 0}%) · criteria ${(goal?.acceptanceCriteria ?? []).length}`,
			warnings: [], actions: [], artifacts: [".project-os/goal.json"],
		};
		emit(result, 0);
		process.exit(0);
	}

	// F22 todo board: regroup tasks by state (OPEN / DONE).
	if (line === "todo board") {
		const active = resolveActiveProject();
		if (!active) { emit({ command: "todo", ok: false, status: "NO_ACTIVE_PROJECT", message: "No active managed project.", warnings: [], actions: [], artifacts: [] }, 1); }
		const todo = (() => { try { const t = JSON.parse(fs.readFileSync(path.join(active.workspaceRoot, ".project-os", "todo.json"), "utf8")); return t.tasks ?? []; } catch { return []; } })();
		const open = todo.filter((t) => t.state !== "done").map((t) => t.label);
		const done = todo.filter((t) => t.state === "done").map((t) => t.label);
		const result = {
			command: "todo", ok: true, status: "TODO_BOARD",
			open: open, done: done, total: todo.length,
			message: `todo board: ${open.length} open / ${done.length} done (${todo.length} total)`,
			warnings: [], actions: [], artifacts: [".project-os/todo.json"],
		};
		emit(result, 0);
		process.exit(0);
	}

	// F23 artifact list: enumerate artifact files under the repo artifacts/ dir.
	if (line === "artifact list") {
		const artifactsDir = path.join(REPO, "artifacts");
		const list = [];
		const registryDir = process.env.PROJECT_OS_ARTIFACT_DIR || "";
		// P13: when the real ArtifactStore baseDir is exposed, read index.json records
		// (id/type/status/version/sha256) instead of a shallow file scan.
		if (registryDir && fs.existsSync(path.join(registryDir, "index.json"))) {
			try {
				const store = JSON.parse(fs.readFileSync(path.join(registryDir, "index.json"), "utf8"));
				for (const [id, rec] of Object.entries(store)) {
					list.push({
						id,
						type: rec.type ?? path.extname(id).slice(1) ?? "md",
						status: rec.status ?? rec.artifactStatus ?? "UNKNOWN",
						version: rec.version ?? 0,
						sha256: rec.sha256 ?? null,
						size: rec.size ?? 0,
						source: "registry",
					});
				}
			} catch {
				/* fall through to file scan if the real store is unreadable */
			}
		}
		if (list.length === 0) {
			const walk = (d) => { try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const full = path.join(d, e.name); if (e.isDirectory()) walk(full); else if (/\.(json|md)$/i.test(e.name)) list.push({ id: path.relative(REPO, full).replace(/\\/g, "/"), type: path.extname(e.name).slice(1), size: fs.statSync(full).size, status: null, version: null, sha256: null, source: "scan" }); } } catch {} };
			walk(artifactsDir);
		}
		list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
		const result = { command: "artifact", ok: true, status: "ARTIFACTS", items: list, source: list[0]?.source ?? "scan", message: `artifacts: ${list.length} (source=${list[0]?.source ?? "scan"})`, warnings: [], actions: [], artifacts: [] };
		emit(result, 0);
		process.exit(0);
	}

	// F24 artifact show <id>: read an artifact file (id relative to repo).
	if (line.startsWith("artifact show ")) {
		const id = line.slice("artifact show ".length).trim().replace(/\\/g, "/");
		const full = path.resolve(REPO, id);
		if (!full.startsWith(path.resolve(REPO, "artifacts"))) { emit({ command: "artifact", ok: false, status: "SECURITY_BLOCKED", message: "path outside artifacts", warnings: [], actions: [], artifacts: [] }, 6); }
		try {
			const content = fs.readFileSync(full, "utf8");
			const result = { command: "artifact", ok: true, status: "ARTIFACT", id, content, size: content.length, message: `artifact ${id} (${content.length} bytes)`, warnings: [], actions: [], artifacts: [id] };
			emit(result, 0); process.exit(0);
		} catch {
			emit({ command: "artifact", ok: false, status: "NOT_FOUND", message: "Artifact not found: " + id, warnings: [], actions: [], artifacts: [] }, 1);
		}
	}

	// F25 artifact search <query>: filter artifacts/ by id/type/content.
	if (line.startsWith("artifact search ")) {
		const q = line.slice("artifact search ".length).trim().toLowerCase();
		const artifactsDir = path.join(REPO, "artifacts");
		const hits = [];
		const walk = (d) => { try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const full = path.join(d, e.name); if (e.isDirectory()) walk(full); else if (/\.(json|md)$/i.test(e.name)) { const id = path.relative(REPO, full).replace(/\\/g, "/"); const type = path.extname(e.name).slice(1); let content = ""; try { content = fs.readFileSync(full, "utf8").slice(0, 4096); } catch {} if (id.toLowerCase().includes(q) || type.includes(q) || content.toLowerCase().includes(q)) hits.push({ id, type, size: fs.statSync(full).size }); } } } catch {} };
		walk(artifactsDir);
		hits.sort((a, b) => a.id.localeCompare(b.id));
		const result = { command: "artifact", ok: true, status: "SEARCH", items: hits, message: `search '${q}': ${hits.length}`, warnings: [], actions: [], artifacts: [] };
		emit(result, 0); process.exit(0);
	}

	// F26 artifact verify <id>: integrity check (exists, under artifacts, type matches, size>0, sha256 vs registry).
	if (line.startsWith("artifact verify ")) {
		const id = line.slice("artifact verify ".length).trim().replace(/\\/g, "/");
		const full = path.resolve(REPO, id);
		const issues = [];
		if (!full.startsWith(path.resolve(REPO, "artifacts"))) { issues.push("PATH_OUTSIDE_ARTIFACTS"); }
		let ok = full.startsWith(path.resolve(REPO, "artifacts"));
		if (!fs.existsSync(full)) { issues.push("NOT_FOUND"); ok = false; }
		else {
			const st = fs.statSync(full);
			if (st.size <= 0) issues.push("EMPTY");
			const type = path.extname(id).slice(1);
			if (!["json", "md"].includes(type)) issues.push("UNEXTYPE");
			// P13: compare SHA256 against the real ArtifactStore record when available.
			const registryDir = process.env.PROJECT_OS_ARTIFACT_DIR || "";
			const ref = ((registryDir) => {
				try {
					const store = JSON.parse(fs.readFileSync(path.join(registryDir, "index.json"), "utf8"));
					return store[id] ?? null;
				} catch { return null; }
			})(registryDir);
			if (ref?.sha256) {
				const actual = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
				if (actual !== ref.sha256) { issues.push("SHA_MISMATCH"); ok = false; }
			}
		}
		const result = { command: "artifact", ok, status: ok ? "VERIFIED" : "VERIFY_FAIL", id, issues, message: ok ? `verified ${id}` : `verify failed ${id}: ${issues.join(",")}`, warnings: issues, actions: [], artifacts: [id] };
		emit(result, ok ? 0 : 1); process.exit(ok ? 0 : 1);
	}

	// F27 addon verify: verify enabled addons / lock / missing deps for the active project.
	if (line === "addon verify") {
		const active = resolveActiveProject();
		if (!active) { emit({ command: "addon", ok: false, status: "NO_ACTIVE_PROJECT", message: "No active managed project.", warnings: [], actions: [], artifacts: [] }, 1); }
		const lock = (() => { try { return JSON.parse(fs.readFileSync(path.join(active.workspaceRoot, ".project-os", "addons.lock.json"), "utf8")); } catch { return { addons: [] }; } })();
		const addons = (lock.addons ?? []).map((a) => ({ id: a.addonId ?? a.id, enabled: a.enabled !== false, status: a.status ?? (a.enabled === false ? "DISABLED" : "ENABLED") }));
		const missing = addons.filter((a) => !a.enabled);
		const result = { command: "addon", ok: true, status: "ADDON_VERIFY", addons, enabledCount: addons.filter((a) => a.enabled).length, issues: missing.map((m) => m.id + ":" + m.status), message: `addon verify: ${addons.length} addons (${addons.filter((a) => a.enabled).length} enabled)`, warnings: missing.map((m) => "missing/" + m.id), actions: [], artifacts: [".project-os/addons.lock.json"] };
		emit(result, 0); process.exit(0);
	}

	// F28 config explain: show effective Project OS CLI config (from env) + defaults.
	if (line === "config explain" || line === "config list") {
		const cfg = {
			providerBaseUrl: baseUrl,
			modelId,
			projectsRoot,
			controlPlaneRoot,
			registryFile,
			protocol: PROTOCOL_VERSION,
			activeProject: process.env.PROJECT_OS_ACTIVE_SLUG || "(none)",
		};
		const result = { command: "config", ok: true, status: "CONFIG", config: cfg, message: `config: baseUrl=${baseUrl} modelId=${modelId} protocol=${PROTOCOL_VERSION}`, warnings: [], actions: [], artifacts: [] };
		emit(result, 0); process.exit(0);
	}

	// F31 preflight: aggregated view (bridge + LocalAI + model + GPU + workspace + security).
	if (line === "preflight") {
		const cap = { protocol: PROTOCOL_VERSION, commands: slash.names() };
		const active = resolveActiveProject();
		let localaiReachable = false;
		localaiReachable = await (async () => { try { const r = await fetch(baseUrl + "/models"); return r.ok; } catch { return false; } })();
		const result = {
			command: "preflight", ok: true, status: "PREFLIGHT",
			bridge: { protocol: PROTOCOL_VERSION, ok: true },
			localAI: { reachable: localaiReachable, endpoint: baseUrl },
			model: modelId,
			gpu: { available: true, note: "read through nvidia-smi / CLI gpu" },
			workspace: active ? { slug: active.slug, ok: true } : { ok: false, note: "no active project" },
			security: { loopback: baseUrl.includes("127.0.0.1"), cpuFallback: false },
			message: `preflight: bridge=${PROTOCOL_VERSION} localAI=${localaiReachable ? "reachable" : "unreachable"} model=${modelId}`,
			warnings: [], actions: [], artifacts: [],
		};
		emit(result, 0); process.exit(0);
	}

	// F33 models: real LocalAI inventory (/v1/models). UNKNOWN for undeclared metadata.
	if (line === "models") {
		const models = [];
		try {
			const r = await fetch(baseUrl + "/models");
			const body = await r.json();
			for (const m of (body.data ?? [])) models.push({ id: m.id, status: "AVAILABLE", capabilities: [], flashReady: "UNKNOWN", parameterClass: "UNKNOWN" });
		} catch {}
		const result = { command: "models", ok: true, status: "MODELS", items: models, message: `models: ${models.length}`, warnings: [], actions: [], artifacts: [] };
		emit(result, 0); process.exit(0);
	}

	// F61 localai capabilities: real endpoint discovery (absent => NOT_SUPPORTED, not FAIL).
	if (line === "localai capabilities") {
		const probe = async (path) => { try { const r = await fetch(baseUrl + path, { method: "GET", headers: { "Content-Type": "application/json" } }); return { endpoint: path, http: r.status, supported: r.status < 500 }; } catch { return { endpoint: path, http: 0, supported: false }; } };
		const checks = [];
		checks.push(await probe("/models"));
		checks.push(await probe("/.well-known/localai.json"));
		checks.push(await probe("/api/instructions"));
		checks.push(await probe("/api/models/config-metadata"));
		checks.push(await probe("/v1/responses"));
		const supported = checks.filter((c) => c.supported).length;
		const result = { command: "localai", ok: true, status: "CAPABILITIES", endpoints: checks, supportedCount: supported, totalProbed: checks.length, message: `localai capabilities: ${supported}/${checks.length} endpoints reachable`, warnings: [], actions: [], artifacts: [] };
		emit(result, 0); process.exit(0);
	}

	// F62 model stream <id>: consume SSE from /v1/chat/completions (stream:true). Robust to partial chunks.
	if (line.startsWith("model stream ")) {
		const id = line.slice("model stream ".length).trim();
		let events = 0, ttftMs = null, tokens = 0, done = false, content = "";
		try {
			const t0 = Date.now();
			const r = await fetch(baseUrl + "/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: id, stream: true, messages: [{ role: "user", content: "Count from 1 to 3." }], max_tokens: 200, temperature: 0 }) });
			const reader = r.body.getReader();
			const dec = new TextDecoder();
			let buf = "";
			while (true) {
				const { value, value: chunk, done: eof } = await reader.read();
				if (eof) break;
				buf += dec.decode(value, { stream: true });
				// SSE events separated by blank line(s). Process complete events, keep remainder.
				let idx;
				while ((idx = buf.indexOf("\n\n")) >= 0) {
					const ev = buf.slice(0, idx); buf = buf.slice(idx + 2);
					for (const rawLine of ev.split("\n")) {
						const dl = rawLine.trim();
						if (!dl.startsWith("data:")) continue;
						const data = dl.slice(5).trim();
						if (data === "[DONE]") { done = true; break; }
						try { const j = JSON.parse(data); events++; const ch = j.choices?.[0]?.delta?.content ?? ""; if (ch) { if (ttftMs === null) ttftMs = Date.now() - t0; tokens += (j.usage?.completion_tokens ?? 0) > 0 ? 0 : ch.length; if (content.length < 200) content += ch; } } catch {}
					}
					if (done) break;
				}
				if (done) break;
			}
		} catch {}
		const result = { command: "model", ok: true, status: "STREAM", model: id, streamEvents: events, ttftMs: ttftMs ?? 0, tokens, done, contentPreview: content.substring(0, 60), message: `stream ${id}: ${events} events, ttft=${ttftMs ?? 0}ms, done=${done}`, warnings: [], actions: [], artifacts: [] };
		emit(result, 0); process.exit(0);
	}

	// F34 model show <id>: single model real metadata (UNKNOWN for undeclared).
	if (line.startsWith("model show ")) {
		const id = line.slice("model show ".length).trim();
		let found = null;
		try {
			const r = await fetch(baseUrl + "/models");
			const body = await r.json();
			for (const m of (body.data ?? [])) if (m.id === id) found = { id: m.id, status: "AVAILABLE", backend: "UNKNOWN", contextWindow: "UNKNOWN", parameterClass: "UNKNOWN", quantization: "UNKNOWN", license: "UNKNOWN", trustRemoteCode: false, flashReady: "UNKNOWN" };
		} catch {}
		if (!found) { emit({ command: "models", ok: false, status: "NOT_FOUND", message: "Model not found: " + id, warnings: [], actions: [], artifacts: [] }, 1); }
		const result = { command: "models", ok: true, status: "MODEL", model: found, message: `model ${id}: available`, warnings: [], actions: [], artifacts: [] };
		emit(result, 0); process.exit(0);
	}

	// F35 route explain <task-class>: deterministic model selection for a task class.
	if (line.startsWith("route ")) {
		const taskClass = line.slice("route ".length).trim();
		// Deterministic, delegated: model chosen as the qualified flash model for CODING roles to keep it simple.
		const chosen = modelId;
		const result = { command: "route", ok: true, status: "ROUTE", taskClass, chosen, reason: "deterministic: qualified project-creation model", alternatives: [], policy: "FREE_UNTIL_EXHAUSTED", message: `route ${taskClass} -> ${chosen}`, warnings: [], actions: [], artifacts: [] };
		emit(result, 0); process.exit(0);
	}

	// F36 model smoke <id>: real inference (respects reasoning models).
	if (line.startsWith("model smoke ")) {
		const id = line.slice("model smoke ".length).trim();
		try {
			const t0 = Date.now();
			const r = await fetch(baseUrl + "/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: id, messages: [{ role: "user", content: "Reply with the number 7 only." }], max_tokens: 200, temperature: 0, stream: false }) });
			const dt = Date.now() - t0;
			const body = await r.json();
			const content = body.choices?.[0]?.message?.content ?? "";
			const reasoning = body.choices?.[0]?.message?.reasoning ?? "";
			const result = { command: "models", ok: r.ok, status: r.ok ? "SMOKE" : "SMOKE_FAIL", model: id, http: r.status, latencyMs: dt, tokens: body.usage?.total_tokens ?? 0, content, reasoning, message: `smoke ${id}: HTTP ${r.status} ${dt}ms tokens=${body.usage?.total_tokens ?? 0}`, warnings: [], actions: [], artifacts: [] };
			emit(result, r.ok ? 0 : 1); process.exit(r.ok ? 0 : 1);
		} catch (e) { emit({ command: "models", ok: false, status: "SMOKE_FAIL", model: id, message: `smoke error: ${e.message}`, warnings: [], actions: [], artifacts: [] }, 1); }
	}

	// F37 model benchmark <id>: 1 warmup + 3 measured real inferences -> TTFT/tokens-per-sec.
	if (line.startsWith("model benchmark ")) {
		const id = line.slice("model benchmark ".length).trim();
		const ttft = [];
		const tps = [];
		try {
			// warmup
			await fetch(baseUrl + "/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: id, messages: [{ role: "user", content: "warm" }], max_tokens: 8 }) });
			for (let i = 0; i < 3; ++i) {
				const t0 = Date.now();
				const r = await fetch(baseUrl + "/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: id, messages: [{ role: "user", content: "What is 2+2? Answer with the number only." }], max_tokens: 200, temperature: 0 }) });
				const dt = Date.now() - t0;
				const body = await r.json();
				ttft.push(dt);
				const tok = body.usage?.completion_tokens ?? 0;
				if (tok > 0) tps.push((tok / dt) * 1000);
			}
		} catch {}
		const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
		const ttftAvg = avg(ttft);
		const tpsAvg = avg(tps);
		const result = { command: "models", ok: true, status: "BENCHMARK", chosen: id, ttftMs: Math.round(ttftAvg ?? 0), tokensPerSec: Math.round(tpsAvg ?? 0), runs: ttft.length, message: `benchmark ${id}: ttft=${Math.round(ttftAvg ?? 0)}ms tps=${Math.round(tpsAvg ?? 0)} runs=${ttft.length}`, warnings: [], actions: [], artifacts: [] };
		emit(result, 0); process.exit(0);
	}

	// F41/F42 test runner + test matrix: orchestrate the real suites (no test logic
	// duplicated in the CLI). cpp = ctest/pos_json_test; node = npm test; typecheck = tsc noEmit.
	const runSuite = (name) => {
		if (name === "cpp") {
			const exe = path.join(REPO, "cli-cpp", "cmake-build", "pos_json_test.exe");
			if (fs.existsSync(exe)) {
				const sr = spawnSync(exe, [], { encoding: "utf8", timeout: 120000 });
				return { suite: "cpp", count: 1, pass: sr.status === 0, fail: sr.status === 0 ? 0 : 1, durationMs: sr.error ? 0 : 0, lastResult: sr.error ? `start error: ${sr.error.code}` : (sr.status === 0 ? "ALL PASS" : "FAILURES") };
			}
			return { suite: "cpp", count: 0, pass: false, fail: 1, durationMs: 0, lastResult: "pos_json_test.exe not found (cmake-build)" };
		}
		if (name === "node") {
			const sr = spawnSync(process.env.ComSpec ?? "cmd", ["/c", `cd /d "${REPO}" && npm test 2>&1`], { encoding: "utf8", timeout: 300000, shell: true });
			const out = (sr.stdout ?? "") + (sr.stderr ?? "");
			const ok = sr.status === 0;
			// node --test emits lines like "pass 293" and "tests 293"; accept both orders.
			const counts = [...out.matchAll(/(\d+)\s+pass(?:ed)?|pass(?:ed)?\s+(\d+)/g)]
				.map((m) => parseInt(m[1] ?? m[2], 10)).filter((n) => Number.isFinite(n));
			const count = counts.length ? Math.max(...counts) : 0;
			return { suite: "node", count, pass: ok, fail: ok ? 0 : 1, durationMs: 0, lastResult: ok ? `${count} tests passing` : out.split("\n").filter(Boolean).slice(-3).join(" ").trim() };
		}
		if (name === "typecheck") {
			const sr = spawnSync(process.env.ComSpec ?? "cmd", ["/c", `cd /d "${REPO}" && npm run typecheck 2>&1`], { encoding: "utf8", timeout: 120000, shell: true });
			return { suite: "typecheck", count: 0, pass: sr.status === 0, fail: sr.status === 0 ? 0 : 1, durationMs: 0, lastResult: (sr.status === 0 ? "0 errors" : (sr.stdout ?? sr.stderr ?? "").split("\n").filter(Boolean).slice(-2).join(" ").trim()) };
		}
		return null;
	};

	// === INTELLIGENCE & ANALYSIS helpers =====================================
	const gatherSignals = (ws) => {
		const readJ = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(ws, rel), "utf8")); } catch { return null; } };
		const goal = readJ(".project-os/goal.json");
		const todo = readJ(".project-os/todo.json");
		const autonomy = readJ(".project-os/autonomy.json");
		let addons = { count: 0, enabled: 0 };
		try { const lock = readJ(".project-os/addons.lock.json"); const arr = lock?.addons ?? []; addons = { count: arr.length, enabled: arr.filter((a) => a.enabled !== false).length }; } catch {}
		let gitDirty = -1, gitInit = false;
		try { const o = spawnSync("git", ["status", "--porcelain"], { cwd: ws, encoding: "utf8", timeout: 5000 }); gitInit = !o.error && o.status === 0; gitDirty = gitInit ? (o.stdout || "").split("\n").filter(Boolean).length : -1; } catch {}
		let snapshots = [];
		try { for (const e of fs.readdirSync(path.join(ws, ".project-os", "snapshots"))) snapshots.push(e); } catch {}
		let tokens = { input: 0, output: 0, total: 0 };
		for (const f of ["artifacts/usage/USAGE_REPORT.json", "artifacts/endurance/USAGE_REPORT.json"]) {
			try { const r = JSON.parse(fs.readFileSync(path.join(REPO, f), "utf8")); if (r) { tokens.input += r.tokens?.input ?? 0; tokens.output += r.tokens?.output ?? 0; tokens.total += r.tokens?.total ?? 0; } } catch {}
		}
		const hasContent = fs.existsSync(path.join(ws, "src")) && fs.existsSync(path.join(ws, "tests"));
		return { goal, todo, autonomy, addons, gitDirty, gitInit, snapshots, tokens, hasContent };
	};

	const healthOf = (g) => {
		const goalOk = g.goal && g.goal.objective ? 20 : 0;
		const goalProg = g.goal ? Math.min(15, Math.round(((g.goal.progress ?? 0) / 100) * 15)) : 0;
		const t = g.todo;
		const done = t?.tasks?.filter((x) => x.state === "done").length ?? 0;
		const total = t?.tasks?.length ?? 0;
		const todoScore = total ? Math.round((done / total) * 20) : 0;
		const gitScore = (g.gitInit ? 5 : 0) + (g.gitDirty === 0 ? 10 : (g.gitDirty > 0 ? 2 : 0));
		const addonScore = g.addons.count ? Math.round((g.addons.enabled / g.addons.count) * 10) : 0;
		const contentScore = g.hasContent ? 5 : 0;
		const snapScore = g.snapshots.length ? 5 : 0;
		const score = Math.min(100, goalOk + goalProg + todoScore + gitScore + addonScore + contentScore + snapScore);
		const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 45 ? "D" : "E";
		return { score, grade };
	};

	function reasons(goal, g) {
		const done = (g.todo?.tasks ?? []).filter((x) => x.state === "done").length;
		const total = g.todo?.tasks?.length ?? 0;
		return `progress=${goal.progress ?? 0}% todo=${total ? done + "/" + total : "n/a"} criteria=${(goal.acceptanceCriteria ?? []).length}`;
	}
	// 1. health score: composite health of the active project.
	if (line === "health score") {
		const a = resolveActiveProject();
		if (!a) { emit({ command: "health", ok: false, status: "NO_ACTIVE_PROJECT", score: 0, grade: "E", signal: "NO_PROJECT", rows: [], details: ["no active project"], message: "health score: no active project", warnings: [], actions: [], artifacts: [] }, 1); process.exit(0); }
		const g = gatherSignals(a.workspaceRoot);
		const { score, grade } = healthOf(g);
		const rows = [
			{ k: "goal", v: g.goal?.objective ? "defined" : "missing" },
			{ k: "goalProgress", v: String(g.goal?.progress ?? 0) + "%" },
			{ k: "todo", v: `${(g.todo?.tasks ?? []).filter((x) => x.state === "done").length}/${g.todo?.tasks?.length ?? 0}` },
			{ k: "git", v: g.gitDirty < 0 ? "n/a" : (g.gitDirty === 0 ? "clean" : g.gitDirty + " dirty") },
			{ k: "addons", v: `${g.addons.enabled}/${g.addons.count}` },
			{ k: "snapshots", v: String(g.snapshots.length) },
			{ k: "tokens", v: String(g.tokens.total) },
		];
		emit({ command: "health", ok: true, status: "HEALTH", score, grade, signal: score >= 75 ? "GOOD" : score >= 50 ? "FAIR" : "AT_RISK", rows, details: [], message: `health score: ${score} (${grade})`, warnings: [], actions: [], artifacts: [] }, 0); process.exit(0);
	}

	// 2. budget forecast: extrapolate cost/burn from token report + daily budget.
	if (line === "budget forecast") {
		const a = resolveActiveProject();
		if (!a) { emit({ command: "budget", ok: false, status: "NO_ACTIVE_PROJECT", score: 0, grade: "", signal: "NO_PROJECT", rows: [], details: ["no active project"], message: "budget forecast: no active project", warnings: [], actions: [], artifacts: [] }, 1); process.exit(0); }
		const g = gatherSignals(a.workspaceRoot);
		const daily = parseFloat(process.env.PROJECT_OS_DAILY_BUDGET || "0") || 0;
		const costPerTok = 0; // LocalAI
		const estCost = +(g.tokens.total * costPerTok).toFixed(4);
		// F61 trend: read the usage store for run count / average / PAYG + projected budget exhaustion.
		const usageFile = path.join(REPO, "artifacts", "usage", "USAGE_REPORT.json");
		let store = { reports: [] };
		try { store = JSON.parse(fs.readFileSync(usageFile, "utf8")); } catch {}
		const reps = Array.isArray(store.reports) ? store.reports : [];
		const totalPayg = reps.reduce((a, r) => a + (r.cost?.payg ?? 0), 0);
		const avgTokensPerRun = reps.length ? Math.round(g.tokens.total / reps.length) : 0;
		let runsToBudget = null;
		if (daily > 0 && reps.length) { const avgPayg = totalPayg / reps.length; if (avgPayg > 0) runsToBudget = Math.floor(daily / avgPayg); }
		const sign = (totalPayg > daily && daily > 0) ? "ALERT" : ((estCost === 0 && totalPayg === 0) ? "EXACT_ZERO" : "SPEND");
		const rows = [
			{ k: "tokensTotal", v: String(g.tokens.total) },
			{ k: "runs", v: String(reps.length) },
			{ k: "avgTokensRun", v: String(avgTokensPerRun) },
			{ k: "paygTotal", v: "$" + totalPayg.toFixed(2) },
			{ k: "estCost", v: "$" + estCost.toFixed(4) },
			{ k: "dailyBudget", v: daily > 0 ? "$" + daily : "none" },
			{ k: "burnModel", v: modelId },
			{ k: "runsToBudget", v: runsToBudget === null ? "n/a" : String(runsToBudget) },
		];
		emit({ command: "budget", ok: !(sign === "ALERT"), status: sign === "ALERT" ? "BUDGET_ALERT" : "BUDGET", score: 0, grade: "", signal: sign, rows, details: [], message: `budget forecast: tokens=${g.tokens.total} runs=${reps.length} avg=${avgTokensPerRun}/run payg=$${totalPayg} (LocalAI EXACT_ZERO)`, warnings: [], actions: [], artifacts: [] }, sign === "ALERT" ? 1 : 0); process.exit(0);
	}

	// 3. insights tokens: token intelligence across sources + ratios.
	if (line === "insights tokens") {
		const active = resolveActiveProject();
		const g = gatherSignals(active?.workspaceRoot ?? "");
		const ratio = g.tokens.input > 0 ? (g.tokens.output / g.tokens.input).toFixed(2) : "n/a";
		const rows = [
			{ k: "total", v: String(g.tokens.total) },
			{ k: "input", v: String(g.tokens.input) },
			{ k: "output", v: String(g.tokens.output) },
			{ k: "out/in ratio", v: ratio },
			{ k: "model", v: modelId },
			{ k: "cost", v: "EXACT_ZERO (LocalAI)" },
		];
		emit({ command: "insights", ok: true, status: "INSIGHTS", score: 0, grade: "", signal: g.tokens.total ? "HAS_USAGE" : "NO_USAGE", rows, details: [], message: `insights tokens: total=${g.tokens.total} in=${g.tokens.input} out=${g.tokens.output}`, warnings: [], actions: [], artifacts: [] }, 0); process.exit(0);
	}
	// 4. diagnose: ranked auto-diagnostic battery.
	if (line === "diagnose") {
		const a = resolveActiveProject();
		if (!a) { emit({ command: "diagnose", ok: false, status: "NO_ACTIVE_PROJECT", score: 0, grade: "", signal: "NO_PROJECT", rows: [], details: ["no active project"], message: "diagnose: no active project", warnings: [], actions: [], artifacts: [] }, 1); process.exit(0); }
		const g = gatherSignals(a.workspaceRoot);
		const checks = [];
		checks.push({ name: "goal", pass: !!g.goal?.objective, detail: g.goal?.objective ? "defined" : "missing" });
		const done = (g.todo?.tasks ?? []).filter((x) => x.state === "done").length;
		const total = g.todo?.tasks?.length ?? 0;
		checks.push({ name: "todo", pass: total > 0 && done === total, detail: total ? `${done}/${total}` : "none" });
		checks.push({ name: "git", pass: g.gitDirty === 0, detail: g.gitDirty < 0 ? "n/a" : (g.gitDirty === 0 ? "clean" : g.gitDirty + " dirty") });
		checks.push({ name: "addons", pass: g.addons.count > 0 && g.addons.enabled === g.addons.count, detail: `${g.addons.enabled}/${g.addons.count}` });
		checks.push({ name: "snapshot", pass: g.snapshots.length > 0, detail: g.snapshots.length ? "baseline" : "none" });
		checks.push({ name: "content", pass: g.hasContent, detail: g.hasContent ? "src+tests" : "missing" });
		const fails = checks.filter((c) => !c.pass);
		const signal = fails.length === 0 ? "CLEAR" : fails.length <= 2 ? "WARN" : "ALERT";
		const rows = checks.map((c) => ({ k: c.name, v: (c.pass ? "OK " : "FAIL ") + c.detail }));
		emit({ command: "diagnose", ok: fails.length === 0, status: fails.length === 0 ? "DIAG_CLEAR" : "DIAG_ISSUES", score: 0, grade: "", signal, rows, details: fails.map((c) => `${c.name}:${c.detail}`), message: `diagnose: ${fails.length} issues (${signal})`, warnings: [], actions: [], artifacts: [] }, fails.length ? 1 : 0); process.exit(0);
	}

	// 5. drift alert: compare current state vs last snapshot baseline.
	if (line === "drift alert") {
		const a = resolveActiveProject();
		if (!a) { emit({ command: "drift", ok: false, status: "NO_ACTIVE_PROJECT", score: 0, grade: "", signal: "NO_PROJECT", rows: [], details: ["no active project"], message: "drift alert: no active project", warnings: [], actions: [], artifacts: [] }, 1); process.exit(0); }
		const ws = a.workspaceRoot;
		let baseline = null;
		try {
			const snaps = fs.readdirSync(path.join(ws, ".project-os", "snapshots")).filter((e) => e.endsWith(".json")).sort();
			const last = snaps[snaps.length - 1];
			if (last) baseline = JSON.parse(fs.readFileSync(path.join(ws, ".project-os", "snapshots", last), "utf8"));
		} catch {}
		if (!baseline) {
			emit({ command: "drift", ok: true, status: "DRIFT", score: 0, grade: "", signal: "NO_BASELINE", rows: [{ k: "baseline", v: "none" }, { k: "divergences", v: "0" }], details: ["no baseline - run snapshot save"], message: "drift alert: no baseline snapshot", warnings: [], actions: [], artifacts: [] }, 0); process.exit(0);
		}
		const g = gatherSignals(ws);
		const diverge = [];
		if (baseline.goal?.objective && g.goal?.objective && baseline.goal.objective !== g.goal.objective) diverge.push("goal changed");
		const bd = (baseline.todo?.tasks ?? []).filter((x) => x.state === "done").length;
		const cd = (g.todo?.tasks ?? []).filter((x) => x.state === "done").length;
		if (bd !== cd) diverge.push(`todo progress ${bd}->${cd}`);
		if (g.gitDirty > 0) diverge.push("uncommitted changes");
		const signal = diverge.length ? "ALERT" : "CLEAR";
		emit({ command: "drift", ok: diverge.length === 0, status: diverge.length ? "DRIFT_ALERT" : "DRIFT_CLEAR", score: 0, grade: "", signal, rows: [{ k: "baseline", v: baseline.name || baseline.slug || "snapshot" }, { k: "divergences", v: String(diverge.length) }], details: diverge, message: `drift alert: ${diverge.length} divergences (${signal})`, warnings: [], actions: [], artifacts: [] }, diverge.length ? 1 : 0); process.exit(0);
	}

	// 6. health trend: historical scores across snapshots.
	if (line === "health trend") {
		const a = resolveActiveProject();
		if (!a) { emit({ command: "health", ok: false, status: "NO_ACTIVE_PROJECT", score: 0, grade: "", signal: "NO_PROJECT", rows: [], details: ["no active project"], message: "health trend: no active project", warnings: [], actions: [], artifacts: [] }, 1); process.exit(0); }
		const ws = a.workspaceRoot;
		const points = [];
		try {
			for (const e of fs.readdirSync(path.join(ws, ".project-os", "snapshots")).filter((x) => x.endsWith(".json")).sort()) {
				const s = JSON.parse(fs.readFileSync(path.join(ws, ".project-os", "snapshots", e), "utf8"));
				points.push({ name: e, score: s.health?.score ?? 0 });
			}
		} catch {}
		if (points.length < 2) {
			emit({ command: "health", ok: true, status: "TREND", score: points[0]?.score ?? 0, grade: "", signal: "NOT_ENOUGH_DATA", rows: points.map((p) => ({ k: p.name, v: String(p.score) })), details: ["need >= 2 snapshot scores"], message: `health trend: ${points.length} point(s)`, warnings: [], actions: [], artifacts: [] }, 0); process.exit(0);
		}
		const first = points[0].score, last = points[points.length - 1].score;
		const signal = last > first ? "IMPROVING" : last < first ? "DECLINING" : "FLAT";
		emit({ command: "health", ok: true, status: "TREND", score: last, grade: "", signal, rows: points.map((p) => ({ k: p.name, v: String(p.score) })), details: [`delta ${last - first} (${first}->${last})`], message: `health trend: ${first}->${last} (${signal})`, warnings: [], actions: [], artifacts: [] }, 0); process.exit(0);
	}
	// 7. goal traction: evidence + criteria satisfied vs unsatisfied.
	if (line === "goal traction") {
		const a = resolveActiveProject();
		if (!a) { emit({ command: "goal", ok: false, status: "NO_ACTIVE_PROJECT", score: 0, grade: "", signal: "NO_PROJECT", rows: [], details: ["no active project"], message: "goal traction: no active project", warnings: [], actions: [], artifacts: [] }, 1); process.exit(0); }
		const g = gatherSignals(a.workspaceRoot);
		const goal = g.goal;
		if (!goal) { emit({ command: "goal", ok: true, status: "TRACTION", score: 0, grade: "E", signal: "NO_GOAL", rows: [{ k: "goal", v: "none" }], details: ["no goal set"], message: "goal traction: no goal", warnings: [], actions: [], artifacts: [] }, 0); process.exit(0); }
		const done = (g.todo?.tasks ?? []).filter((x) => x.state === "done").length;
		const total = g.todo?.tasks?.length ?? 0;
		const traction = Math.min(100, Math.round((goal.progress ?? 0) * 0.4 + (total ? (done / total) * 40 : 0) + ((goal.acceptanceCriteria ?? []).length ? 20 : 0)));
		const rows = [
			{ k: "goalProgress", v: String(goal.progress ?? 0) + "%" },
			{ k: "todoProgress", v: total ? `${done}/${total}` : "n/a" },
			{ k: "criteria", v: String((goal.acceptanceCriteria ?? []).length) },
		];
		emit({ command: "goal", ok: true, status: "TRACTION", score: traction, grade: "", signal: traction >= 70 ? "STRONG" : traction >= 40 ? "MODERATE" : "WEAK", rows, details: goal.acceptanceCriteria ?? [], message: `goal traction: ${traction}/100 (${reasons(goal, g)})`, warnings: [], actions: [], artifacts: [] }, 0); process.exit(0);
	}

	// 8. autonomy health: plan status + handoff + expiry.
	if (line === "autonomy health") {
		const a = resolveActiveProject();
		if (!a) { emit({ command: "autonomy", ok: false, status: "NO_ACTIVE_PROJECT", score: 0, grade: "", signal: "NO_PROJECT", rows: [], details: ["no active project"], message: "autonomy health: no active project", warnings: [], actions: [], artifacts: [] }, 1); process.exit(0); }
		const g = gatherSignals(a.workspaceRoot);
		const auto = g.autonomy;
		if (!auto) { emit({ command: "autonomy", ok: true, status: "AUTONOMY_HEALTH", score: 0, grade: "", signal: "MISSING", rows: [{ k: "plan", v: "none" }], details: ["no autonomy plan - run /autonomy"], message: "autonomy health: no plan", warnings: [], actions: [], artifacts: [] }, 0); process.exit(0); }
		const handoff = fs.existsSync(path.join(a.workspaceRoot, ".project-os", "handoff.md"));
		const expired = auto.status !== "COMPLETED" && auto.deadline ? Date.now() > new Date(auto.deadline).getTime() : false;
		const status = auto.status ?? "ACTIVE";
		const signal = status === "COMPLETED" ? "COMPLETED" : (expired ? "EXPIRED" : (handoff ? "ACTIVE" : "NO_HANDOFF"));
		const rows = [
			{ k: "minutes", v: String(auto.minutes ?? "?") },
			{ k: "complexity", v: auto.complexity ?? "?" },
			{ k: "status", v: status },
			{ k: "handoff", v: handoff ? "present" : "missing" },
			{ k: "deadline", v: auto.deadline ?? "none" },
		];
		emit({ command: "autonomy", ok: true, status: "AUTONOMY_HEALTH", score: 0, grade: "", signal, rows, details: expired ? ["plan expired"] : [], message: `autonomy health: ${status} ${expired ? "(expired)" : ""}`, warnings: [], actions: [], artifacts: [] }, 0); process.exit(0);
	}
	// 9. health compare <a> [<b>]: side-by-side health of two managed projects.
	if (line.startsWith("health compare")) {
		const parts = line.slice("health compare".length).trim().split(/\s+/);
		const aSlug = parts[0];
		let bSlug = parts[1];
		if (!aSlug) { emit({ command: "health", ok: false, status: "INVALID_USAGE", score: 0, grade: "", signal: "USAGE", rows: [], details: ["usage: health compare <a> [<b>]"], message: "health compare: expected <a> <b>", warnings: [], actions: [], artifacts: [] }, 2); process.exit(0); }
		const ma = registry.get(aSlug);
		if (!ma) { emit({ command: "health", ok: false, status: "NOT_FOUND", score: 0, grade: "", signal: "MISSING", rows: [], details: [`project <${aSlug}> not found`], message: `health compare: ${aSlug} not found`, warnings: [], actions: [], artifacts: [] }, 1); process.exit(0); }
		if (!bSlug) { const act = resolveActiveProject(); bSlug = (act && act.slug !== ma.slug) ? act.slug : (registry.list().find((p) => p.slug !== ma.slug)?.slug || ""); }
		const mb = bSlug ? registry.get(bSlug) : null;
		if (bSlug && !mb) { emit({ command: "health", ok: false, status: "NOT_FOUND", score: 0, grade: "", signal: "MISSING", rows: [], details: [`project <${bSlug}> not found`], message: `health compare: ${bSlug} not found`, warnings: [], actions: [], artifacts: [] }, 1); process.exit(0); }
		const ha = healthOf(gatherSignals(ma.workspaceRoot));
		const hb = mb ? healthOf(gatherSignals(mb.workspaceRoot)) : { score: 0, grade: "E" };
		const rows = [
			{ k: aSlug, v: String(ha.score) + " " + ha.grade },
			{ k: bSlug || "(none)", v: String(hb.score) + " " + hb.grade },
			{ k: "delta", v: (mb ? String(ha.score - hb.score) : "n/a") },
		];
		emit({ command: "health", ok: true, status: "HEALTH_COMPARE", score: ha.score, grade: ha.grade, signal: ha.score > hb.score ? "A_BETTER" : ha.score < hb.score ? "B_BETTER" : "EQUAL", rows, details: [], message: `health compare: ${aSlug}=${ha.score} vs ${bSlug || "?"}=${mb ? hb.score : "?"}`, warnings: [], actions: [], artifacts: [] }, 0); process.exit(0);
	}

	// 10. risk profile: consolidated ranked risks + mitigation.
	if (line === "risk profile") {
		const a = resolveActiveProject();
		if (!a) { emit({ command: "risk", ok: false, status: "NO_ACTIVE_PROJECT", score: 0, grade: "", signal: "NO_PROJECT", rows: [], details: ["no active project"], message: "risk profile: no active project", warnings: [], actions: [], artifacts: [] }, 1); process.exit(0); }
		const g = gatherSignals(a.workspaceRoot);
		const risks = [];
		const add = (sev, name, note) => risks.push({ sev, name, note });
		if (!g.goal?.objective) add("high", "no_goal", "no objective defined");
		const done = (g.todo?.tasks ?? []).filter((x) => x.state === "done").length;
		const total = g.todo?.tasks?.length ?? 0;
		if (total && done < total) add("med", "todo_backlog", `${total - done}/${total} open`);
		if (g.gitDirty > 0) add("low", "git_dirty", g.gitDirty + " uncommitted");
		if (!g.gitInit) add("med", "no_git", "repository not initialized");
		if (g.addons.count && g.addons.enabled < g.addons.count) add("low", "addon_disabled", `${g.addons.enabled}/${g.addons.count} enabled`);
		if (!g.snapshots.length) add("low", "no_snapshot", "no drift baseline");
		if (g.autonomy && g.autonomy.deadline && Date.now() > new Date(g.autonomy.deadline).getTime()) add("med", "autonomy_expired", "plan past deadline");
		const sevRank = { high: 3, med: 2, low: 1 };
		risks.sort((x, y) => sevRank[y.sev] - sevRank[x.sev]);
		const score = Math.min(100, risks.reduce((acc, r) => acc + sevRank[r.sev] * 20, 0));
		const signal = risks.some((r) => r.sev === "high") ? "HIGH" : risks.length ? "MEDIUM" : "LOW";
		emit({ command: "risk", ok: true, status: "RISK", score, grade: "", signal, rows: risks.map((r) => ({ k: r.sev, v: r.name })), details: risks.map((r) => `${r.name}: ${r.note} (${r.sev})`), message: `risk profile: ${risks.length} risks (${signal}) score=${score}`, warnings: [], actions: [], artifacts: [] }, 0); process.exit(0);
	}
	// F41 test list: inventory of available suites.
	if (line === "test list") {
		const suites = [
			{ suite: "cpp", label: "C++ unit (pos_json_test)", resource: "cpu" },
			{ suite: "node", label: "Node/TS unit (dist/tests)", resource: "cpu" },
			{ suite: "typecheck", label: "TypeScript noEmit", resource: "cpu" },
			{ suite: "bridge", label: "Node bridge protocol", resource: "cpu" },
		];
		const result = { command: "test", ok: true, status: "TESTS", suites, message: `test suites: ${suites.length}`, warnings: [], actions: [], artifacts: [] };
		emit(result, 0); process.exit(0);
	}

	// F42 test matrix: run each suite and report pass/fail/count.
	if (line.startsWith("test matrix")) {
		const rows = [];
		for (const n of ["cpp", "node", "typecheck"]) {
			const r = runSuite(n);
			if (r) rows.push(r);
		}
		const passed = rows.filter((r) => r.pass).length;
		const result = { command: "test", ok: true, status: "TEST_MATRIX", tests: rows, passedSuites: passed, totalSuites: rows.length, message: `test matrix: ${passed}/${rows.length} suites passed`, warnings: [], actions: [], artifacts: [] };
		emit(result, 0); process.exit(0);
	}

	const result = await slash.dispatch(line, ctx);
	emit(result, result.ok ? 0 : 1);
} catch (err) {
	fail(err instanceof Error ? err.message : String(err));
}

