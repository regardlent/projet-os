import test from "node:test";
import assert from "node:assert/strict";
import { guardWritePath, buildWriteScope, isSecretFile, isProtectedPath, type WriteOperation } from "../projects/AutonomyWriteScope.js";

const OPS: WriteOperation[] = ["create", "modify", "patch"];

test("guardWritePath blocks traversal ..", () => {
	assert.deepEqual(guardWritePath("C:/ws", "../escape.txt", OPS, "create"), { ok: false, reason: "OUTSIDE" });
	assert.deepEqual(guardWritePath("C:/ws", "../../etc/passwd", OPS, "create"), { ok: false, reason: "OUTSIDE" });
});

test("guardWritePath blocks protected dirs (.git/config, node_modules)", () => {
	assert.deepEqual(guardWritePath("C:/ws", ".git/config", OPS, "create"), { ok: false, reason: "PROTECTED" });
	assert.deepEqual(guardWritePath("C:/ws", "node_modules/x.json", OPS, "create"), { ok: false, reason: "PROTECTED" });
	assert.equal(isProtectedPath("C:/ws", "C:/ws/dist/x.js"), true);
});

test("guardWritePath blocks secret files", () => {
	assert.deepEqual(guardWritePath("C:/ws", "config/.env", OPS, "create"), { ok: false, reason: "SECRET" });
	assert.equal(isSecretFile(".env.prod"), true);
	assert.equal(isSecretFile("keys/id_rsa"), true);
	assert.equal(isSecretFile("src/main.ts"), false);
});

test("guardWritePath enforces allowed operation", () => {
	// Separate literal arrays typed explicitly for the operation-enforcement case.
	assert.deepEqual(guardWritePath("C:/ws", "src/a.ts", ["create"] as WriteOperation[], "delete"), { ok: false, reason: "NOT_ALLOWED" });
	assert.deepEqual(guardWritePath("C:/ws", "src/a.ts", ["create"] as WriteOperation[], "patch"), { ok: false, reason: "NOT_ALLOWED" });
	assert.equal(guardWritePath("C:/ws", "src/a.ts", ["create", "patch", "modify"] as WriteOperation[], "patch").ok, true);
});

test("guardWritePath blocks root itself and absolute write", () => {
	assert.deepEqual(guardWritePath("C:/ws", ".", OPS, "create"), { ok: false, reason: "OUTSIDE" });
	assert.deepEqual(guardWritePath("C:/ws", "C:/other/x.txt", OPS, "create"), { ok: false, reason: "OUTSIDE" });
});

test("buildWriteScope defaults forbid delete and rename and expire", () => {
	const scope = buildWriteScope({ runId: "r", workspaceRoot: "C:/ws", complexity: "small", now: 1000 });
	assert.equal(scope.allowDelete, false);
	assert.equal(scope.allowRename, false);
	assert.equal(scope.expiresAt, 1000 + 60 * 60_000);
	assert.equal(scope.maxFiles, 5);
});
