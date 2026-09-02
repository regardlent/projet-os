import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	normalizeObservations,
	TokenLedger,
	totals,
} from "../tokens/TokenLedger.js";
import type { UsageObservation } from "../tokens/UsageObservation.js";
import { WorkspaceRegistry } from "../tokens/WorkspaceRegistry.js";
import { importHistoricalSessions, developmentStartedAt } from "../tokens/HistoricalUsageImporter.js";
import { formatTokens, formatNumber } from "../tokens/numberFormat.js";
import { estimateTokens } from "../tokens/tokenEstimate.js";
import { CANONICAL_PROJECT_ROOT } from "../workspace/WorkspaceTopology.js";

const OLD_ROOT = "C:\\Users\\eiden\\Desktop\\dev\\legacy\\project-os";

function obs(partial: Partial<UsageObservation> & { observationId: string }): UsageObservation {
	return {
		projectId: "p1",
		workspaceId: "w1",
		workspacePath: CANONICAL_PROJECT_ROOT,
		providerId: "openai-compatible",
		modelId: "qwen3-4b",
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		source: "CLINE_SESSION_RESULT",
		quality: "EXACT",
		scope: "CLINE_SESSION",
		timestamp: 1,
		...partial,
	};
}

function tempDir(): string {
	const d = path.join(os.tmpdir(), `tok-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	fs.mkdirSync(d, { recursive: true });
	return d;
}

test("same correlation counts once with highest precedence source", () => {
	const a = obs({ observationId: "o1", correlationId: "req1", source: "LOCALAI_REQUEST_USAGE", totalTokens: 100 });
	const b = obs({ observationId: "o2", correlationId: "req1", source: "CLINE_SESSION_RESULT", totalTokens: 100 });
	const c = obs({ observationId: "o3", correlationId: "req1", source: "CLINE_ACCUMULATED_USAGE", totalTokens: 100 });
	const norm = normalizeObservations([a, b, c]);
	assert.equal(norm.length, 1);
	assert.equal(norm[0].source, "LOCALAI_REQUEST_USAGE");
	assert.equal(totals(norm).total, 100);
});

test("cumulative snapshots become deltas (100,150,225 -> total 225)", () => {
	const s1 = obs({ observationId: "c1", sessionId: "s", cumulative: true, totalTokens: 100 });
	const s2 = obs({ observationId: "c2", sessionId: "s", cumulative: true, totalTokens: 150 });
	const s3 = obs({ observationId: "c3", sessionId: "s", cumulative: true, totalTokens: 225 });
	const norm = normalizeObservations([s1, s2, s3]);
	assert.equal(totals(norm).total, 225);
	assert.equal(norm.length, 3);
	assert.equal(norm[0].quality, "DERIVED");
	assert.equal(norm[0].totalTokens, 100);
	assert.equal(norm[1].totalTokens, 50);
	assert.equal(norm[2].totalTokens, 75);
});

test("counter reset produces no negative delta", () => {
	const s1 = obs({ observationId: "r1", sessionId: "s", cumulative: true, totalTokens: 100 });
	const s2 = obs({ observationId: "r2", sessionId: "s", cumulative: true, totalTokens: 80 });
	const norm = normalizeObservations([s1, s2]);
	assert.ok(!norm.some((o) => o.totalTokens < 0));
	assert.ok(norm.some((o) => /COUNTER_RESET/.test(o.note ?? "")));
});

test("ledger idempotent record + persistence + raw probe exclusion", () => {
	const dir = tempDir();
	const ledger = new TokenLedger(dir);
	ledger.record(obs({ observationId: "a1", sessionId: "sess-a", totalTokens: 40 }));
	ledger.record(obs({ observationId: "a1", sessionId: "sess-a", totalTokens: 40 }));
	ledger.record(obs({ observationId: "raw1", scope: "RAW_PROBE", totalTokens: 2048 }));
	assert.equal(ledger.totals().total, 40);
	assert.equal(ledger.rawProbeTotals().total, 40 + 2048);
	// Reload.
	const reloaded = new TokenLedger(dir);
	const res = reloaded.load();
	assert.equal(res.loaded, 2);
	assert.equal(totals(reloaded.entries()).total, 40);
	fs.rmSync(dir, { recursive: true, force: true });
});

test("ledger corruption recovery keeps healthy rows", () => {
	const dir = tempDir();
	const ledger = new TokenLedger(dir);
	ledger.record(obs({ observationId: "ok1", totalTokens: 5 }));
	fs.appendFileSync(path.join(dir, "observations.jsonl"), "{\"bad\":true}\n");
	const res = new TokenLedger(dir).load();
	assert.equal(res.loaded, 1);
	assert.ok(res.dropped >= 1);
	fs.rmSync(dir, { recursive: true, force: true });
});

test("workspace alias maps old and new paths to the same project", () => {
	const reg = new WorkspaceRegistry();
	const old = reg.ensureAlias("proj-os", OLD_ROOT);
	const now = reg.ensureAlias("proj-os", CANONICAL_PROJECT_ROOT);
	assert.equal(old.workspaceId, now.workspaceId);
	assert.equal(reg.hasAlias("proj-os", OLD_ROOT, CANONICAL_PROJECT_ROOT), true);
});

test("historical import marks exact vs unknown and matches workspace", () => {
	const reg = new WorkspaceRegistry();
	const { observations, result } = importHistoricalSessions(reg, "proj-os", [
		{ sessionId: "s1", cwd: CANONICAL_PROJECT_ROOT, providerId: "openai-compatible", modelId: "qwen3-4b", startedAt: 10, outputTokens: 500, hasExactUsage: true },
		{ sessionId: "s2", cwd: OLD_ROOT, providerId: "openai-compatible", modelId: "qwen3-4b", startedAt: 11, outputTokens: 0, hasExactUsage: false },
	]);
	assert.equal(result.imported, 2);
	assert.equal(result.exact, 1);
	assert.equal(result.unknown, 1);
	const unk = observations.find((o) => o.sessionId === "s2");
	assert.equal(unk?.note, "SDK_USAGE_GAP");
	assert.equal(unk?.quality, "UNKNOWN");
});

test("raw probe is excluded from project totals", () => {
	const raw = obs({ observationId: "rp", scope: "RAW_PROBE", totalTokens: 2048 });
	const session = obs({ observationId: "sx", totalTokens: 100 });
	assert.equal(totals([raw, session]).total, 100);
});

test("number formatting", () => {
	assert.equal(formatTokens(999), "999");
	assert.equal(formatTokens(1200), "1.2k");
	assert.equal(formatTokens(42300), "42.3k");
	assert.equal(formatTokens(1240000), "1.24M");
	assert.equal(formatNumber(1080000000).display, "1.08B");
});

test("development started at uses earliest reliable evidence only", () => {
	assert.equal(developmentStartedAt([]), undefined);
	assert.equal(developmentStartedAt([200, 100, 150]), 100);
});

test("local estimate is always > 0 for real text and ESTIMATED quality only", () => {
	assert.equal(estimateTokens(""), 0);
	const n = estimateTokens("Réponds exactement par: LOCALAI_CLINE_OK");
	assert.ok(n > 0);
	const long = estimateTokens("x".repeat(1200));
	assert.ok(long >= 250);
});
