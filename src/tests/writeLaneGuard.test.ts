import test from "node:test";
import assert from "node:assert";
import { guardWrite, sflRequiredSymbols } from "../projects/WriteLaneGuard.js";

test("WriteLaneGuard: refuses a destructive rewrite that removes required symbols", () => {
	const ok = guardWrite(() => ({ ok: true }));
	const r = ok({ path: "src/sfl_model.hpp", content: "class SFLModel { };", requiredSymbols: sflRequiredSymbols() });
	assert.equal(r.allow, false);
	assert.match(r.reason ?? "", /REGRESSION_MISSING_SYMBOLS/);
});

test("WriteLaneGuard: refuses a post-gen non-conforming Win32 write", () => {
	const ok = guardWrite(() => ({ ok: true }));
	const r = ok({ path: "x.cpp", content: "HWND h = CreateWindowExW();", hints: ["win32"] });
	assert.equal(r.allow, false);
	assert.match(r.reason ?? "", /POSTGEN_NON_CONFORMANT/);
});

test("WriteLaneGuard: allows a conformant write that keeps required symbols", () => {
	let written = false;
	const ok = guardWrite((/* path */ _p, /* content */ _c) => { written = true; return { ok: true }; });
	const content = "namespace sfl { struct Team{}; struct League{}; int topScorer(){return 0;} int leader(){return 0;} int standings(){return 0;} int seasonTotals(){return 0;} int formOf(){return 0;} }";
	const r = ok({ path: "src/sfl_model.hpp", content, requiredSymbols: sflRequiredSymbols() });
	assert.equal(r.allow, true);
	assert.equal(written, true);
});

test("sflRequiredSymbols covers the core API", () => {
	const s = sflRequiredSymbols();
	assert.ok(s.includes("topScorer") && s.includes("seasonTotals") && s.includes("formOf"));
});
