/**
 * Large-number formatting (W130).
 *
 * 999 → "999", 1200 → "1.2k", 42300 → "42.3k", 1240000 → "1.24M", 1080000000 → "1.08B".
 * The exact value is preserved in the returned object for tooltips.
 */
export interface FormattedNumber {
	display: string;
	value: number;
}

export function formatNumber(value: number): FormattedNumber {
	const abs = Math.abs(value);
	const sign = value < 0 ? "-" : "";
	let display: string;
	if (abs < 1000) {
		display = `${sign}${Math.round(abs)}`;
	} else if (abs < 1_000_000) {
		display = `${sign}${trim((abs / 1000).toFixed(1))}k`;
	} else if (abs < 1_000_000_000) {
		display = `${sign}${trim((abs / 1_000_000).toFixed(2))}M`;
	} else {
		display = `${sign}${trim((abs / 1_000_000_000).toFixed(2))}B`;
	}
	return { display, value };
}

function trim(s: string): string {
	return s.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

/** Compact token string, e.g. "42.3k". */
export function formatTokens(value: number): string {
	return formatNumber(value).display;
}
