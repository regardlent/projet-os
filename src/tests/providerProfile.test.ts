import { test } from "node:test";
import assert from "node:assert/strict";
import {
	createLocalAIDefaultProfile,
	isValidLocalAICwd,
	OPENAI_COMPATIBLE_PROVIDER_ID,
} from "../runtime/ProviderProfile.js";
import { CANONICAL_PROJECT_ROOT } from "../workspace/WorkspaceTopology.js";
import {
	inferencePasses,
	classifyInference,
	hasProviderError,
	failReason,
	type InferenceEvidence,
} from "../runtime/InferenceEvidence.js";

test("localai profile uses openai-compatible provider and canonical cwd", () => {
	const p = createLocalAIDefaultProfile(CANONICAL_PROJECT_ROOT);
	assert.equal(p.providerId, OPENAI_COMPATIBLE_PROVIDER_ID);
	assert.equal(p.modelId, "qwen3-4b");
	assert.equal(p.baseUrl, "http://127.0.0.1:8080/v1");
	assert.equal(p.provenance, "discovered_from_local_endpoint");
	assert.equal(p.localOnly, true);
	assert.equal(p.cwd, CANONICAL_PROJECT_ROOT);
});

test("non-canonical cwd is rejected as invalid local cwd", () => {
	assert.equal(isValidLocalAICwd(CANONICAL_PROJECT_ROOT), true);
	assert.equal(isValidLocalAICwd("C:\\Users\\eiden\\Desktop\\dev\\prob-reddit\\project-os"), false);
});

test("error text is never treated as inference", () => {
	const ev: InferenceEvidence = {
		provider: "openai-compatible",
		model: "qwen3-4b",
		sessionId: "s1",
		startedAt: 0,
		finishedAt: 1,
		text: 'Unknown or disabled provider "openai".',
		inputTokens: 0,
		outputTokens: 10,
		finishReason: "completed",
		providerError: null,
	};
	assert.equal(hasProviderError(ev), true);
	assert.equal(inferencePasses(ev), false);
	assert.equal(classifyInference(ev), "BLOCK");
});

test("tokens=0 cannot mark inference PASS", () => {
	const ev: InferenceEvidence = {
		provider: "openai-compatible",
		model: "qwen3-4b",
		sessionId: "s2",
		startedAt: 0,
		finishedAt: 1,
		text: "LOCALAI_CLINE_OK",
		inputTokens: 0,
		outputTokens: 0,
		finishReason: "completed",
		providerError: null,
	};
	assert.equal(inferencePasses(ev), false);
	assert.match(failReason(ev), /outputTokens/);
});

test("real text with tokens>0 and no error PASSES", () => {
	const ev: InferenceEvidence = {
		provider: "openai-compatible",
		model: "qwen3-4b",
		sessionId: "s3",
		startedAt: 0,
		finishedAt: 1,
		text: "LOCALAI_CLINE_OK",
		inputTokens: 14,
		outputTokens: 24,
		finishReason: "completed",
		providerError: null,
	};
	assert.equal(inferencePasses(ev), true);
	assert.equal(classifyInference(ev), "PASS");
});

test("empty text never passes", () => {
	const ev: InferenceEvidence = {
		provider: "openai-compatible",
		model: "qwen3-4b",
		sessionId: "s4",
		startedAt: 0,
		finishedAt: 1,
		text: "",
		inputTokens: 0,
		outputTokens: 100,
		finishReason: "completed",
		providerError: null,
	};
	assert.equal(inferencePasses(ev), false);
	assert.match(failReason(ev), /no real assistant text/);
});
