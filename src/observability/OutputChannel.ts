/**
 * StructuredLogger / OutputChannel (W40)
 *
 * Emits structured, level-tagged log lines with a redaction pass applied to the
 * message so secrets never reach the output channel. Pure module (writer is
 * injected) so it is testable.
 */
export type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG";

const LEVEL_ORDER: Record<LogLevel, number> = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };

export interface Redactor {
	(message: string): string;
}

/**
 * Mask common secret patterns: Bearer tokens, api_key=..., sk-... strings,
 * long token-like strings after `authorization: bearer`.
 */
export function defaultRedactor(message: string): string {
	return message
		.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1***")
		.replace(/\b(api[_-]?key|token|secret)\s*[=:]\s*\S+/gi, "$1=***")
		.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-***")
		.replace(/(authorization|x-api-key)\s*[=:]\s*\S+/gi, "$1=***");
}

export interface LogMeta {
	[key: string]: unknown;
}

export class StructuredLogger {
	private readonly write: (line: string) => void;
	private readonly redactor: Redactor;
	private readonly minLevel: LogLevel;

	constructor(write: (line: string) => void, options?: { redactor?: Redactor; minLevel?: LogLevel }) {
		this.write = write;
		this.redactor = options?.redactor ?? defaultRedactor;
		this.minLevel = options?.minLevel ?? "INFO";
	}

	private enabled(level: LogLevel): boolean {
		return LEVEL_ORDER[level] <= LEVEL_ORDER[this.minLevel];
	}

	private emit(level: LogLevel, message: string, meta?: LogMeta): void {
		if (!this.enabled(level)) return;
		const ts = new Date().toISOString();
		const redacted = this.redactor(message);
		const metaPart = meta ? ` ${JSON.stringify(this.redactor(JSON.stringify(meta)))}` : "";
		this.write(`[${level}] ${ts} ${redacted}${metaPart}`);
	}

	error(message: string, meta?: LogMeta): void {
		this.emit("ERROR", message, meta);
	}
	warn(message: string, meta?: LogMeta): void {
		this.emit("WARN", message, meta);
	}
	info(message: string, meta?: LogMeta): void {
		this.emit("INFO", message, meta);
	}
	debug(message: string, meta?: LogMeta): void {
		this.emit("DEBUG", message, meta);
	}
}
