/**
 * Local token estimator (ESTIMATED quality only).
 *
 * Never returns EXACT. Used only to provide a clearly-labelled estimate when a
 * session has real text but the SDK/provider reports no usage (e.g. LocalAI
 * streaming usage gap). The ledger stores numbers only — text is never stored.
 */
export function estimateTokens(text: string): number {
	if (!text) return 0;
	// A conservative approximation: ~4 characters per token for Latin scripts +
	// a small penalty for punctuation/whitespace. This is explicitly ESTIMATED.
	const chars = text.length;
	return Math.max(1, Math.round(chars / 4));
}
