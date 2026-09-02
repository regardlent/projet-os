import test from "node:test";
import assert from "node:assert";
import { adviseCoding, detectMarkers, DOC_INDEX } from "../projects/DocsCodingAdviser.js";

test("detectMarkers: a C++/Win32 task surfaces cpp + win32 + cmake", () => {
	const m = detectMarkers("Build a Win32 GUI in C++ with a CMake build and ctest", ["cpp"]);
	assert.ok(m.includes("cpp"));
	assert.ok(m.includes("win32"));
	assert.ok(m.includes("cmake"));
});

test("detectMarkers: LocalAI + TS task", () => {
	const m = detectMarkers("call LocalAI /backend/load from TypeScript", ["ts"]);
	assert.ok(m.includes("localai"));
	assert.ok(m.includes("typescript"));
});

test("adviseCoding returns official docs (authority=official) + a hint", () => {
	const a = adviseCoding("Write a Win32 window in C++", ["cpp"]);
	assert.ok(a.docs.length >= 1);
	assert.equal(a.primaryDoc?.authority, "official");
	assert.match(a.hint, /official/i);
	assert.match(a.primaryDoc?.url ?? "", /https:\/\//);
});

test("ADVISE: every doc index entry has official/vendor authority and https url", () => {
	for (const refs of Object.values(DOC_INDEX)) {
		for (const r of refs) {
			assert.ok(r.authority === "official" || r.authority === "vendor");
			assert.match(r.url, /^https:\/\//);
			assert.ok(r.url.includes(".") || r.url.includes("org"));
		}
	}
});

test("adviseCoding: unmatched task still yields a conservative hint", () => {
	const a = adviseCoding("do something generic", []);
	assert.equal(a.primaryDoc, null);
	assert.equal(a.confidence, "medium");
	assert.match(a.hint, /official/i);
});
