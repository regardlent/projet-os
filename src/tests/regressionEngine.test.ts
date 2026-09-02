import test from "node:test";
import assert from "node:assert/strict";
import { makeSnapshot, diffSnapshots, classifyFailures, type TestRecord } from "../projects/RegressionEngine.js";

function recs(ids: string[], group: "unit" | "security" | "cpp" = "unit", states: TestRecord["state"][] = []): TestRecord[] {
	return ids.map((id, i) => ({ id, group, state: states[i] ?? "PASS", durationMs: 10 }));
}

test("identical snapshots => PASS, no regression", () => {
	const before = makeSnapshot("b", recs(["a", "b", "c"]));
	const after = makeSnapshot("a", recs(["a", "b", "c"]));
	const rep = diffSnapshots(before, after);
	assert.equal(rep.verdict, "PASS");
	assert.equal(rep.regressionCount, 0);
	assert.equal(rep.countDelta, 0);
});

test("a previously-passing test now failing => FAIL regression", () => {
	const before = makeSnapshot("b", recs(["a", "b", "c"]));
	const after = makeSnapshot("a", recs(["a", "b", "c"], "unit", ["PASS", "FAIL", "PASS"]));
	const rep = diffSnapshots(before, after);
	assert.equal(rep.verdict, "FAIL");
	assert.equal(rep.regressionCount, 1);
	assert.equal(rep.failures.length, 1);
	assert.equal(rep.failures[0].id, "b");
});

test("test count drop => WARN (count drift)", () => {
	const before = makeSnapshot("b", recs(["a", "b", "c"]));
	const after = makeSnapshot("a", recs(["a", "b"]));
	const rep = diffSnapshots(before, after);
	assert.equal(rep.countDrift, true);
	assert.equal(rep.verdict, "WARN");
});

test("previously failing now passing => flaky candidate", () => {
	const before = makeSnapshot("b", recs(["a", "b"], "unit", ["FAIL", "PASS"]));
	const after = makeSnapshot("a", recs(["a", "b"], "unit", ["PASS", "PASS"]));
	const rep = diffSnapshots(before, after);
	assert.equal(rep.flaky.length, 1);
	assert.equal(rep.flaky[0].id, "a");
	assert.equal(rep.verdict, "WARN");
});

test("new tests increase count with no regression => PASS", () => {
	const before = makeSnapshot("b", recs(["a"]));
	const after = makeSnapshot("a", recs(["a", "new1", "new2"]));
	const rep = diffSnapshots(before, after);
	assert.equal(rep.countDelta, 2);
	assert.equal(rep.verdict, "PASS");
});

test("classifyFailures groups failures", () => {
	const r: TestRecord[] = [
		{ id: "x", group: "security", state: "FAIL" },
		{ id: "y", group: "unit", state: "FAIL" },
		{ id: "z", group: "unit", state: "PASS" },
	];
	const cls = classifyFailures(r);
	assert.deepEqual(cls.sort((a, b) => a.group.localeCompare(b.group)), [
		{ group: "security", count: 1 },
		{ group: "unit", count: 1 },
	]);
});
