/**
 * ReasoningResponseNormalizer (Phase 19, W899-902).
 * Extracts the FINAL ANSWER from a reasoning model's output (DeepSeek R1 wraps
 * answers after `</think>`). Never exposes chain-of-thought; only the final
 * content is returned. Also computes an over-reasoning score. Pure, testable.
 */
export interface NormalizedResponse {
	rawHadThinkingEnvelope: boolean;
	finalContent: string;
	normalizationApplied: boolean;
	parserStatus: "ok" | "empty" | "json_after_think";
}

export interface OverReasoningInfo {
	score: number; // 0..1 (higher = more over-reasoning)
	hadThinkingEnvelope: boolean;
	outputLength: number;
}

/** If output contains a `</think>` envelope, keep only the content after it. */
export function normalizeThinkingEnvelope(content: string): NormalizedResponse {
	const idx = content.lastIndexOf("</think>");
	if (idx >= 0) {
		const final = content.slice(idx + "</think>".length).trim();
		return { rawHadThinkingEnvelope: true, finalContent: final, normalizationApplied: true, parserStatus: final.startsWith("{") && endsWithJson(final) ? "json_after_think" : "ok" };
	}
	const trimmed = content.trim();
	return { rawHadThinkingEnvelope: false, finalContent: trimmed, normalizationApplied: trimmed.length === 0, parserStatus: trimmed.length === 0 ? "empty" : "ok" };
}

function endsWithJson(s: string): boolean {
	try {
		JSON.parse(s);
		return true;
	} catch {
		return false;
	}
}

export function parseJsonFinal(content: string): { ok: boolean; value: unknown } {
	const n = normalizeThinkingEnvelope(content);
	const candidate = n.finalContent;
	// Prefer a contiguous JSON object in the final content.
	const m = candidate.match(/\{[\s\S]*\}/);
	if (m) {
		try {
			return { ok: true, value: JSON.parse(m[0]) };
		} catch {
			// fall through
		}
	}
	if (candidate) {
		try {
			return { ok: true, value: JSON.parse(candidate) };
		} catch {
			// ignore
		}
	}
	return { ok: false, value: undefined };
}

/** A short trivial task answered with a lot of reasoning is over-reasoning. */
export function overReasoningScore(content: string, opts: { expectedShortAnswer?: boolean; maxTokens?: number } = {}): OverReasoningInfo {
	const n = normalizeThinkingEnvelope(content);
	const total = content.length;
	const expectedShort = opts.expectedShortAnswer ?? true;
	let score = 0;
	if (n.rawHadThinkingEnvelope) score += 0.4;
	// Reasoning might be long even for trivial tasks → penalty on total length.
	if (expectedShort && total > 200) score += 0.2;
	if (expectedShort && total > 800) score += 0.2;
	if (n.finalContent.length === 0) score = 1; // pure over-reasoning, no answer
	return { score: Math.min(1, score), hadThinkingEnvelope: n.rawHadThinkingEnvelope, outputLength: total };
}
