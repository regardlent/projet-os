import test from "node:test";
import assert from "node:assert";
import { renderDashboard, fmtMs, dashboardHealthy, type DashSnapshot } from "../projects/DashboardRenderer.js";

function snap(over: Partial<DashSnapshot> = {}): DashSnapshot {
	return {
		title: "ENDURANCE LAB",
		subtitle: "run-60min — granite-4.2-3b-flash",
		kv: [{ key: "Status", value: "PASS (5/10/20/30)" }, { key: "Current", value: "GATE_5 60min" }],
		progressPct: 19,
		todo: [{ key: "a", label: "GATE_1 5min", state: "done" }, { key: "b", label: "GATE_5 60min", state: "in_progress" }],
		footerLines: ["Verdict: IN_PROGRESS"],
		elapsedMs: 692000,
		...over,
	};
}

test("dashboard: fixed layout includes title, k/v, progress, struck todo, footer", () => {
	const d = renderDashboard(snap());
	assert.match(d, /ENDURANCE LAB/);
	assert.match(d, /Status\s+: PASS/);
	assert.match(d, /19%/);
	assert.match(d, /- \[x\] ~GATE_1 5min~/);
	assert.match(d, /- \[~\] GATE_5 60min/);
	assert.match(d, /— Verdict: IN_PROGRESS/);
	assert.match(d, /⏱ elapsed: 11m 32s/);
});

test("dashboard: fmtMs formats durations", () => {
	assert.equal(fmtMs(0), "0s");
	assert.equal(fmtMs(65000), "1m 5s");
	assert.equal(fmtMs(3700000), "1h 1m 40s");
});

test("dashboard: watchdog flags healthy vs unhealthy", () => {
	assert.equal(dashboardHealthy(snap()).ok, true);
	assert.equal(dashboardHealthy(snap({ progressPct: 140 })).ok, false); // out of range
	assert.equal(dashboardHealthy(snap({ title: "" })).ok, false); // missing title
	assert.equal(dashboardHealthy(snap({ kv: [] })).ok, false); // no rows
});
