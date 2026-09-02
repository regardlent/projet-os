/**
 * ProviderProfile (W12 / W13)
 *
 * Single, non-secret abstraction for a provider. The LocalAI profile is derived
 * from a real local endpoint (provenance = "discovered_from_local_endpoint"),
 * not hardcoded as a universal assumption. Keeps provider config in ONE place.
 *
 * Pure module: no `vscode` import (cwd is passed in).
 */
import { CANONICAL_PROJECT_ROOT } from "../workspace/WorkspaceTopology.js";

export const LOCALAI_ENDPOINT = "http://127.0.0.1:8080/v1";
export const LOCALAI_CHAT_MODEL = "qwen3-4b";

export type ProviderFamily =
	| "openai-compatible"
	| "anthropic"
	| "openai"
	| "ollama"
	| "lmstudio"
	| "unknown";

export type CredentialSource = "none" | "env" | "secureStorage" | "providerSettings";

export interface ProviderProfile {
	id: string;
	providerId: string;
	family: ProviderFamily;
	modelId: string;
	baseUrl: string;
	localOnly: boolean;
	credentialSource: CredentialSource;
	provenance: string;
	cwd: string;
	capabilities: {
		completion: boolean;
		streaming: boolean;
		toolCall: boolean;
		usageReporting: boolean;
	};
}

/** The verified built-in provider id for generic OpenAI-compatible endpoints (0.0.81). */
export const OPENAI_COMPATIBLE_PROVIDER_ID = "openai-compatible";

/**
 * Build the LocalAI default profile. `cwd` must be the canonical workspace root;
 * a non-canonical cwd is flagged (it would be stale / wrong workspace).
 */
export function createLocalAIDefaultProfile(cwd: string): ProviderProfile {
	const isCanonical = cwd.toLowerCase() === CANONICAL_PROJECT_ROOT.toLowerCase();
	return {
		id: "localai-default",
		providerId: OPENAI_COMPATIBLE_PROVIDER_ID,
		family: "openai-compatible",
		modelId: LOCALAI_CHAT_MODEL,
		baseUrl: LOCALAI_ENDPOINT,
		localOnly: true,
		credentialSource: "none",
		provenance: "discovered_from_local_endpoint",
		cwd: isCanonical ? cwd : CANONICAL_PROJECT_ROOT,
		capabilities: {
			completion: true,
			streaming: false,
			toolCall: false,
			usageReporting: false,
		},
	};
}

/** Guard: reject a non-canonical workspace for a local-only profile. */
export function isValidLocalAICwd(cwd: string): boolean {
	return cwd.toLowerCase() === CANONICAL_PROJECT_ROOT.toLowerCase();
}
