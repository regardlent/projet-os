import test from "node:test";
import assert from "node:assert/strict";
import { catalogView, recordFromCandidate } from "../projects/ModelCatalog.js";
import type { ModelCandidate } from "../routing/ModelCandidate.js";

function cand(over: Partial<ModelCandidate>): ModelCandidate {
	return {
		providerId: "openai-compatible",
		modelId: "qwen3-4b",
		displayName: "qwen",
		billingClass: "LOCAL_FREE",
		capabilities: ["streaming"],
		privacy: "LOCAL",
		health: "AVAILABLE",
		modelState: "AVAILABLE",
		quotaState: "AVAILABLE",
		...over,
	};
}

test("record flags explicit gaps as UNKNOWN, never invented", () => {
	const r = recordFromCandidate(cand({ modelId: "m1" }));
	assert.equal(r.parameterClass, "UNKNOWN");
	assert.equal(r.flashReady, "UNKNOWN");
	assert.equal(r.contextWindow, "UNKNOWN");
	assert.ok(r.gaps.includes("contextWindow"));
	// Optionally declared context is surfaced
	const withCtx = recordFromCandidate(cand({ modelId: "m2", contextWindow: 16384 }));
	assert.equal(withCtx.contextWindow, 16384);
});

test("catalogView groups by provider and counts LocalAI", () => {
	const view = catalogView([
		cand({ providerId: "openai-compatible", modelId: "a" }),
		cand({ providerId: "openai-compatible", modelId: "b" }),
		cand({ providerId: "cline-free", modelId: "c" }),
	]);
	assert.equal(view.count, 3);
	assert.equal(view.localAiCount, 2);
	assert.equal(view.byProvider["openai-compatible"], 2);
	assert.equal(view.byProvider["cline-free"], 1);
});
