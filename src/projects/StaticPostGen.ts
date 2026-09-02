/**
 * StaticPostGen (Phase 23, W-postgen). AFTER code generation, statically compare the produced
 * code against known OFFICIAL API signatures to flag non-conforming usage (hallucinated
 * flags/signatures). Pure + testable; no network. Reports findings with the suspected line and
 * the authoritative signature.
 */
import type { DocsMarker } from "./DocsCodingAdviser.js";

export interface ApiSignature {
	marker: DocsMarker;
	api: string;
	pattern: RegExp;
	correct: string; // official form
	officialSource: string;
}

/** Curated official signatures for common hallucination-prone APIs. */
export const OFFICIAL_SIGNATURES: ApiSignature[] = [
	{ marker: "win32", api: "CreateWindowEx", pattern: /CreateWindowExW?\s*\(/i, correct: "CreateWindowExW(<exStyle>, <className>, <windowName>, <style>, x, y, w, h, hWndParent, hMenu, hInstance, lpParam)", officialSource: "https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-createwindowexw" },
	{ marker: "win32", api: "RegisterClass", pattern: /RegisterClassW?\s*\(/i, correct: "RegisterClassW(&WNDCLASSW) — note wc.lpszClassName must be a stable LPCWSTR", officialSource: "https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerclassw" },
	{ marker: "win32", api: "GetMessage", pattern: /GetMessageW?\s*\(/i, correct: "GetMessageW(&msg, hWnd, 0, 0) returns BOOL", officialSource: "https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getmessagew" },
	{ marker: "cmake", api: "target_link_libraries", pattern: /target_link_libraries\s*\([^;]*?PRIVATE[^;]*?;/i, correct: "target_link_libraries(<tgt> PRIVATE libs...) — targets must exist", officialSource: "https://cmake.org/cmake/help/latest/command/target_link_libraries.html" },
	{ marker: "cmake", api: "add_executable", pattern: /add_executable\s*\(/i, correct: "add_executable(<name> WIN32 <srcs>) — WIN32 is a binary keyword for GUI", officialSource: "https://cmake.org/cmake/help/latest/command/add_executable.html" },
	{ marker: "node", api: "createReadStream", pattern: /createReadStream\s*\(/i, correct: "fs.createReadStream(path, options?) returns ReadStream (require('node:fs'))", officialSource: "https://nodejs.org/api/fs.html#fscreatereadstreampath-options" },
	{ marker: "typescript", api: "tsconfig", pattern: /\"module\"\s*:\s*\"commonjs\"/i, correct: "module: 'NodeNext' / 'ESNext' with type:module for ESM; avoid CommonJS unless needed", officialSource: "https://www.typescriptlang.org/tsconfig" },
	{ marker: "localai", api: "backend/load", pattern: /backend\/load/i, correct: "POST /backend/load {model:<id>} — returns {loaded:[...]}", officialSource: "https://localai.io/docs/" },
];

export interface PostGenFinding {
	api: string;
	marker: DocsMarker;
	line: number;
	matched: string;
	correct: string;
	officialSource: string;
	blocking: boolean; // true = clear non-conformance (hallucinated usage)
}

export interface PostGenReport {
	totalLines: number;
	findings: PostGenFinding[];
	conformant: boolean;
	checkedSignatures: number;
}

/** Scan produced source + language hints, flagging official-signature non-conformance. */
export function postGenCheck(code: string, hints: string[] = []): PostGenReport {
	const lines = code.split(/\r?\n/);
	const findings: PostGenFinding[] = [];
	const joined = (hints.join(" ")).toLowerCase();
	let checked = 0;
	for (const sig of OFFICIAL_SIGNATURES) {
		// only check signatures whose marker the task hints at, unless a direct match appears
		const hinted = joined.includes(sig.marker) || code.toLowerCase().includes(sig.api.toLowerCase());
		if (!hinted) continue;
		checked++;
		for (let i = 0; i < lines.length; i++) {
			if (sig.pattern.test(lines[i])) {
				// crude correctness heuristics: presence of an (almost certainly) wrong adjacent token
				const blocking = looksWrong(lines[i], sig);
				findings.push({ api: sig.api, marker: sig.marker, line: i + 1, matched: lines[i].trim().slice(0, 80), correct: sig.correct, officialSource: sig.officialSource, blocking });
			}
		}
	}
	return { totalLines: lines.length, findings, conformant: findings.filter((f) => f.blocking).length === 0, checkedSignatures: checked };
}

function looksWrong(line: string, sig: ApiSignature): boolean {
	// A likely-wrong usage: a dangling/truncated call or a missing required argument pattern.
	const bare = line.toLowerCase();
	// e.g. CreateWindowExW( ... ; — if it ends with ; soon after '(' it's under-specified
	if (/\(\s*\);/.test(bare)) return true;
	// Windows: a class name that is clearly not a string/identifier
	if (sig.api.toLowerCase().includes("registerclass") && /registerclass\w*\s*\(\s*\d/.test(bare)) return true;
	return false;
}
