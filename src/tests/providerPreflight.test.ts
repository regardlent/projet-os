import { test } from "node:test";
import assert from "node:assert/strict";
import { runProviderPreflight, type FetchLike } from "../runtime/ProviderPreflight.js";

function fakeFetch(status: number, body?: unknown): FetchLike {
	return (async () => ({
		ok: status >= 200 && status < 300,
		status,
		text: async () => JSON.stringify(body ?? {}),
		json: async () => body ?? {},
	})) as FetchLike;
}

function errFetch(): FetchLike {
	return (async () => {
		throw new Error("ECONNREFUSED");
	}) as unknown as FetchLike;
}

test("no base URL => MISCONFIGURED", async () => {
	const res = await runProviderPreflight(
		{ type: "openai-compatible", providerId: "local", modelId: "qwen", hasCredential: false },
		fakeFetch(200),
	);
	assert.equal(res.health, "MISCONFIGURED");
});

test("unreachable endpoint => UNAVAILABLE", async () => {
	const res = await runProviderPreflight(
		{ type: "openai-compatible", providerId: "local", modelId: "qwen", baseUrl: "http://localhost:1/v1", hasCredential: false },
		errFetch(),
	);
	assert.equal(res.health, "UNAVAILABLE");
});

test("auth status => AUTH_REQUIRED", async () => {
	const res = await runProviderPreflight(
		{ type: "openai-compatible", providerId: "local", modelId: "qwen", baseUrl: "http://localhost:1/v1", hasCredential: false },
		fakeFetch(401),
	);
	assert.equal(res.health, "AUTH_REQUIRED");
	assert.equal(res.authRequired, true);
});

test("model present => AVAILABLE, but tool calling not assumed", async () => {
	const res = await runProviderPreflight(
		{ type: "openai-compatible", providerId: "local", modelId: "gpt-4", baseUrl: "http://localhost:1/v1", hasCredential: false },
		fakeFetch(200, { data: [{ id: "gpt-4" }, { id: "gpt-3.5" }] }),
	);
	assert.equal(res.health, "AVAILABLE");
	assert.equal(res.modelPresent, true);
	assert.equal(res.compatibility.completion, true);
	assert.equal(res.compatibility.toolCalling, false);
	assert.ok(res.compatibility.untested.includes("toolCalling"));
});

test("model missing => MODEL_MISSING", async () => {
	const res = await runProviderPreflight(
		{ type: "openai-compatible", providerId: "local", modelId: "gpt-5", baseUrl: "http://localhost:1/v1", hasCredential: false },
		fakeFetch(200, { data: [{ id: "gpt-4" }] }),
	);
	assert.equal(res.health, "MODEL_MISSING");
});

test("openai inventory reports latency + shape", async () => {
	let resolve: ((v: unknown) => void) | undefined;
	const p = new Promise((r) => { resolve = r; });
	const fetchDelay: FetchLike = (async () => {
		await p;
		return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: "qwen3-4b" }, { id: "tts-1" }] }), json: async () => ({ data: [{ id: "qwen3-4b" }, { id: "tts-1" }] }) };
	}) as unknown as FetchLike;
	const start = Date.now();
	const resPromise = runProviderPreflight({ type: "openai-compatible", providerId: "local", modelId: "qwen3-4b", baseUrl: "http://127.0.0.1:8080/v1", hasCredential: false }, fetchDelay);
	await new Promise((r) => setTimeout(r, 20));
	resolve!(undefined);
	const res = await resPromise;
	const elapsed = Date.now() - start;
	assert.equal(res.inventoryShape, "openai");
	assert.equal(res.modelPresent, true);
	assert.equal(res.health, "AVAILABLE");
	assert.ok(typeof res.timingMs === "number" && res.timingMs >= 20);
	assert.equal(res.baseUrl, "http://127.0.0.1:8080/v1");
	assert.ok(elapsed >= 20);
});

test("ollama inventory shape is detected", async () => {
	const res = await runProviderPreflight(
		{ type: "openai-compatible", providerId: "local", modelId: "llama", baseUrl: "http://localhost:1/v1", hasCredential: false },
		fakeFetch(200, { models: [{ name: "llama3" }] }),
	);
	assert.equal(res.inventoryShape, "ollama");
	assert.equal(res.modelPresent, true);
});

test("unreachable endpoint reports null timing + unknown shape", async () => {
	const res = await runProviderPreflight(
		{ type: "openai-compatible", providerId: "local", modelId: "qwen", baseUrl: "http://localhost:1/v1", hasCredential: false },
		errFetch(),
	);
	assert.equal(res.health, "UNAVAILABLE");
	assert.equal(res.timingMs, null);
	assert.equal(res.inventoryShape, "unknown");
});
