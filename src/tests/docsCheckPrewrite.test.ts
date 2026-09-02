import test from "node:test";
import assert from "node:assert";
import { buildPrewritePrompt, prewriteCoverage, prewriteUserMessage } from "../projects/DocsCheckPrewrite.js";

test("prewrite: injects official doc context before the task (C++/Win32)", () => {
	const r = buildPrewritePrompt("Create a Win32 window in C++", ["cpp"]);
	assert.equal(r.coverage, true);
	assert.ok(r.injectedDocs.length >= 1);
	assert.ok(r.prompt.startsWith("## Official documentation"));
	assert.ok(r.prompt.includes("https://en.cppreference.com"));
	assert.ok(r.prompt.includes("## Task"));
	assert.ok(r.prompt.includes("Create a Win32 window in C++"));
});

test("prewrite: LocalAI task surfaces official LocalAI docs", () => {
	const r = buildPrewritePrompt("Call LocalAI /backend/load from TypeScript", ["ts"]);
	assert.ok(r.injectedDocs.some((d) => d.label.includes("LocalAI")));
	assert.equal(r.coverage, true);
});

test("prewrite: unknown task has no coverage (conservative)", () => {
	const r = prewriteCoverage("completely generic", []);
	assert.equal(r.coverage, false);
	assert.deepEqual(r.markers, []);
	const p = buildPrewritePrompt("completely generic", []);
	assert.equal(p.coverage, false);
});

test("prewrite: token overhead stays bounded", () => {
	const r = buildPrewritePrompt("Build a React + TypeScript component with Node and Docker", ["react", "ts"], 4);
	assert.ok(r.tokenOverhead > 0 && r.tokenOverhead < 200);
	assert.ok(r.injectedDocs.length <= 4);
});

test("prewriteUserMessage returns the enriched message + overhead", () => {
	const m = prewriteUserMessage("Write a CMake build for a C++ project", ["cpp"]);
	assert.ok(m.message.length > 0);
	assert.ok(m.overhead > 0);
	assert.ok(m.message.includes("## Official documentation"));
});
