import test from "node:test";
import assert from "node:assert/strict";
import { classifyFailure } from "../projects/FailureRecovery.js";

test("GPU/VRAM failure -> GPU_RUNTIME boundary, no CPU fallback", () => {
	const v = classifyFailure({ kind: "GPU_RUNTIME", message: "CUDA out of memory, free VRAM 422 MiB" });
	assert.equal(v.boundary, "GPU_RUNTIME");
	assert.equal(v.action, "RELOAD_GPU_CONFIG");
	assert.equal(v.safe, true);
	assert.match(v.reason, /Never CPU fallback/);
});

test("provider/cloud failure -> PROVIDER boundary, no cloud fallback", () => {
	const v = classifyFailure({ kind: "provider", message: "Endpoint https://api.openai.com returned 401" });
	assert.equal(v.boundary, "PROVIDER");
	assert.equal(v.action, "RELOAD_PROVIDER");
	assert.match(v.reason, /no cloud fallback/);
});

test("write/approval denial -> SECURITY boundary, never bypass", () => {
	const v = classifyFailure({ kind: "write", message: "Write denied: path traversal blocked" });
	assert.equal(v.boundary, "SECURITY");
	assert.equal(v.action, "REVIEW_GUARDS");
	assert.match(v.reason, /never bypass/);
});

test("persistence corruption -> RESTORE_FROM_BACKUP, never fatal", () => {
	const v = classifyFailure({ kind: "registry", message: "corrupt index.json" });
	assert.equal(v.boundary, "PERSISTENCE");
	assert.equal(v.action, "RESTORE_FROM_BACKUP");
	assert.match(v.reason, /never fatal/);
});

test("unclassified -> HUMAN escalation (safe:false), never a PASS", () => {
	const v = classifyFailure({ kind: "mystery", message: "unexplained" });
	assert.equal(v.boundary, "OTHER");
	assert.equal(v.action, "ESCALATE_HUMAN");
	assert.equal(v.safe, false);
	assert.match(v.reason, /do not guess/);
});
