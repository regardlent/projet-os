/**
 * LiveDashboard (Phase 23, W-live). Real-time output: re-render the same fixed dashboard
 * every second, replacing the previous block in place (ANSI cursor-up + clear-line), so the
 * "message" always shows the current state without accumulating lines. Pure render + a
 * helper that computes the ANSI refresh sequence. Testable.
 */
import { renderDashboard, type DashSnapshot } from "./DashboardRenderer.js";

/** Number of non-empty lines the snapshot currently occupies (for cursor math). */
export function dashboardLineCount(s: DashSnapshot): number {
	return renderDashboard(s).split("\n").length;
}

/** ANSI escape to move cursor up `n` lines (to top of the previous block). */
export function cursorUp(n: number): string {
	return `\x1b[${Math.max(0, n)}A`;
}

/** ANSI escape to clear from cursor to end of line. */
export function clearLine(): string {
	return "\x1b[2K";
}

/**
 * The refresh SOURCE for in-place update: move up by the previous block size and re-write.
 * `previousLines` = lineCount of the block printed just before (0 on first render).
 */
export function refreshSequence(previousLines: number, block: string): string {
	if (previousLines <= 0) return block; // first draw, no cursor movement needed
	return cursorUp(previousLines) + clearLine() + block.split("\n").map((l) => l + clearLine()).join("\n");
}

/** Append a single trailing newline so the next refresh can move up cleanly. */
export function blockReady(s: DashSnapshot): { block: string; lines: number } {
	const block = renderDashboard(s);
	return { block, lines: block.split("\n").length };
}
