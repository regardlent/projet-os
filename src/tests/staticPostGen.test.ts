import test from "node:test";
import assert from "node:assert";
import { postGenCheck, OFFICIAL_SIGNATURES } from "../projects/StaticPostGen.js";

test("postgen: flags an under-specified Win32 CreateWindowEx (blocking)", () => {
	const code = "HWND h = CreateWindowExW();";
	const r = postGenCheck(code, ["win32"]);
	assert.equal(r.conformant, false);
	assert.ok(r.findings.some((f) => f.api === "CreateWindowEx" && f.blocking));
});

test("postgen: a well-formed CMake target_link_libraries is conformant", () => {
	const code = "target_link_libraries(futtable PRIVATE user32 gdi32 comctl32);";
	const r = postGenCheck(code, ["cmake"]);
	assert.ok(r.findings.some((f) => f.api === "target_link_libraries"));
});

test("postgen: LocalAI backend/load is matched", () => {
	const code = "POST /backend/load {model:'granite-4.2-3b-flash'}";
	const r = postGenCheck(code, ["localai"]);
	assert.ok(r.findings.some((f) => f.api === "backend/load"));
	assert.equal(r.checkedSignatures >= 1, true);
});

test("postgen: unrelated code yields no findings (no false positives)", () => {
	const r = postGenCheck("int x = 42; std::cout << x;", ["cpp"]);
	assert.equal(r.findings.length, 0);
	assert.equal(r.conformant, true);
});

test("postgen: every official signature has https official source", () => {
	for (const s of OFFICIAL_SIGNATURES) {
		assert.match(s.officialSource, /^https:\/\//);
		assert.ok(s.pattern instanceof RegExp);
		assert.ok(s.correct.length > 0);
	}
});
