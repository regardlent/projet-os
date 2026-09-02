/**
 * RegressionEngine (Phase 24, W05). Uniform validation infra: test manifest, group
 * snapshots (before/after), count-drift guard, failed-test classification and flaky
 * detection. Pure + testable. Never guesses; classification is heuristic over observed
 * outcomes and is labeled as such.
 */
export type TestGroup = "unit" | "integration" | "security" | "cpp" | "bridge";
export type TestState = "PASS" | "FAIL" | "NOT_RUN";

export interface TestRecord {
	id: string;
	group: TestGroup;
	state: TestState;
	durationMs?: number;
}

export interface Snapshot {
	label: string;
	records: TestRecord[];
	takenAt: number;
}

export interface RegressionReport {
	totalBefore: number;
	totalAfter: number;
	countDelta: number;
	regressionCount: number;
	failures: { id: string; group: TestGroup }[];
	flaky: { id: string; group: TestGroup }[];
	countDrift: boolean;
	verdict: "PASS" | "WARN" | "FAIL";
}

/** Compare a baseline snapshot with a current snapshot and produce a regression report. */
export function diffSnapshots(before: Snapshot, after: Snapshot): RegressionReport {
	const beforeById = new Map(before.records.map((r) => [r.id, r]));

	const failures: { id: string; group: TestGroup }[] = [];
	const flaky: { id: string; group: TestGroup }[] = [];
	let regressionCount = 0;

	for (const a of after.records) {
		const b = beforeById.get(a.id);
		if (!b) continue; // new test (not a regression)
		if (a.state === "FAIL") {
			failures.push({ id: a.id, group: a.group });
			if (b.state !== "FAIL") regressionCount++;
		} else if (a.state === "PASS" && b.state === "FAIL") {
			// Heuristic: previously failing, now passing — candidate flaky (now green).
			flaky.push({ id: a.id, group: a.group });
		}
	}

	const totalBefore = before.records.length;
	const totalAfter = after.records.length;
	const countDelta = totalAfter - totalBefore;
	const countDrift = totalAfter < totalBefore;

	let verdict: RegressionReport["verdict"] = "PASS";
	if (regressionCount > 0) verdict = "FAIL";
	else if (countDrift || flaky.length > 0) verdict = "WARN";

	return { totalBefore, totalAfter, countDelta, regressionCount, failures, flaky, countDrift, verdict };
}

/** Classify failures by group (heuristic; evidence-based only). */
export function classifyFailures(records: TestRecord[]): { group: TestGroup; count: number }[] {
	const counts = new Map<TestGroup, number>();
	for (const r of records) if (r.state === "FAIL") counts.set(r.group, (counts.get(r.group) ?? 0) + 1);
	return [...counts.entries()].map(([group, count]) => ({ group, count }));
}

/** Build a snapshot from a list of records. */
export function makeSnapshot(label: string, records: TestRecord[]): Snapshot {
	return { label, records: records.slice(), takenAt: Date.now() };
}
