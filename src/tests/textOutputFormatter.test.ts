import test from "node:test";
import assert from "node:assert";
import { renderTodo, renderTodoList, renderHeader, renderKV, renderProgress, summarizeTodo } from "../projects/TextOutputFormatter.js";

test("TODO: done item is struck through (barré) with a check", () => {
	assert.equal(renderTodo({ key: "a", label: "Setup CMake", state: "done" }), "- [x] ~Setup CMake~");
	assert.equal(renderTodo({ key: "b", label: "Write README", state: "pending" }), "- [ ] Write README");
	assert.equal(renderTodo({ key: "c", label: "Building", state: "in_progress" }), "- [~] Building");
});

test("TODO list renders each line and summarize shows done/total", () => {
	const items = [
		{ key: "a", label: "One", state: "done" as const },
		{ key: "b", label: "Two", state: "done" as const },
		{ key: "c", label: "Three", state: "pending" as const },
	];
	const list = renderTodoList(items);
	assert.ok(list.split("\n").length === 3);
	assert.match(list, /\[x\] ~One~/);
	assert.match(summarizeTodo(items), /67%|66%|2\//);
});

test("renderHeader / renderKV / renderProgress formatting", () => {
	assert.match(renderHeader("Build"), /═/);
	assert.match(renderKV("model", "granite-4.2-3b-flash"), /model.*granite/);
	assert.match(renderProgress(50), /50%/);
	assert.match(renderProgress(0), /0%/);
	assert.match(renderProgress(100), /100%/);
});
