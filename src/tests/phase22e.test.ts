import test from "node:test";
import assert from "node:assert";
import { isLoopback, isCloudLike, validateEnduranceProvider, validateRouterPolicy } from "../projects/ProviderPolicyValidator.js";

const localcfg = { providerId: "openai-compatible", baseUrl: "http://127.0.0.1:8080/v1", modelId: "granite-4.2-3b-flash", hasFallbackProvider: false, cloudCandidates: [] };

test("provider: loopback detections", () => {
	assert.equal(isLoopback("http://127.0.0.1:8080/v1"), true);
	assert.equal(isLoopback("http://localhost:8080/v1"), true);
	assert.equal(isLoopback("https://api.openai.com/v1"), false);
	assert.equal(isCloudLike("https://api.openai.com/v1"), true);
	assert.equal(isCloudLike("http://127.0.0.1:8080/v1"), false);
});

test("provider: valid LocalAI-only config passes", () => {
	const v = validateEnduranceProvider(localcfg, "granite-4.2-3b-flash");
	assert.equal(v.ok, true);
	assert.deepEqual(v.reasons, []);
});

test("provider: cloud/fallback/misconfig are rejected with explicit reasons", () => {
	assert.ok(validateEnduranceProvider({ ...localcfg, providerId: "anthropic" }, "x").reasons.includes("PROVIDER_NOT_OPENAI_COMPATIBLE"));
	assert.ok(validateEnduranceProvider({ ...localcfg, baseUrl: "https://api.openai.com/v1" }, "x").reasons.includes("BASE_URL_NOT_LOOPBACK_LOCALAI"));
	assert.ok(validateEnduranceProvider({ ...localcfg, hasFallbackProvider: true }, "x").reasons.includes("FALLBACK_PROVIDER_ENABLED"));
	assert.ok(validateEnduranceProvider({ ...localcfg, cloudCandidates: ["openai"] }, "x").reasons.includes("CLOUD_CANDIDATE_PRESENT"));
	assert.ok(validateEnduranceProvider({ ...localcfg, modelId: "ministral-3b-flash" }, "granite-4.2-3b-flash").reasons.includes("MODEL_NOT_MATCH"));
});

test("router policy: default forbids CPU fallback and requires GPU+FLASH_READY", () => {
	assert.equal(validateRouterPolicy().ok, true);
	assert.ok(validateRouterPolicy({ allowCpuFallback: true, requireGpu: true, requireFlashReady: true }).reasons.includes("CPU_FALLBACK_ALLOWED"));
	assert.ok(validateRouterPolicy({ allowCpuFallback: false, requireGpu: false, requireFlashReady: true }).reasons.includes("GPU_NOT_REQUIRED"));
});
