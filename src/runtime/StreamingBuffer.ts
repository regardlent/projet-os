/**
 * StreamingBuffer (W42)
 *
 * Coalesces granular chunks into a bounded buffer and flushes on an interval so
 * the UI is not spammed once per token. The scheduler is injectable so it is
 * unit-testable with fakes.
 */
export interface SchedulerLike {
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

const defaultScheduler: SchedulerLike = {
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class StreamingBuffer {
	private buffer = "";
	private timer: unknown | undefined;

	constructor(
		private readonly flush: (text: string) => void,
		private readonly intervalMs = 50,
		private readonly scheduler: SchedulerLike = defaultScheduler,
	) {}

	push(chunk: string): void {
		if (!chunk) return;
		this.buffer += chunk;
		this.scheduleFlush();
	}

	/** Immediately flush any pending text. */
	flushNow(): void {
		if (this.timer !== undefined) {
			this.scheduler.clearTimeout(this.timer);
			this.timer = undefined;
		}
		if (this.buffer.length > 0) {
			const text = this.buffer;
			this.buffer = "";
			this.flush(text);
		}
	}

	pendingText(): string {
		return this.buffer;
	}

	hasPending(): boolean {
		return this.buffer.length > 0;
	}

	dispose(): void {
		if (this.timer !== undefined) {
			this.scheduler.clearTimeout(this.timer);
			this.timer = undefined;
		}
		this.buffer = "";
	}

	private scheduleFlush(): void {
		if (this.timer !== undefined) return;
		this.timer = this.scheduler.setTimeout(() => {
			this.timer = undefined;
			if (this.buffer.length > 0) {
				const text = this.buffer;
				this.buffer = "";
				this.flush(text);
			}
		}, this.intervalMs);
	}
}
