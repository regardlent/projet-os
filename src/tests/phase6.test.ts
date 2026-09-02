import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyToolCall } from "../routing/ToolCallClassification.js";
import { mergeCapabilities, effectiveCapabilities } from "../routing/ModelCapabilityBenchmark.js";
import { buildScoreboard, normalizeAccountState } from "../routing/ModelScoreboard.js";
import { simulatePaidRouting } from "../budget/BudgetSimulator.js";
import { ProjectBudgetGovernor } from "../budget/BudgetGovernor.js";
import { buildCatalog } from "../routing/ModelCatalogService.js";

const readOnlyEvidence = {
	requestedToolCalls: 1,
	finishedToolCalls: 1,
	toolNames: ["read_files"],
	expectedToolNames: ["read_files"],
	finalAnswerCorrect: true,
};

test("tool call success requires a real tool request and correct answer", () => {
	assert.equal(classifyToolCall({ ...readOnlyEvidence, requestedToolCalls: 0, toolNames: [], finalAnswerCorrect: true }), "MODEL_DID_NOT_REQUEST_TOOL");
	assert.equal(classifyToolCall(readOnlyEvidence), "SUCCESS");
});

test("policy block and runtime failure classifications", () => {
	assert.equal(classifyToolCall({ ...readOnlyEvidence, policyBlocked: true }), "POLICY_BLOCKED");
	assert.equal(classifyToolCall({ ...readOnlyEvidence, toolRuntimeError: true }), "TOOL_RUNTIME_FAILED");
});

test("result not consumed when answer is wrong", () => {
	assert.equal(classifyToolCall({ ...readOnlyEvidence, finalAnswerCorrect: false }), "TOOL_RESULT_NOT_CONSUMED");
});

test("catalog vs observed capability conflict is surfaced, not hidden", () => {
	const fit = mergeCapabilities(["tools", "streaming"], {
		providerId: "p", modelId: "m", completion: true, tools: false, json: false, reasoning: false, vision: false, success: false, errors: [],
	});
	assert.equal(fit.conflict, true);
	assert.equal(fit.tools, false);
	assert.equal(fit.source, "BOTH");
	const caps = effectiveCapabilities(fit, ["tools", "streaming"]);
	assert.deepEqual(caps, ["streaming"]);
});

test("scoreboard locks PAYG when paid is disabled, sorts by fit", () => {
	const cat = buildCatalog({ clinePass: [{ id: "p1" }] });
	const local = cat.find((c) => c.billingClass === "LOCAL_FREE")!;
	const pass = cat.find((c) => c.modelId === "p1")!;
	const payg = { ...local, modelId: "pay", billingClass: "PAY_AS_YOU_GO" as const, inputPricePer1M: 3, outputPricePer1M: 15 };
	const rows = buildScoreboard([payg, pass, local], () => 0.9, false);
	assert.equal(rows.find((r) => r.modelId === "pay")?.locked, true);
	assert.equal(rows.find((r) => r.modelId === "p1")?.locked, false);
	assert.equal(rows.length, 3);
});

test("account state default is UNCONFIGURED when no signal observed", () => {
	const s = normalizeAccountState({});
	assert.equal(s.freeTier, "UNCONFIGURED");
	assert.equal(s.clinePass, "UNCONFIGURED");
	assert.equal(s.payg, "UNCONFIGURED");
	assert.equal(s.authenticated, "UNKNOWN");
});

test("budget simulator picks paid under AUTO budget with no request", () => {
	const cat = buildCatalog({
		paygCandidates: [{ providerId: "cline", modelId: "strong", displayName: "strong", billingClass: "PAY_AS_YOU_GO", builtInProviderId: "cline", capabilities: ["tools", "streaming", "json", "reasoning"], contextWindow: 200000, inputPricePer1M: 3, outputPricePer1M: 15, currency: "USD", privacy: "HOSTED" }],
	});
	const payg = cat.find((c) => c.billingClass === "PAY_AS_YOU_GO")!;
	const gov = new ProjectBudgetGovernor({ projectId: "p", dailyPaidBudget: 5, currency: "USD", paidInferenceMode: "OFF", getActualPaidSpend: () => 0 });
	const sim = simulatePaidRouting({ taskClass: "MEDIUM_FEATURE", candidates: [payg], governor: gov });
	assert.equal(sim.decision.selected?.billingClass, "PAY_AS_YOU_GO");
	assert.ok(sim.estimatedPaidCost !== undefined);
	assert.equal(sim.wouldBlock, false);
	assert.ok((sim.dailyRemainingAfter ?? 0) <= 5);
});

test("budget simulator reports block when nothing fits", () => {
	const cat = buildCatalog({
		paygCandidates: [{ providerId: "cline", modelId: "pricey", displayName: "pricey", billingClass: "PAY_AS_YOU_GO", builtInProviderId: "cline", capabilities: ["tools", "streaming", "json", "reasoning"], contextWindow: 200000, inputPricePer1M: 300, outputPricePer1M: 1500, currency: "USD", privacy: "HOSTED" }],
	});
	const payg = cat.find((c) => c.billingClass === "PAY_AS_YOU_GO")!;
	const gov = new ProjectBudgetGovernor({ projectId: "p", dailyPaidBudget: 1, currency: "USD", paidInferenceMode: "OFF", getActualPaidSpend: () => 0 });
	const sim = simulatePaidRouting({ taskClass: "ARCHITECTURE", candidates: [payg], governor: gov });
	assert.equal(sim.wouldBlock, true);
});
