import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ArtifactStore } from "../artifacts/ArtifactStore.js";
import { ArtifactRegistry } from "../artifacts/ArtifactRegistry.js";

function tempDir(): string {
	const dir = path.join(os.tmpdir(), `pos-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

test("create + transition + comment + version tracking", () => {
	const dir = tempDir();
	const registry = new ArtifactRegistry(new ArtifactStore(dir));
	const rec = registry.create({
		type: "implementation_plan",
		title: "Plan",
		content: "# Plan",
	});
	assert.equal(rec.version, 1);
	assert.equal(rec.status, "DRAFT");

	const reviewed = registry.requestReview(rec.id);
	assert.equal(reviewed.status, "READY_FOR_REVIEW");

	const approved = registry.approve(rec.id);
	assert.equal(approved.status, "APPROVED");

	const withComment = registry.addComment(rec.id, "tester", "looks good");
	assert.equal(withComment.comments.length, 1);
	assert.equal(withComment.comments[0].author, "tester");

	const v2 = registry.updateContent(rec.id, "# Plan v2");
	assert.equal(v2.version, 2);
	assert.equal(v2.sha256.length, 64);
	fs.rmSync(dir, { recursive: true, force: true });
});

test("invalid transition throws and does not mutate", () => {
	const dir = tempDir();
	const registry = new ArtifactRegistry(new ArtifactStore(dir));
	const rec = registry.create({ type: "markdown", title: "T", content: "x" });
	assert.throws(() => registry.transition(rec.id, "VERIFIED"), /Invalid artifact transition/);
	assert.equal(registry.get(rec.id)?.status, "DRAFT");
	fs.rmSync(dir, { recursive: true, force: true });
});

test("persistence survives reload", () => {
	const dir = tempDir();
	const registry = new ArtifactRegistry(new ArtifactStore(dir));
	const rec = registry.create({
		type: "code_diff",
		title: "Diff",
		content: "diff a b",
		sourceFiles: ["src/a.ts"],
	});
	registry.requestReview(rec.id);
	registry.approve(rec.id);

	const reloaded = new ArtifactRegistry(new ArtifactStore(dir));
	const loaded = reloaded.get(rec.id);
	assert.ok(loaded);
	assert.equal(loaded.title, "Diff");
	assert.equal(loaded.status, "APPROVED");
	assert.deepEqual(loaded.sourceFiles, ["src/a.ts"]);
	fs.rmSync(dir, { recursive: true, force: true });
});

test("corrupt index is tolerated without dropping the whole registry", () => {
	const dir = tempDir();
	const store = new ArtifactStore(dir);
	const registry = new ArtifactRegistry(store);
	registry.create({ type: "markdown", title: "Good", content: "a" });

	const loaded = new ArtifactStore(dir);
	loaded.load();
	// Simulate an invalid second record sitting in the index.
	const indexPath = path.join(dir, "index.json");
	const data = JSON.parse(fs.readFileSync(indexPath, "utf8"));
	data["bad"] = { id: "bad" };
	fs.writeFileSync(indexPath, JSON.stringify(data));

	const res = new ArtifactStore(dir).load();
	assert.equal(res.dropped, 1);
	const reg2 = new ArtifactRegistry(new ArtifactStore(dir));
	assert.equal(reg2.count(), 1);
	fs.rmSync(dir, { recursive: true, force: true });
});

test("search filters by query and status", () => {
	const dir = tempDir();
	const registry = new ArtifactRegistry(new ArtifactStore(dir));
	const graph = registry.create({ type: "architecture", title: "Graph", content: "# graph" });
	registry.create({ type: "test_report", title: "Tests", content: "# tests" });
	registry.requestReview(graph.id);
	registry.approve(graph.id);

	const byQuery = registry.search({ query: "graph" });
	assert.equal(byQuery.length, 1);

	const byStatus = registry.search({ status: ["APPROVED"] });
	assert.equal(byStatus.length, 1);
	assert.equal(byStatus[0].title, "Graph");
	fs.rmSync(dir, { recursive: true, force: true });
});
