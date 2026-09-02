/**
 * DocsCheckPrewrite (Phase 23, W-docs-pre). BEFORE writing a code block, inject the relevant
 * OFFICIAL documentation as model context to guide generation and reduce API hallucination.
 * Pure + testable: builds an enriched prompt from a coding task and reports which doc
 * markers got covered (and whether coverage is guaranteed).
 */
import { adviseCoding, detectMarkers, type OfficialDocRef, type DocsMarker } from "./DocsCodingAdviser.js";

export interface PrewriteResult {
	task: string;
	injectedDocs: OfficialDocRef[];
	markers: DocsMarker[];
	prompt: string; // enriched prompt (doc context + task)
	coverage: boolean; // at least one official doc injected
	tokenOverhead: number; // approximate added context tokens (doc lines)
}

const DOC_LINE_TOKEN_ESTIMATE = 8;

/** Build an enriched coding prompt: official docs first, then the original task. */
export function buildPrewritePrompt(task: string, hints: string[] = [], maxDocs = 4): PrewriteResult {
	const advisory = adviseCoding(task, hints);
	const docs = advisory.docs.slice(0, maxDocs);
	let prompt = "";
	if (docs.length) {
		prompt += "## Official documentation to consult (authoritative; do NOT invent API)\n";
		for (const d of docs) prompt += `- ${d.label} — ${d.url}\n`;
		prompt += `- Constraint: ${advisory.hint}\n\n`;
	}
	prompt += `## Task\n${task}\n`;
	prompt += "\nWrite code that follows the documented API/contract. Prefer documented signatures over invented ones.\n";
	const overhead = docs.length * DOC_LINE_TOKEN_ESTIMATE + 10;
	return { task, injectedDocs: docs, markers: advisory.confidence === "high" ? detectMarkers(task, hints) : [], prompt, coverage: docs.length > 0, tokenOverhead: overhead };
}

/** True when the pre-write stage surfaced at least one relevant official doc for the task. */
export function prewriteCoverage(task: string, hints: string[] = []): { coverage: boolean; markers: DocsMarker[] } {
	const markers = detectMarkers(task, hints);
	return { coverage: markers.length > 0, markers };
}

/** Assemble the user message to send (doc context header + the original task). */
export function prewriteUserMessage(task: string, hints: string[] = [], maxDocs = 4): { message: string; overhead: number } {
	const r = buildPrewritePrompt(task, hints, maxDocs);
	return { message: r.prompt, overhead: r.tokenOverhead };
}
