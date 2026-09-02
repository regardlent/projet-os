/**
 * AuditLogger — structured JSON logs for the MCP bridge.
 * Redacts secrets; never logs full prompt/file content, credentials, auth headers.
 * Bounded history (a circular buffer) to prevent unbounded growth.
 */
export interface BridgeAuditEvent {
	timestamp: number;
	correlationId: string;
	toolName: string;
	operationType: "read" | "write" | "run" | "lifecycle" | "transport";
	elapsedMs: number;
	resultStatus: "OK" | "WARN" | "FAIL" | "BLOCKED" | "TIMEOUT";
	exitCode?: number;
	bytesIn?: number;
	bytesOut?: number;
}

const REDACT_PATTERNS: RegExp[] = [
	/(bearer\s+)\S+/gi,
	/(api\s*[_-]?key["']?\s*[:=]\s*)("[^"]+"|'[^']+'|\S+)/gi,
	/(authorization["']?\s*[:=]\s*(?:bearer\s+)?)\S+/gi,
	/sk-[A-Za-z0-9_-]+/g,
	/(password["']?\s*[:=]\s*)("[^"]+"|'[^']+'|\S+)/gi,
	/(token["']?\s*[:=]\s*)("[^"]+"|'[^']+'|\S+)/gi,
];

export function redactLog(text: string): string {
	let out = text;
	for (const re of REDACT_PATTERNS) {
		out = out.replace(re, (...m: string[]) => {
			// If there is a capture group (the label prefix), keep it and mask the rest.
			if (re && !re.source.startsWith("sk-")) {
				const label = m[1];
				if (label !== undefined) return label + "***";
			}
			return "***";
		});
	}
	return out;
}

export class AuditLogger {
	private readonly buffer: BridgeAuditEvent[] = [];
	private readonly limit: number;
	private redactions = 0;

	constructor(limit = 500) {
		this.limit = limit;
	}

	record(event: BridgeAuditEvent): void {
		this.buffer.push(event);
		if (this.buffer.length > this.limit) this.buffer.shift();
	}

	/** Serialize an event as a JSON line (safe). */
	line(event: BridgeAuditEvent): string {
		return JSON.stringify({ ...event, redacted: this.redactions });
	}

	noteRedaction(count = 1): void {
		this.redactions += count;
	}

	history(): readonly BridgeAuditEvent[] {
		return this.buffer;
	}
}