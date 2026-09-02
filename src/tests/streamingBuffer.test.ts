import { test } from "node:test";
import assert from "node:assert/strict";
import { StreamingBuffer, type SchedulerLike } from "../runtime/StreamingBuffer.js";

class FakeScheduler implements SchedulerLike {
	private next = 0;
	private tasks = new Map<number, () => void>();
	setTimeout(fn: () => void): unknown {
		const id = this.next++;
		this.tasks.set(id, fn);
		return id;
	}
	clearTimeout(handle: unknown): void {
		this.tasks.delete(handle as number);
	}
	runAll(): void {
		const pending = [...this.tasks.values()];
		this.tasks.clear();
		for (const fn of pending) fn();
	}
	hasPending(): boolean {
		return this.tasks.size > 0;
	}
}

test("buffer coalesces chunks until flush", () => {
	const scheduler = new FakeScheduler();
	const out: string[] = [];
	const buf = new StreamingBuffer((t) => out.push(t), 50, scheduler);
	buf.push("a");
	buf.push("b");
	buf.push("c");
	assert.equal(buf.hasPending(), true);
	assert.equal(buf.pendingText(), "abc");
	scheduler.runAll();
	assert.deepEqual(out, ["abc"]);
	assert.equal(buf.hasPending(), false);
});

test("flushNow flushes and clears the timer", () => {
	const scheduler = new FakeScheduler();
	const out: string[] = [];
	const buf = new StreamingBuffer((t) => out.push(t), 50, scheduler);
	buf.push("x");
	buf.flushNow();
	assert.deepEqual(out, ["x"]);
	assert.equal(scheduler.hasPending(), false);
	assert.equal(buf.hasPending(), false);
});

test("interval flush does not split across multiple pushes", () => {
	const scheduler = new FakeScheduler();
	const out: string[] = [];
	const buf = new StreamingBuffer((t) => out.push(t), 50, scheduler);
	buf.push("hello ");
	buf.push("world");
	scheduler.runAll();
	assert.deepEqual(out, ["hello world"]);
});

test("dispose clears state and prevents flushes", () => {
	const scheduler = new FakeScheduler();
	const out: string[] = [];
	const buf = new StreamingBuffer((t) => out.push(t), 50, scheduler);
	buf.push("temp");
	buf.dispose();
	assert.equal(buf.hasPending(), false);
	scheduler.runAll();
	assert.deepEqual(out, []);
});
