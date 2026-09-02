import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCoreEvent } from "../cline/RuntimeEventNormalizer.js";
import type { CoreSessionEvent } from "@cline/sdk";

const NOW = 1000;

test("chunk event maps to assistant_delta", () => {
	const evt = {
		type: "chunk",
		payload: { sessionId: "s1", stream: "agent", chunk: "Hello ", ts: 0 },
	} as CoreSessionEvent;
	const out = normalizeCoreEvent(evt, NOW);
	assert.equal(out.length, 1);
	assert.equal(out[0].type, "assistant_delta");
	assert.equal((out[0] as { text: string }).text, "Hello ");
});

test("hook tool_call maps to tool_started", () => {
	const evt = {
		type: "hook",
		payload: { sessionId: "s2", hookEventName: "tool_call", toolName: "read_files" },
	} as CoreSessionEvent;
	const out = normalizeCoreEvent(evt, NOW);
	assert.deepEqual(out, [
		{ type: "tool_started", agentId: "s2", toolName: "read_files", at: NOW },
	]);
});

test("hook tool_result maps to tool_finished ok", () => {
	const evt = {
		type: "hook",
		payload: { sessionId: "s3", hookEventName: "tool_result", toolName: "read_files" },
	} as CoreSessionEvent;
	const out = normalizeCoreEvent(evt, NOW);
	assert.deepEqual(out, [
		{ type: "tool_finished", agentId: "s3", toolName: "read_files", ok: true, at: NOW },
	]);
});

test("hook agent_error maps to tool_failed", () => {
	const evt = {
		type: "hook",
		payload: { sessionId: "s4", hookEventName: "agent_error", toolName: "bash" },
	} as CoreSessionEvent;
	const out = normalizeCoreEvent(evt, NOW);
	assert.equal(out[0].type, "tool_failed");
});

test("ended maps to session_ended with reason", () => {
	const evt = {
		type: "ended",
		payload: { sessionId: "s5", reason: "completed", ts: 0 },
	} as CoreSessionEvent;
	const out = normalizeCoreEvent(evt, NOW);
	assert.deepEqual(out, [
		{ type: "session_ended", agentId: "s5", reason: "completed", at: NOW },
	]);
});

test("status maps to status", () => {
	const evt = { type: "status", payload: { sessionId: "s6", status: "running" } } as CoreSessionEvent;
	const out = normalizeCoreEvent(evt, NOW);
	assert.deepEqual(out, [{ type: "status", agentId: "s6", status: "running", at: NOW }]);
});

test("agent_end hook emits nothing (no fake event)", () => {
	const evt = {
		type: "hook",
		payload: { sessionId: "s7", hookEventName: "agent_end" },
	} as CoreSessionEvent;
	const out = normalizeCoreEvent(evt, NOW);
	assert.deepEqual(out, []);
});

test("unknown discriminant never re-broadcasts", () => {
	const evt = { type: "does_not_exist" } as unknown as CoreSessionEvent;
	const out = normalizeCoreEvent(evt, NOW);
	assert.deepEqual(out, []);
});
