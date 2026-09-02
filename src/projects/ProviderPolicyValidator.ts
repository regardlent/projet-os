/**
 * ProviderPolicyValidator (Phase 22, W1308). Proves the Cline/Project OS provider used by
 * EnduranceLab is LocalAI-only on loopback with NO cloud / NO fallback, and that the router
 * policy forbids CPU fallback. Pure + testable. Never assumes; emits explicit reasons.
 */

export interface EnduranceRouterPolicy {
	allowCpuFallback: boolean;
	requireGpu: boolean;
	requireFlashReady: boolean;
}

export const ENDURANCE_ROUTER_POLICY: EnduranceRouterPolicy = { allowCpuFallback: false, requireGpu: true, requireFlashReady: true };

export interface ProviderConfig {
	providerId: string;
	baseUrl: string;
	modelId: string | null;
	hasFallbackProvider: boolean;
	cloudCandidates: string[];
}

export interface ProviderVerdict {
	ok: boolean;
	reasons: string[];
}

/** True when the base URL targets a loopback LocalAI endpoint (127.0.0.1/localhost/[::1]). */
export function isLoopback(baseUrl: string): boolean {
	return /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/.*)?$/i.test(baseUrl.trim());
}

/** True when the base URL could reach a cloud provider (non-loopback). */
export function isCloudLike(baseUrl: string): boolean {
	if (isLoopback(baseUrl)) return false;
	return /^https?:\/\/(api\.|.*\.openai\.com|.*\.anthropic\.com|.*\.googleapis\.com|.*\.azure\.com)/i.test(baseUrl.trim());
}

/** Validate the provider + router policy for a GPU endurance run. */
export function validateEnduranceProvider(cfg: ProviderConfig, expectedModelId: string): ProviderVerdict {
	const reasons: string[] = [];
	if (cfg.providerId !== "openai-compatible") reasons.push("PROVIDER_NOT_OPENAI_COMPATIBLE");
	if (!isLoopback(cfg.baseUrl)) reasons.push("BASE_URL_NOT_LOOPBACK_LOCALAI");
	if (cfg.hasFallbackProvider) reasons.push("FALLBACK_PROVIDER_ENABLED");
	if (cfg.cloudCandidates.length > 0) reasons.push("CLOUD_CANDIDATE_PRESENT");
	if (cfg.modelId !== expectedModelId) reasons.push("MODEL_NOT_MATCH");
	return { ok: reasons.length === 0, reasons };
}

export function validateRouterPolicy(policy: EnduranceRouterPolicy = ENDURANCE_ROUTER_POLICY): ProviderVerdict {
	const reasons: string[] = [];
	if (policy.allowCpuFallback) reasons.push("CPU_FALLBACK_ALLOWED");
	if (!policy.requireGpu) reasons.push("GPU_NOT_REQUIRED");
	if (!policy.requireFlashReady) reasons.push("FLASH_READY_NOT_REQUIRED");
	return { ok: reasons.length === 0, reasons };
}
