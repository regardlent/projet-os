/**
 * TodoTracker (Phase 23, W-todo). A per-project persistent TODO list that renders DONE items
 * with a strikethrough (barré) via TextOutputFormatter. Persists to `.project-os/todo.json`.
 * Pure-ish: fs injected so it is unit-testable. Reused by the /create handler to seed a new
 * project's TODO on creation.
 */
import fs from "node:fs";
import path from "node:path";
import { renderTodoList, renderHeader, renderKV } from "./TextOutputFormatter.js";
import type { CheckState } from "./TextOutputFormatter.js";

export interface TodoEntry { key: string; label: string; state: CheckState }

export interface TodoSnapshot { schemaVersion: number; tasks: TodoEntry[]; updatedAt: number }

export interface TodoIO {
	readTodo(): TodoSnapshot | null;
	writeTodo(snapshot: TodoSnapshot): boolean;
}

export class TodoTracker {
	constructor(private readonly io: TodoIO) {}

/** Load the tasks for the configured workspace (null if none). */
	load(): TodoEntry[] {
		const s = this.io.readTodo();
		return s ? s.tasks : [];
	}

	/** Seed a new project's TODO with an initial checklist around its goal (all pending). */
	seed(goal: string): TodoSnapshot {
		const tasks: TodoEntry[] = [
			{ key: "scaffold", label: "Scaffold project (create)", state: "done" },
			{ key: "goal", label: "Set goal", state: "done" },
			{ key: "plan", label: "Build plan / design", state: "pending" },
			{ key: "implement", label: `Implement: ${goal}`, state: "pending" },
			{ key: "test", label: "Tests pass", state: "pending" },
			{ key: "docs", label: "Document (README)", state: "pending" },
		];
		const snap: TodoSnapshot = { schemaVersion: 1, tasks, updatedAt: Date.now() };
		this.io.writeTodo(snap);
		return snap;
	}

	/** Set a task state by key; returns updated snapshot. */
	setState(key: string, state: CheckState): TodoSnapshot {
		const s = this.io.readTodo() ?? { schemaVersion: 1, tasks: [], updatedAt: 0 };
		const t = s.tasks.find((x) => x.key === key);
		if (t) t.state = state;
		else s.tasks.push({ key, label: key, state });
		s.schemaVersion = 1;
		s.updatedAt = Date.now();
		this.io.writeTodo(s);
		return s;
	}

	/** Render the TODO as a readable Markdown block with done items struck through. */
	render(): string {
		const tasks = this.load();
		if (!tasks.length) return renderHeader("TODO") + "\n(vide)";
		const done = tasks.filter((t) => t.state === "done").length;
		return (
			renderHeader("TODO — Project OS") +
			"\n" +
			renderTodoList(tasks) +
			"\n" +
			renderKV("Progress", `${done}/${tasks.length}`)
		);
	}
}

/** Default filesystem-backed IO (`.project-os/todo.json`) + a Markdown `TODO.md`. */
export class FsTodoIO implements TodoIO {
	private readonly todoJson: string;
	private readonly todoMd: string;
	constructor(workspaceRoot: string) {
		const dir = path.join(workspaceRoot, ".project-os");
		this.todoJson = path.join(dir, "todo.json");
		this.todoMd = path.join(workspaceRoot, "TODO.md");
	}
	readTodo(): TodoSnapshot | null {
		try {
			const raw = fs.readFileSync(this.todoJson, "utf8");
			const parsed = JSON.parse(raw) as TodoSnapshot;
			return parsed && Array.isArray(parsed.tasks) ? parsed : null;
		} catch {
			return null;
		}
	}
	writeTodo(snap: TodoSnapshot): boolean {
		fs.mkdirSync(path.dirname(this.todoJson), { recursive: true });
		fs.writeFileSync(this.todoJson, JSON.stringify(snap, null, 2), "utf8");
		fs.writeFileSync(this.todoMd, this.renderMarkdown(snap), "utf8");
		return true;
	}
	private renderMarkdown(snap: TodoSnapshot): string {
		const body = snap.tasks.map((t) => (t.state === "done" ? `- [x] ~${t.label}~` : t.state === "in_progress" ? `- [~] ${t.label}` : `- [ ] ${t.label}`)).join("\n");
		return `# TODO — Project OS\n\n${body}\n`;
	}
}

export function isTodoDir(workspaceRoot: string): string {
	return path.join(workspaceRoot, ".project-os");
}
