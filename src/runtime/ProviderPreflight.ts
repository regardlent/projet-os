/**
 * ProviderPreflight (W13)
 *
 * Determines, without exposing secrets, whether a configured LLM provider is
 * reachable and usable. Health states are honest: an endpoint that returns a
 * model list is AVAILABLE, but tool-calling is NEVER inferred from a plain
 * completion path. Untested capabilities are listed explicitly.
 *
 * Pure module: no `vscode` import; `fetch` is injected so it is testable.
 */

export type ProviderHealth =
	| "UNKNOWN"
	| "AVAILABLE"
	| "UNAVAILABLE"
	| "MISCONFIGURED"
	| "MODEL_MISSING"
	| "AUTH_REQUIRED";

export interface ProviderProfile {
	/** e.g. "openai-compatible", "anthropic". Never contains secrets. */
	type: string;
	providerId: string;
	modelId: string;
	/** Optional base URL (no credentials). */
	baseUrl?: string;
	/** Whether the configured credential is present. */
	hasCredential: boolean;
}

export interface ProviderCompatibilityResult {
	completion: boolean;
	streaming: boolean;
	multiTurn: boolean;
	toolCalling: boolean;
	structuredOutput: boolean;
	cancellation: boolean;
	usageReporting: boolean;
	/** Names of capabilities not validated yet (staying honest). */
	untested: string[];
}

export interface ProviderPreflightResult {
	health: ProviderHealth;
	summary: string;
	baseUrlReachable: boolean;
	modelsListed: string[];
	modelPresent: boolean;
	authRequired: boolean;
	compatibility: ProviderCompatibilityResult;
	checkedAt: number;
	/** Measured end-to-end latency of the /models request (ms). null if unreachable. */
	timingMs: number | null;
	/** Inventory shape observed: "openai" (data:[{id}]) | "ollama" (models:[{name}]) | "unknown". */
	inventoryShape: "openai" | "ollama" | "unknown";
	/** Raw endpoint (normalized) used for the preflight (no credentials). */
	baseUrl: string;
}

export interface FetchLike {
	(
		url: string,
		init?: { method?: string; headers?: Record<string, string> },
	): Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }>;
}

export const MODEL_ENDPOINT = "/models";

function noSecrets(value: string): boolean {
	return !/(api_?key|secret|token|bearer|sk-)/i.test(value);
}

export async function runProviderPreflight(
	profile: ProviderProfile,
	fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<ProviderPreflightResult> {
	const checkedAt = Date.now();
	const compat = emptyCompatibility();
	const base = (profile.baseUrl ?? "").replace(/\/+$/, "");

	if (!base) {
		return {
			health: "MISCONFIGURED",
			summary: "No base URL configured.",
			baseUrlReachable: false,
			modelsListed: [],
			modelPresent: false,
			authRequired: false,
			compatibility: compat,
			checkedAt,
			timingMs: null,
			inventoryShape: "unknown",
			baseUrl: base,
		};
	}

	let response: Awaited<ReturnType<FetchLike>>;
	const t0 = Date.now();
	try {
		response = await fetchImpl(`${base}${MODEL_ENDPOINT}`, { method: "GET" });
	} catch {
		return {
			health: "UNAVAILABLE",
			summary: `Endpoint not reachable: ${base}`,
			baseUrlReachable: false,
			modelsListed: [],
			modelPresent: false,
			authRequired: false,
			compatibility: compat,
			checkedAt,
			timingMs: null,
			inventoryShape: "unknown",
			baseUrl: base,
		};
	}
	const timingMs = Date.now() - t0;

	if (response.status === 401 || response.status === 403) {
		return {
			health: "AUTH_REQUIRED",
			summary: "Endpoint responded with an auth status (401/403).",
			baseUrlReachable: true,
			modelsListed: [],
			modelPresent: false,
			authRequired: true,
			compatibility: compat,
			checkedAt,
			timingMs,
			inventoryShape: "unknown",
			baseUrl: base,
		};
	}

	if (!response.ok) {
		return {
			health: "UNAVAILABLE",
			summary: `Endpoint reachable but returned HTTP ${response.status}.`,
			baseUrlReachable: true,
			modelsListed: [],
			modelPresent: false,
			authRequired: false,
			compatibility: compat,
			checkedAt,
			timingMs,
			inventoryShape: "unknown",
			baseUrl: base,
		};
	}

	let modelsListed: string[] = [];
	let modelPresent = false;
	let inventoryShape: "openai" | "ollama" | "unknown" = "unknown";
	try {
		const body = (await response.json()) as { data?: unknown; models?: unknown };
		// Common shapes: { data: [{ id }] } (OpenAI), { models: [{ name }] } (Ollama/others).
		if (Array.isArray(body.data)) {
			inventoryShape = "openai";
			modelsListed = body.data
				.map((m) =>
					typeof m === "object" && m !== null
						? ((m as { id?: string }).id ?? (m as { name?: string }).name ?? "")
						: "",
				)
				.filter((s) => typeof s === "string" && s.length > 0);
		} else if (Array.isArray(body.models)) {
			inventoryShape = "ollama";
			modelsListed = body.models
				.map((m) =>
					typeof m === "object" && m !== null
						? ((m as { name?: string }).name ?? (m as { id?: string }).id ?? "")
						: "",
				)
				.filter((s) => typeof s === "string" && s.length > 0);
		}
		modelPresent = modelsListed.some(
			(m) =>
				m.toLowerCase() === profile.modelId.toLowerCase() ||
				m.toLowerCase().includes(profile.modelId.toLowerCase()),
		);
	} catch {
		// Malformed response: treat as unknown models, still reachable.
	}

	// Honest compatibility: reachable OpenAI-compatible endpoint implies the
	// completion path exists, but tool-calling / streaming are NOT assumed.
	const health: ProviderHealth = modelPresent ? "AVAILABLE" : "MODEL_MISSING";
	compat.completion = true;
	compat.untested = [
		"streaming",
		"multiTurn",
		"toolCalling",
		"structuredOutput",
		"cancellation",
		"usageReporting",
	].filter((c) => !compat[c as keyof ProviderCompatibilityResult]);

	return {
		health,
		summary: `Endpoint reachable (HTTP ${response.status}). Models listed: ${modelsListed.length}. Model "${profile.modelId}" present: ${modelPresent}.`,
		baseUrlReachable: true,
		modelsListed,
		modelPresent,
		authRequired: false,
		compatibility: compat,
		checkedAt,
		timingMs,
		inventoryShape,
		baseUrl: base,
	};
}

function emptyCompatibility(): ProviderCompatibilityResult {
	return {
		completion: false,
		streaming: false,
		multiTurn: false,
		toolCalling: false,
		structuredOutput: false,
		cancellation: false,
		usageReporting: false,
		untested: [
			"completion",
			"streaming",
			"multiTurn",
			"toolCalling",
			"structuredOutput",
			"cancellation",
			"usageReporting",
		],
	};
}

export { noSecrets };
