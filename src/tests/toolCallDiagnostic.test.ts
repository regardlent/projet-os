import { test } from "node:test";
import assert from "node:assert/strict";
import {
	classifyRawToolProbe,
	isLikelyReasoningBudgetExhaustion,
	interpretRawToolMatrix,
	type RawToolProbeResult,
} from "../routing/ToolCallDiagnostic.js";

test("classifyRawToolProbe: pass requires tool calls", () => {
	assert.equal(classifyRawToolProbe({ finishReason: "tool_calls", hasToolCalls: true, toolCallsCount: 1, contentLength: 0 }), "RAW_TOOL_PASS");
	assert.equal(classifyRawToolProbe({ finishReason: "length", hasToolCalls: true, toolCallsCount: 0, contentLength: 200 }), "RAW_TOOL_MALFORMED");
	assert.equal(classifyRawToolProbe({ finishReason: "length", hasToolCalls: false, toolCallsCount: 0, contentLength: 9000 }), "RAW_TOOL_NO_CALL");
});

test("H1 candidate only when stopped at length with large content and no expanded budget", () => {
	// Phase 8 CONTROL: came back at length, 9k content, no tool call -> candidate for H1.
	const control: RawToolProbeResult = { finishReason: "length", hasToolCalls: false, toolCallsCount: 0, contentLength: 9049 };
	assert.equal(isLikelyReasoningBudgetExhaustion(control), true);

	// LARGER_OUTPUT: finish=stop, 46k content, no tool call -> H1 disproven.
	const larger: RawToolProbeResult = { finishReason: "stop", hasToolCalls: false, toolCallsCount: 0, contentLength: 46218, largerOutputBudgetUsed: true, maxTokens: 12000 };
	assert.equal(isLikelyReasoningBudgetExhaustion(larger), false);
});

test("interpretRawToolMatrix reflects the observed qwen matrix", () => {
	const control: RawToolProbeResult = { finishReason: "length", hasToolCalls: false, toolCallsCount: 0, contentLength: 9049 };
	const noThink: RawToolProbeResult = { finishReason: "length", hasToolCalls: false, toolCallsCount: 0, contentLength: 9524, reasoningDisabledAttempted: true };
	const larger: RawToolProbeResult = { finishReason: "stop", hasToolCalls: false, toolCallsCount: 0, contentLength: 46218, largerOutputBudgetUsed: true, maxTokens: 12000 };
	assert.match(interpretRawToolMatrix([control, noThink, larger]), /H1 disproven/);
});
