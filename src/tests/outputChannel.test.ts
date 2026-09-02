import { test } from "node:test";
import assert from "node:assert/strict";
import { StructuredLogger, defaultRedactor } from "../observability/OutputChannel.js";
import { ProductionLogger } from "../observability/ProductionLogger.js";

test("defaultRedactor masks bearer tokens", () => {
	const out = defaultRedactor("Authorization: Bearer abc123def456ghi789");
	assert.equal(out.includes("abc123def456ghi789"), false);
	assert.equal(out.includes("def456"), false);
});

test("defaultRedactor masks api keys and sk- tokens", () => {
	const a = defaultRedactor("key=sk-1234567890abcdef");
	assert.equal(a.includes("sk-1234567890abcdef"), false);
	const b = defaultRedactor("api_key=super-secret-value");
	assert.equal(b, "api_key=***");
});

test("logger applies redaction and level filtering", () => {
	const out: string[] = [];
	const logger = new StructuredLogger((line) => out.push(line), { minLevel: "WARN" });
	logger.info("settings: api_key=abc, debug=on");
	logger.warn("token Bearer xyz123abc456");
	assert.equal(out.length, 1);
	assert.ok(out[0].startsWith("[WARN]"));
	assert.equal(out[0].includes("xyz123abc456"), false);
});

test("logger discards debug when minLevel is INFO", () => {
	const out: string[] = [];
	const logger = new StructuredLogger((line) => out.push(line), { minLevel: "INFO" });
	logger.debug("noise");
	assert.equal(out.length, 0);
});

test("ProductionLogger propagates correlation/job/project/run ids in meta", () => {
	const out: string[] = [];
	const logger = new ProductionLogger((line) => out.push(line), { minLevel: "INFO", correlation: { correlationId: "c1", jobId: "j1", projectId: "p1", runId: "r1" } });
	logger.info("task started");
	assert.equal(out.length, 1);
	assert.ok(out[0].includes("correlationId"));
	assert.ok(out[0].includes("c1"));
	assert.ok(out[0].includes("jobId"));
	assert.ok(out[0].includes("j1"));
	assert.ok(out[0].includes("projectId"));
	assert.ok(out[0].includes("p1"));
	assert.ok(out[0].includes("runId"));
	assert.ok(out[0].includes("r1"));
});

test("ProductionLogger redacts secrets in interpolated meta", () => {
	const out: string[] = [];
	const logger = new ProductionLogger((line) => out.push(line), { minLevel: "INFO", correlation: { jobId: "j" } });
	logger.info("x", { token: "sk-abc1234567890" });
	assert.equal(out[0].includes("sk-abc1234567890"), false);
});
