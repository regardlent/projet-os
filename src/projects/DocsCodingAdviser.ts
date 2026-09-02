/**
 * DocsCodingAdviser (Phase 23, W-docs). An "official-docs-first" adviser that, given a coding
 * task, returns the relevant OFFICIAL documentation to consult (URL + when to use) and a
 * concrete hint. This is the "always search official docs to help coding" capability baked
 * into generation. Pure + testable (no I/O); a live fetch adapter is provided separately.
 */

export type DocsMarker =
	| "cpp"
	| "win32"
	| "cmake"
	| "typescript"
	| "node"
	| "react"
	| "vscode"
	| "localai"
	| "docker"
	| "git"
	| "python"
	| "rust"
	| "sql"
	| "regex";

export interface OfficialDocRef {
	marker: DocsMarker;
	label: string;
	url: string;
	when: string; // when to consult (before writing X)
	authority: "official" | "vendor"; // official upstream = trusted
}

export interface CodingAdvisory {
	task: string;
	docs: OfficialDocRef[];
	primaryDoc: OfficialDocRef | null;
	hint: string;
	confidence: "high" | "medium" | "low";
}

export const DOC_INDEX: Record<DocsMarker, OfficialDocRef[]> = {
	cpp: [{ marker: "cpp", label: "cppreference (official C++ reference)", url: "https://en.cppreference.com/w/", when: "before writing/verifying any C++ API or std usage", authority: "official" },
		{ marker: "cpp", label: "ISO C++ standard (open-std)", url: "https://isocpp.org/std", when: "when asserting standard conformance (e.g. C++20)", authority: "official" }],
	win32: [{ marker: "win32", label: "Microsoft Learn — Windows / Win32 API", url: "https://learn.microsoft.com/en-us/windows/win32/api/", when: "before writing Win32 GUI / native Windows code", authority: "official" },
		{ marker: "win32", label: "Microsoft Learn — Win32 & COM", url: "https://learn.microsoft.com/en-us/windows/win32/", when: "when using HWND / message loop / GDI", authority: "official" }],
	cmake: [{ marker: "cmake", label: "CMake official documentation", url: "https://cmake.org/cmake/help/latest/", when: "before writing CMakeLists or build logic", authority: "official" }],
	typescript: [{ marker: "typescript", label: "TypeScript official handbook", url: "https://www.typescriptlang.org/docs/handbook/", when: "before writing/typing TS code", authority: "official" }],
	node: [{ marker: "node", label: "Node.js official docs", url: "https://nodejs.org/api/", when: "before using Node core modules / APIs", authority: "official" }],
	react: [{ marker: "react", label: "React official docs", url: "https://react.dev/", when: "before writing React components", authority: "official" }],
	vscode: [{ marker: "vscode", label: "VS Code API / extension guide", url: "https://code.visualstudio.com/api", when: "before writing VSCode extension / commands", authority: "official" }],
	localai: [{ marker: "localai", label: "LocalAI official docs", url: "https://localai.io/docs/", when: "before calling LocalAI endpoints / model config", authority: "official" },
		{ marker: "localai", label: "LocalAI model gallery / install", url: "https://localai.io/features/preload/", when: "when installing/preloading a model", authority: "official" }],
	docker: [{ marker: "docker", label: "Docker official docs", url: "https://docs.docker.com/", when: "before writing Dockerfile / compose", authority: "official" }],
	git: [{ marker: "git", label: "Git official docs", url: "https://git-scm.com/doc", when: "when writing git workflows / hooks", authority: "official" }],
	python: [{ marker: "python", label: "Python official docs", url: "https://docs.python.org/3/", when: "before writing Python", authority: "official" }],
	rust: [{ marker: "rust", label: "Rust std docs", url: "https://doc.rust-lang.org/std/", when: "before writing Rust", authority: "official" }],
	sql: [{ marker: "sql", label: "SQL standard / official docs", url: "https://www.iso.org/standard/76583.html", when: "when writing SQL", authority: "official" }],
	regex: [{ marker: "regex", label: "ECMA/PCRE / MDN RegExp", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp", when: "before writing regex", authority: "official" }],
};

/** Detect relevant doc markers from a task + language/framework hints. */
export function detectMarkers(task: string, hints: string[] = []): DocsMarker[] {
	const joined = (task + " " + hints.join(" ")).toLowerCase();
	const out: DocsMarker[] = [];
	const rules: [DocsMarker, RegExp][] = [
		["cpp", /c\+\+|cpp|win32|winapi|gdi|msgloop|wndproc/i],
		["win32", /win32|windows api|hwnd|gui|comctl|message loop/i],
		["cmake", /cmake|cmakelists|build system|ctest/i],
		["typescript", /typescript|\.ts\b|tsx|tsconfig/i],
		["node", /node\.js|node:|express|commonjs|\besm\b|npm|process\./i],
		["react", /react|jsx|hooks|component|vdom/i],
		["vscode", /vscode|extension|contributes|activation/i],
		["localai", /localai|llama\.cpp|gguf|backend\/load|model gallery|vram-estimate/i],
		["docker", /docker|dockerfile|compose|container|image/i],
		["git", /git|commit|branch|worktree|hook/i],
		["python", /python|\.py\b|pip|flask|django/i],
		["rust", /rust|\.rs\b|cargo|\bimpl\b/i],
		["sql", /\bsql\b|select|insert|join|query|database/i],
		["regex", /regex|regular expression|pattern|match\b/i],
	];
	for (const [marker, re] of rules) if (re.test(joined) && !out.includes(marker)) out.push(marker);
	return out;
}

/** Adviser: returns official docs to consult + a hint for a coding task. */
export function adviseCoding(task: string, hints: string[] = []): CodingAdvisory {
	const markers = detectMarkers(task, hints);
	const docs = markers.flatMap((m) => DOC_INDEX[m]).slice(0, 6);
	const primaryDoc = docs[0] ?? null;
	const hint = primaryDoc
		? `Before writing this, check the official reference (${primaryDoc.label}). Respect the documented API/contract; do not invent flags or signatures.`
		: "No specific official doc matched — prefer official upstream docs for the language/framework before coding.";
	return { task, docs, primaryDoc, hint, confidence: markers.length ? "high" : "medium" };
}
