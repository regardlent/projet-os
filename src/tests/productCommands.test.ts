import test from "node:test";
import assert from "node:assert/strict";
import { docsHandler, projectHandler } from "../projects/ProductCommands.js";

test("docsHandler returns navigation sources for a domain", () => {
	const r = docsHandler({ args: ["", "swiss football league"], flags: {} }, { activeProject: { slug: "demo", projectId: "p1", workspaceRoot: "w" } });
	assert.equal(r.ok, true);
	assert.equal(r.command, "docs");
	assert.ok(r.message.includes("football.example.com"));
});

test("docsHandler honors --category filter", () => {
	const r = docsHandler({ args: ["", "football"], flags: { category: "STANDINGS" } }, { activeProject: null });
	assert.equal(r.ok, true);
	assert.ok(r.message.toLowerCase().includes("standings"));
});

test("projectHandler returns NOT_FOUND for unknown slug", () => {
	const r = projectHandler({ args: ["nope"], flags: {} }, { activeProject: null, registry: { get: () => undefined } });
	assert.equal(r.ok, false);
	assert.equal(r.status, "NOT_FOUND");
});

test("projectHandler returns project status summary", () => {
	const m = { slug: "demo", projectType: "cpp", status: "READY", goal: { status: "ACTIVE", progress: 90, objective: "Observe a league" } } as never;
	const r = projectHandler({ args: ["demo"], flags: {} }, { activeProject: { slug: "demo", projectId: "p1", workspaceRoot: "w" }, registry: { get: () => m } });
	assert.equal(r.ok, true);
	assert.ok(r.message.includes("cpp"));
	assert.ok(r.message.includes("progress=90"));
});
