import test from "node:test";
import assert from "node:assert";
import { guardWrite, demoRequiredSymbols } from "../projects/WriteLaneGuard.js";

test("WriteLaneGuard: refuses a destructive rewrite that removes required symbols", () => {
	const ok = guardWrite(() => ({ ok: true }));
	const r = ok({ path: "src/demo_model.hpp", content: "class DemoModel { };", requiredSymbols: demoRequiredSymbols() });
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
	const content = "namespace demo { struct Model{}; struct Config{}; int render(){return 0;} int load(){return 0;} int save(){return 0;} int validate(){return 0;} int main(){return 0;} }";
	const r = ok({ path: "src/demo_model.hpp", content, requiredSymbols: demoRequiredSymbols() });
	assert.equal(r.allow, true);
	assert.equal(written, true);
});

test("demoRequiredSymbols covers the core API", () => {
	const s = demoRequiredSymbols();
	assert.ok(s.includes("render") && s.includes("validate") && s.includes("main"));
});
