/**
 * WriteLaneGuard (Phase 23, W-writeguard). Wraps a Project OS write-lane so each written file is
 * post-gen checked (StaticPostGen official-signature conformance) and anti-regression guarded
 * (a required symbol set that must still exist after the write; else the write is refused).
 * This stops the write-lane from producing a destructive rewrite (a regression observed).
 * Pure module; the write handler is injected so it is unit-testable.
 */
import { postGenCheck } from "./StaticPostGen.js";

export interface WriteGuardInput {
	path: string;
	content: string;
	/** Symbols/functions that MUST remain present in the file after a rewrite. */
	requiredSymbols?: string[];
	hints?: string[];
}

export interface WriteLaneGuardResult {
	allow: boolean;
	reason: string | null;
}

/** Wrap a raw write handler to enforce post-gen + anti-regression guards. */
export function guardWrite(handler: (path: string, content: string) => { ok: boolean; reason?: string }) {
	return (input: WriteGuardInput): WriteLaneGuardResult => {
		// StaticPostGen: flag official-signature non-conformance (blocking).
		const post = postGenCheck(input.content, input.hints ?? []);
		const blocking = post.findings.filter((f) => f.blocking);
		if (blocking.length) {
			return { allow: false, reason: "POSTGEN_NON_CONFORMANT: " + blocking.map((b) => b.api).join(", ") };
		}
		// Anti-regression: required symbols must remain in the new content.
		if (input.requiredSymbols && input.requiredSymbols.length) {
			const missing = input.requiredSymbols.filter((s) => !input.content.includes(s));
			if (missing.length) {
				return { allow: false, reason: "REGRESSION_MISSING_SYMBOLS: " + missing.join(", ") };
			}
		}
		const r = handler(input.path, input.content);
		return { allow: r.ok, reason: r.reason ?? null };
	};
}

/** Precompute the required symbol set for a reference codebase (anti-regression). */
export function demoRequiredSymbols(): string[] {
	return ["namespace demo", "struct Model", "struct Config", "render", "load", "save", "validate", "main"];
}
