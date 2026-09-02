import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAutonomyOutcome, isModelFailure } from "../projects/autonomyFailure.js";
import { AutonomyActivityLedger, deterministicSummary } from "../projects/AutonomyActivityLedger.js";
import { buildAutonomyPlan } from "../projects/autonomy.js";
import { buildWriteScope, buildWritePlan, guardWritePath, isSecretFile, isProtectedPath } from "../projects/AutonomyWriteScope.js";

test("classifyAutonomyOutcome flags MODEL_EMPTY_OUTPUT vs SUCCESS_NO_ACTIVITY", () => {
	assert.equal(
		classifyAutonomyOutcome({ outputText: "", toolCalls: 0, missionRequiresContent: true, missionRequiresTool: false }),
		"MODEL_EMPTY_OUTPUT",
	);
	assert.equal(
		classifyAutonomyOutcome({ outputText: "  ", toolCalls: 0, missionRequiresContent: true, missionRequiresTool: false }),
		"MODEL_EMPTY_OUTPUT",
	);
	assert.equal(
		classifyAutonomyOutcome({ outputText: "analysis done", toolCalls: 0, missionRequiresContent: true, missionRequiresTool: false }),
		"SUCCESS_NO_ACTIVITY",
	);
	assert.equal(
		classifyAutonomyOutcome({ outputText: "x", toolCalls: 0, missionRequiresContent: false, missionRequiresTool: true }),
		"NO_REQUIRED_TOOL_CALL",
	);
	assert.equal(
		classifyAutonomyOutcome({ outputText: "x", toolCalls: 1, missionRequiresContent: true, missionRequiresTool: true }),
		"SUCCESS",
	);
	assert.equal(isModelFailure("MODEL_EMPTY_OUTPUT"), true);
	assert.equal(isModelFailure("SUCCESS_NO_ACTIVITY"), false);
});

test("AutonomyActivityLedger computes facts and deterministic summary", () => {
	const plan = buildAutonomyPlan({ projectId: "p", goalId: "g", objective: "Build X", projectType: "cpp", minutes: 45, complexity: "medium" });
	const ledger = new AutonomyActivityLedger();
	ledger.add({ ts: 1, iteration: 1, model: "m-a", eventType: "read", path: "src/a.cpp" });
	ledger.add({ ts: 2, iteration: 1, model: "m-a", eventType: "tool-call", tool: "read_files" });
	ledger.add({ ts: 3, iteration: 2, model: "m-a", eventType: "write", path: "src/a.cpp", status: "ok" });
	ledger.add({ ts: 4, iteration: 2, model: "m-b", eventType: "model-switch" });
	assert.equal(ledger.toolCalls(), 1);
	assert.equal(ledger.filesRead().includes("src/a.cpp"), true);
	assert.equal(ledger.filesChanged().includes("src/a.cpp"), true);
	assert.equal(ledger.modelSwitches(), 1);
	const s = deterministicSummary(plan, ledger);
	assert.match(s, /Files changed: 1/);
	assert.match(s, /Model fallbacks: 1/);
	assert.match(s, /m-a, m-b/);
});

test("write scope caps files and guard blocks outside/protected/secret/not allowed", () => {
	const scope = buildWriteScope({ runId: "r1", workspaceRoot: "C:/ws", complexity: "large" });
	assert.equal(scope.maxFiles, 30);
	assert.equal(scope.allowDelete, false);
	// outside
	assert.equal(guardWritePath("C:/ws", "../escape.txt", scope.allowedOperations, "create").ok, false);
	// protected
	assert.equal(guardWritePath("C:/ws", ".git/config", scope.allowedOperations, "create").ok, false);
	assert.equal(guardWritePath("C:/ws", "node_modules/x.json", scope.allowedOperations, "create").ok, false);
	// secret
	assert.equal(guardWritePath("C:/ws", ".env", scope.allowedOperations, "create").ok, false);
	assert.equal(guardWritePath("C:/ws", "keys/id_rsa", ["create"], "create").ok, false);
	// not allowed op
	assert.equal(guardWritePath("C:/ws", "src/a.ts", ["create"], "delete").ok, false);
	// allowed
	assert.equal(guardWritePath("C:/ws", "src/a.ts", ["create", "patch", "modify"], "patch").ok, true);
	assert.equal(isSecretFile(".env.prod"), true);
	assert.equal(isSecretFile("src/main.ts"), false);
	assert.equal(isProtectedPath("C:/ws", "C:/ws/build/out"), true);
	assert.equal(isProtectedPath("C:/ws", "C:/ws/src/out"), false);
});

test("buildWritePlan sets risk by operations", () => {
	const p = buildWritePlan({ runId: "r", projectId: "p", workspaceRoot: "C:/ws", goal: "g", minutes: 30, model: "m", allowedOperations: ["create", "patch", "modify"] });
	assert.equal(p.risk, "medium");
	assert.equal(p.rollbackPlan, ".project-os/autonomy-backups/<runId>");
});
