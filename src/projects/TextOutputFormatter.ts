/**
 * TextOutputFormatter (Phase 23, W-display). Pure text/display formatting so Project OS
 * output is more readable: section headers, key/value pairs, progress, checkboxes and a
 * todo list where DONE items are rendered with a strikethrough (barré). Testable, no I/O.
 */

export type CheckState = "pending" | "done" | "in_progress";

export interface TodoItem {
	key: string;
	label: string;
	state: CheckState;
}

function strike(s: string): string {
	return `~${s}~`;
}

/** Render ONE todo line. Done items get a strikethrough (barré) + a check. */
export function renderTodo(item: TodoItem): string {
	const box = item.state === "done" ? "[x]" : item.state === "in_progress" ? "[~]" : "[ ]";
	const label = item.state === "done" ? strike(item.label) : item.label;
	return `- ${box} ${label}`;
}

/** Render a full todo list from an ordered array. */
export function renderTodoList(items: readonly TodoItem[]): string {
	return items.map(renderTodo).join("\n");
}

/** A section header with a boxed/emphasised title. */
export function renderHeader(title: string, width = 60): string {
	const bar = "═".repeat(Math.max(4, width - title.length - 2));
	return `── ${title} ${bar}`;
}

/** Key/value line with aligned value column. */
export function renderKV(key: string, value: string | number, pad = 24): string {
	return `${key.padEnd(pad)}: ${value}`;
}

/** Percent progress bar (0..100) in a fixed width. */
export function renderProgress(pct: number, width = 24): string {
	const clamped = Math.max(0, Math.min(100, pct));
	const filled = Math.round((clamped / 100) * width);
	return `[${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}] ${Math.round(clamped)}%`;
}

/** Summarize a list of check states: done / total. */
export function summarizeTodo(items: readonly TodoItem[], width = 24): string {
	const done = items.filter((i) => i.state === "done").length;
	return renderProgress((done / Math.max(1, items.length)) * 100, width);
}
