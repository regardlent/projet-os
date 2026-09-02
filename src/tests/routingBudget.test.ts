import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCatalog } from "../routing/ModelCatalogService.js";
import { route } from "../routing/IntelligentModelRouter.js";
import {
	ProjectBudgetGovernor,
	startOfDayForZone,
	RESERVATION_TTL_MS,
} from "../budget/BudgetGovernor.js";
import { ModelPerformanceRegistry } from "../routing/ModelPerformanceRegistry.js";
import type { ModelCandidate } from "../routing/ModelCandidate.js";

function freeCandidate(modelId = "free-m", extra?: Partial<ModelCandidate>): ModelCandidate {
	return { providerId: "cline-free", modelId, displayName: modelId, billingClass: "PROVIDER_FREE", builtInProviderId: "cline", capabilities: ["tools", "streaming", "json"], contextWindow: 200000, privacy: "HOSTED", health: "AVAILABLE", modelState: "AVAILABLE", quotaState: "AVAILABLE", ...extra };
}
function localCandidate(extra?: Partial<ModelCandidate>): ModelCandidate {
	return { providerId: "openai-compatible", modelId: "qwen3-4b", displayName: "local", billingClass: "LOCAL_FREE", capabilities: ["streaming"], contextWindow: 32000, privacy: "LOCAL", health: "AVAILABLE", modelState: "AVAILABLE", quotaState: "AVAILABLE", ...extra };
}
function passCandidate(modelId = "pass-m", extra?: Partial<ModelCandidate>): ModelCandidate {
	return { providerId: "cline-pass", modelId, displayName: modelId, billingClass: "SUBSCRIPTION_INCLUDED", builtInProviderId: "cline-pass", capabilities: ["tools", "streaming", "json", "reasoning"], contextWindow: 200000, privacy: "HOSTED", health: "AVAILABLE", modelState: "AVAILABLE", quotaState: "AVAILABLE", ...extra };
}
function paygCandidate(modelId = "pay-m", extra?: Partial<ModelCandidate>): ModelCandidate {
	return { providerId: "cline", modelId, displayName: modelId, billingClass: "PAY_AS_YOU_GO", builtInProviderId: "cline", capabilities: ["tools", "streaming", "json", "reasoning"], contextWindow: 200000, inputPricePer1M: 3, outputPricePer1M: 15, currency: "USD", privacy: "HOSTED", health: "AVAILABLE", modelState: "AVAILABLE", quotaState: "AVAILABLE", ...extra };
}

function governor(opts: { budget: number; mode?: "OFF" | "AUTO_WITHIN_PROJECT_BUDGET" | "ASK_EVERY_TIME"; spend?: number; now?: number }) {
	let spend = opts.spend ?? 0;
	const gov = new ProjectBudgetGovernor(
		{ projectId: "proj-os", dailyPaidBudget: opts.budget, currency: "USD", paidInferenceMode: opts.mode ?? "AUTO_WITHIN_PROJECT_BUDGET", zoneMinutes: 0, getActualPaidSpend: () => spend },
		() => opts.now ?? 1_000_000,
	);
	return { gov, setSpend: (v: number) => (spend = v) };
}

test("FREE PRIORITY: free compatible selected over paid (FREE_FIRST)", () => {
	const { gov } = governor({ budget: 10 });
	const d = route({ taskClass: "SMALL_FEATURE", candidates: [paygCandidate(), freeCandidate()], governor: gov, policy: "FREE_FIRST" });
	assert.equal(d.selected?.billingClass, "PROVIDER_FREE");
	assert.equal(d.selected?.modelId, "free-m");
});

test("FREE INCOMPATIBLE: free without tools rejected for tool task", () => {
	const { gov } = governor({ budget: 10 });
	const d = route({ taskClass: "SMALL_FEATURE", candidates: [localCandidate(), paygCandidate()], governor: gov, policy: "FREE_UNTIL_EXHAUSTED" });
	assert.equal(d.selected?.billingClass, "PAY_AS_YOU_GO");
	assert.ok(d.alternatives.some((a) => a.modelId === "qwen3-4b" && /missing capability/.test(a.reason)));
});

test("FREE LIMIT: cooldown model skipped, next free model chosen (no retry storm)", () => {
	const { gov } = governor({ budget: 10, now: 5_000 });
	const a = freeCandidate("a", { cooldownUntil: 10_000 });
	const b = freeCandidate("b");
	const d = route({ taskClass: "DOCUMENTATION", candidates: [a, b], governor: gov, policy: "FREE_UNTIL_EXHAUSTED", now: 5_000 });
	assert.equal(d.selected?.modelId, "b");
	assert.ok(d.alternatives.some((alt) => alt.modelId === "a" && /unavailable|cooldown/.test(alt.reason)));
});

test("RESET TIME: cooldown expires -> model becomes a candidate again", () => {
	const c = freeCandidate("c", { cooldownUntil: 10_000, resetAt: 10_000 });
	const { gov } = governor({ budget: 10, now: 5_000 });
	const d1 = route({ taskClass: "DOCUMENTATION", candidates: [c, freeCandidate("d")], governor: gov, policy: "FREE_UNTIL_EXHAUSTED", now: 5_000 });
	assert.equal(d1.selected?.modelId, "d");
	const { gov: gov2 } = governor({ budget: 10, now: 20_000 });
	const d2 = route({ taskClass: "DOCUMENTATION", candidates: [c, freeCandidate("d")], governor: gov2, policy: "FREE_UNTIL_EXHAUSTED", now: 20_000 });
	assert.equal(d2.selected?.modelId, "c");
});

test("DAILY BUDGET: estimate exceeding remaining budget is BLOCKED for PAYG", () => {
	const { gov } = governor({ budget: 5, spend: 4 });
	// High price so estimated cost greatly exceeds the $1 remaining.
	const expensive = paygCandidate("p", { inputPricePer1M: 300, outputPricePer1M: 1500 });
	const d = route({ taskClass: "MEDIUM_FEATURE", candidates: [expensive], governor: gov, policy: "FREE_UNTIL_EXHAUSTED" });
	assert.equal(d.selected, undefined);
	assert.ok(d.alternatives.some((a) => a.modelId === "p" && /BUDGET|COST_UNKNOWN/.test(a.reason)));
});

test("RESERVATION ATOMIC: consecutive reservations cannot exceed daily budget", () => {
	const { gov } = governor({ budget: 5, spend: 4 });
	const r1 = gov.reserve(1.5, { providerId: "cline", modelId: "m", billingClass: "PAY_AS_YOU_GO" });
	assert.equal(r1.allowed, false);
	const { gov: g2 } = governor({ budget: 5, spend: 4 });
	const a = g2.reserve(0.6, { providerId: "cline", modelId: "m", billingClass: "PAY_AS_YOU_GO" });
	const b = g2.reserve(0.6, { providerId: "cline", modelId: "m", billingClass: "PAY_AS_YOU_GO" });
	assert.equal(a.allowed, true);
	assert.equal(b.allowed, false);
});

test("ACTUAL COST RECONCILIATION releases reservation and records actual", () => {
	const { gov } = governor({ budget: 5, spend: 2 });
	const r = gov.reserve(0.8, { providerId: "cline", modelId: "m", billingClass: "PAY_AS_YOU_GO" });
	assert.ok(r.reservationId);
	const c = gov.commitActual(0.51, r.reservationId);
	assert.equal(c.delta, 0.51);
	assert.equal(c.stillWithinBudget, true);
});
test("CLINEPASS NOT PAYG: subscription-covered run does not consume paid budget", () => {
	const { gov } = governor({ budget: 5, spend: 4 });
	const before = gov.remaining();
	const d = route({ taskClass: "ARCHITECTURE", candidates: [passCandidate("p"), paygCandidate("pay")], governor: gov, policy: "FREE_UNTIL_EXHAUSTED" });
	assert.equal(d.selected?.billingClass, "SUBSCRIPTION_INCLUDED");
	assert.equal(gov.remaining(), before);
});

test("FREE_ONLY: no PAYG possible", () => {
	const { gov } = governor({ budget: 5 });
	const d = route({ taskClass: "SMALL_FEATURE", candidates: [paygCandidate("p"), freeCandidate("f")], governor: gov, policy: "FREE_ONLY" });
	assert.equal(d.selected?.billingClass, "PROVIDER_FREE");
});

test("UNKNOWN PRICE under AUTO_WITHIN_BUDGET requires approval (rejected)", () => {
	const { gov } = governor({ budget: 5, spend: 0 });
	const unknownPrice = paygCandidate("np", { inputPricePer1M: undefined, outputPricePer1M: undefined });
	const d = route({ taskClass: "MEDIUM_FEATURE", candidates: [unknownPrice], governor: gov, policy: "FREE_UNTIL_EXHAUSTED" });
	assert.equal(d.selected, undefined);
	assert.ok(d.alternatives.some((a) => a.modelId === "np" && /COST_UNKNOWN/.test(a.reason)));
});

test("SMART ROUTING: docs -> cheap free; architecture -> strong reasoning candidate", () => {
	const { gov } = governor({ budget: 10 });
	const docs = route({ taskClass: "DOCUMENTATION", candidates: [paygCandidate("pay"), freeCandidate("f")], governor: gov, policy: "FREE_UNTIL_EXHAUSTED" });
	assert.equal(docs.selected?.modelId, "f");
	const arch = route({ taskClass: "ARCHITECTURE", candidates: [freeCandidate("f"), passCandidate("pass")], governor: gov, policy: "FREE_UNTIL_EXHAUSTED" });
	assert.equal(arch.selected?.billingClass, "SUBSCRIPTION_INCLUDED");
});

test("DETERMINISM: same inputs -> same selection", () => {
	const candidates = [paygCandidate("p"), freeCandidate("f"), passCandidate("pass")];
	const { gov } = governor({ budget: 10 });
	const d1 = route({ taskClass: "MEDIUM_FEATURE", candidates, governor: gov, policy: "FREE_UNTIL_EXHAUSTED" });
	const { gov: g2 } = governor({ budget: 10 });
	const d2 = route({ taskClass: "MEDIUM_FEATURE", candidates, governor: g2, policy: "FREE_UNTIL_EXHAUSTED" });
	assert.equal(d1.selected?.modelId, d2.selected?.modelId);
});

test("MODEL HISTORY: insufficient history -> not artificially high confidence", () => {
	const perf = new ModelPerformanceRegistry();
	for (let i = 0; i < 30; i++) perf.record({ providerId: "cline-free", modelId: "f", taskClass: "SMALL_BUG", success: true });
	const { gov } = governor({ budget: 10 });
	const c = freeCandidate("f", { capabilities: ["tools", "streaming", "json", "reasoning"] });
	const d = route({ taskClass: "SMALL_BUG", candidates: [c], governor: gov, policy: "FREE_UNTIL_EXHAUSTED", performance: perf });
	assert.ok(d.confidence > 0.8);
	const perf2 = new ModelPerformanceRegistry();
	perf2.record({ providerId: "cline-free", modelId: "g", taskClass: "SMALL_BUG", success: true });
	const d2 = route({ taskClass: "SMALL_BUG", candidates: [freeCandidate("g", { capabilities: ["tools", "streaming", "json", "reasoning"] })], governor: gov, policy: "FREE_UNTIL_EXHAUSTED", performance: perf2 });
	assert.ok(d2.confidence < 0.8);
});

test("catalog builder supports local + cline free/pass with correct billing", () => {
	const cat = buildCatalog({ clineFree: [{ id: "x" }], clinePass: [{ id: "y" }] });
	const local = cat.find((c) => c.billingClass === "LOCAL_FREE");
	assert.ok(local);
	const free = cat.find((c) => c.modelId === "x");
	assert.equal(free?.billingClass, "PROVIDER_FREE");
	const pass = cat.find((c) => c.modelId === "y");
	assert.equal(pass?.billingClass, "SUBSCRIPTION_INCLUDED");
});

test("budget window is deterministic and day-bounded", () => {
	const s = startOfDayForZone(1_000_000, 0);
	assert.equal(s % 86_400_000, 0);
});

test("reservation TTL prunes expired", () => {
	const { gov } = governor({ budget: 5, spend: 0, now: 1_000_000 });
	const r = gov.reserve(0.5, { providerId: "cline", modelId: "m", billingClass: "PAY_AS_YOU_GO" });
	assert.ok(r.reservationId);
	assert.equal(gov.reservedTotal(1_000_000 + RESERVATION_TTL_MS + 1), 0);
});

