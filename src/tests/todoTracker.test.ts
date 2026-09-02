import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TodoTracker, FsTodoIO } from "../projects/TodoTracker.js";

test("TodoTracker: seed, setState(done) renders struck-through, persists", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "todo-"));
	const tracker = new TodoTracker(new FsTodoIO(root));
	const snap = tracker.seed("Build a Super League observer");
	assert.equal(snap.schemaVersion, 1);
	assert.ok(snap.tasks.length >= 5);
	// scaffold + goal are already done, rest pending
	assert.ok(snap.tasks.find((t) => t.key === "scaffold")?.state === "done");
	assert.ok(snap.tasks.find((t) => t.key === "implement")?.state === "pending");

	// mark implement done -> render shows strikethrough
	tracker.setState("implement", "done");
	const md = tracker.render();
	assert.match(md, /- \[x\] ~Implement: Build a Super League observer~/);
	assert.match(md, /Progress\s+: 3\/6/);

	// persisted to .project-os/todo.json + TODO.md
	assert.ok(fs.existsSync(path.join(root, ".project-os", "todo.json")));
	assert.ok(fs.existsSync(path.join(root, "TODO.md")));
	// reload from disk
	const t2 = new TodoTracker(new FsTodoIO(root));
	assert.equal(t2.load().find((x) => x.key === "implement")?.state, "done");
});

test("TodoTracker: setState adds a new task if key missing", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "todo-"));
	const tracker = new TodoTracker(new FsTodoIO(root));
	tracker.setState("new-task", "in_progress");
	assert.equal(tracker.load().find((x) => x.key === "new-task")?.state, "in_progress");
});
