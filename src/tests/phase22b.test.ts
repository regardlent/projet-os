import test from "node:test";
import assert from "node:assert";
import { DEFAULT_PROJECTS_ROOT, freshProjectPath, isUnderRoot, buildReset, assertProjectIsolation, projectRunId } from "../projects/EnduranceReset.js";
import { createModelRecord, buildEvidencePack, LOCALAI_BASE_URL } from "../projects/ProjectCreationEvidence.js";

// ---- EnduranceReset ----
test("fresh project path is a direct child under the projects root", () => {
	assert.equal(freshProjectPath("C:\\Users\\eiden\\Desktop\\dev\\projects", "project-os-endurance-1"), "C:\\Users\\eiden\\Desktop\\dev\\projects\\project-os-endurance-1");
});

test("isUnderRoot: child is inside, outside is not", () => {
	assert.equal(isUnderRoot("C:\\a\\b", "C:\\a\\b\\c"), true);
	assert.equal(isUnderRoot("C:\\a\\b", "C:\\a\\b"), true);
	assert.equal(isUnderRoot("C:\\a\\b", "C:\\a\\other"), false);
	assert.equal(isUnderRoot("C:\\a\\b", "C:\\a\\bX"), false); // not a path prefix to bX
});

test("projectRunId never reuses a FAIL run and starts with prefix", () => {
	assert.match(projectRunId(), /^project-os-endurance-/);
	assert.notEqual(projectRunId(), projectRunId());
});

test("buildReset: allClean false when a path is reused (a prior run already exists)", () => {
	const report = buildReset({ root: DEFAULT_PROJECTS_ROOT }, (p) => p.includes("project-os-endurance"));
	assert.equal(report.allClean, false);
	assert.equal(report.checklist.newProjectDir, false);
});

test("buildReset: fresh run is fully clean", () => {
	const report = buildReset({ root: DEFAULT_PROJECTS_ROOT }, () => false);
	assert.equal(report.allClean, true);
	assert.equal(report.checklist.newEvidenceDir, true);
	assert.ok(report.evidenceDir.endsWith("evidence"));
});

test("project isolation rejects outside-root and non-direct-child paths", () => {
	assert.equal(assertProjectIsolation(DEFAULT_PROJECTS_ROOT, "C:\\Users\\eiden\\Desktop\\dev\\projects\\run-1").ok, true);
	assert.equal(assertProjectIsolation(DEFAULT_PROJECTS_ROOT, "C:\\Users\\eiden\\Desktop\\dev\\other\\run-1").ok, false);
	assert.equal(assertProjectIsolation(DEFAULT_PROJECTS_ROOT, "C:\\Users\\eiden\\Desktop\\dev\\projects\\run-1\\nested").reason, "PROJECT_NOT_DIRECT_CHILD");
});

// ---- ProjectCreationEvidence ----
test("model record captures gpuOffloadProof + router roles", () => {
	const r = createModelRecord({ modelAlias: "granite-4.2-3b-flash", modelFamily: "Granite", quantization: "Q4_K_M", gpuOffloadProof: "PASS", contextSize: 131072, routerRole: ["CODING", "TOOLS"] });
	assert.equal(r.gpuOffloadProof, "PASS");
	assert.deepEqual(r.routerRole, ["CODING", "TOOLS"]);
	assert.equal(r.contextSize, 131072);
});

function passPack(overrides: Record<string, unknown> = {}) {
	return buildEvidencePack({
		runId: "r1",
		timer: { startedAt: 0, endedAt: 300_000, durationMs: 300_000, fullRung: true },
		freshProject: { isolated: true, underRoot: true, reused: false },
		gpu: { offloadProof: "PASS", vramBeforeMiB: 3000, vramPeakMiB: 3200, backendState: "loaded" },
		model: createModelRecord({ modelAlias: "granite-4.2-3b-flash", modelFamily: "Granite", quantization: "Q4_K_M", gpuOffloadProof: "PASS" }),
		buildTestRuntime: { build: { success: true, evidence: ["tsc"] }, tests: { total: 50, pass: 50, fail: 0 }, runtime: { opened: true, ran: true } },
		finalState: { result: "PASS", bugs: [] },
		...overrides,
	});
}

test("evidence pack: passEligible true only when all invariants hold", () => {
	const pack = passPack();
	assert.equal(pack.localAi.baseUrl, LOCALAI_BASE_URL);
	assert.equal(pack.clineProvider.providerId, "openai-compatible");
	assert.equal(pack.clineProvider.noFallbackProvider, true);
	assert.equal(pack.passEligible, true);
});

test("evidence pack: no GPU offload proof -> not pass eligible", () => {
	assert.equal(passPack().gpu.offloadProof, "PASS");
	assert.equal(passPack({ gpu: { offloadProof: "BLOCKED_GPU_INSUFFICIENT_VRAM", vramBeforeMiB: 118, vramPeakMiB: 118, backendState: "none" } }).passEligible, false);
});

test("evidence pack: cloud fallback or reused project disqualifies PASS", () => {
	assert.equal(passPack({ localAi: { provider: "localai", baseUrl: LOCALAI_BASE_URL, noCloudFallback: false } }).passEligible, false);
	assert.equal(passPack({ freshProject: { isolated: true, underRoot: true, reused: true } }).passEligible, false);
	assert.equal(passPack({ buildTestRuntime: { build: { success: true, evidence: [] }, tests: { total: 50, pass: 49, fail: 1 }, runtime: { opened: false, ran: false } } }).passEligible, false);
	assert.equal(passPack({ finalState: { result: "FAIL", bugs: ["gpu-oom"] } }).passEligible, false);
});
