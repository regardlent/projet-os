import test from "node:test";
import assert from "node:assert";
import { refreshSequence, cursorUp, blockReady, dashboardLineCount } from "../projects/LiveDashboard.js";
import type { DashSnapshot } from "../projects/DashboardRenderer.js";

function snap(over: Partial<DashSnapshot> = {}): DashSnapshot {
	return { title: "LIVE", kv: [{ key: "Status", value: "OK" }], progressPct: 50, todo: [{ key: "a", label: "GATE_5", state: "in_progress" }], ...over };
}

test("live: first draw has no cursor movement (previousLines=0)", () => {
	const s = snap();
	const { block } = blockReady(s);
	assert.equal(refreshSequence(0, block), block); // no \x1b[...A prefix
	assert.ok(!block.includes("\x1b"));
});

test("live: subsequent refresh moves cursor up by previous line count", () => {
	const s = snap();
	const { block, lines } = blockReady(s);
	assert.ok(lines >= 1);
	const seq = refreshSequence(lines, block);
	assert.ok(seq.startsWith(`\x1b[${lines}A`));
	assert.ok(seq.includes("\x1b[2K")); // clear-line per row
});

test("live: cursorUp and lineCount helpers", () => {
	assert.equal(cursorUp(3), "\x1b[3A");
	assert.equal(cursorUp(0), "\x1b[0A");
	assert.equal(dashboardLineCount(snap()), snapshotLines(snap()));
});

// helper to avoid recomputing render
function snapshotLines(s: DashSnapshot): number {
	return blockReady(s).lines;
}
