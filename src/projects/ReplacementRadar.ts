/**
 * FlashReplacementRadar (Phase 19B, W892-896).
 * Pure filters over the live LocalAI catalog: hard gates (<=4B effective,
 * clear license, safe format, known source), trust tiers and role-gap scoring.
 * Never auto-accepts a variant that fails a hard gate. Testable.
 */
export type TrustTier = 1 | 2 | 3 | 4 | 5; // 1=official, 2=recognized, 3=trusted quantizer, 4=community, 5=unknown

export interface CatalogEntry {
	name: string;
	license?: string;
	backend?: string;
	tags?: string[];
	files?: { filename?: string; sha256?: string; uri?: string }[];
}

export interface RadarCandidate {
	name: string;
	trustTier: TrustTier;
	license: string;
	backend: string;
	paramsGuess: number | null;
	format: string;
	eligible: boolean;
	failReasons: string[];
	roleHints: string[];
	score: number;
}

const OFFICIAL_VENDORS = ["ibm-granite", "Qwen", "mistralai", "HuggingFaceTB", "microsoft", "google", "Meta", "meta-llama", "bigscience", "deepseek-ai", "NVIDIA", "nousresearch"];
const TRUSTED_QUANTIZERS = ["bartowski", "unsloth", "MaziyarPanahi", "TheBloke", "Qwen", "ibm-granite", "NovachronoAI"];
const SAFE_FORMATS = /gguf|safetensors/i;

export function inferParamsFromTags(tags: string[] | undefined): number | null {
	if (!tags) return null;
	for (const t of tags) {
		const m = /^(0\.6|0\.5|1\.5|1\.7|2\.6|3\.3|3\.8|4)\.?b$/.exec(t) || /^(\d+(?:\.\d+)?)b$/.exec(t);
		if (m) {
			const v = parseFloat(m[1] ?? m[0].replace("b", ""));
			return v;
		}
	}
	return null;
}

export function trustTier(entry: CatalogEntry): TrustTier {
	const lower = entry.name.toLowerCase();
	if (OFFICIAL_VENDORS.some((v) => lower.includes(v.toLowerCase()))) return 1;
	if (entry.backend === "llama-cpp" && (entry.name.startsWith("mistralai_") || entry.name.startsWith("ibm-granite_granite-") || entry.name.startsWith("huggingfacetb_") || entry.name.startsWith("Qwen"))) return 2;
	if (TRUSTED_QUANTIZERS.some((q) => lower.includes(q.toLowerCase()))) return 3;
	if (/(fable|distill|abliterated|rp|hermes|dolphin|community|fine-tune|example|test)/i.test(lower)) return 4;
	return 5;
}

export function roleHints(entry: CatalogEntry): string[] {
	const t = (entry.tags ?? []).join(" ").toLowerCase();
	const roles: string[] = [];
	if (/tool|function/i.test(t)) roles.push("TOOLS");
	if (/cod|progr|python|javascript|typescript/i.test(t)) roles.push("CODING");
	if (/reason|think/i.test(t)) roles.push("REASONING");
	if (/math|gsm|logic/i.test(t)) roles.push("MATH");
if (/json|struct/i.test(t)) roles.push("JSON");
	if (/vision|image|multimodal|vlm/i.test(t)) roles.push("VISION");
	if (/translat|multilingual|lang/i.test(t)) roles.push("MULTILINGUAL");
	if (/rag|retriev|embed/i.test(t)) roles.push("RAG");
	return roles;
}

export function scoreCandidate(c: RadarCandidate): number {
	let score = 0;
	score += (5 - c.trustTier) * 2;
	if (c.paramsGuess === null) score -= 3; else if (c.paramsGuess <= 4) score += 4; else score -= 4;
	if (c.license) score += 2;
	if (c.format === "gguf") score += 2;
	score += Math.min(3, c.roleHints.length);
	return score;
}

export function evaluateCandidate(entry: CatalogEntry): RadarCandidate {
	const params = inferParamsFromTags(entry.tags);
	const failReasons: string[] = [];
	const format = (entry.files?.some((f) => /\.gguf$/i.test(f.filename ?? "")) ? "gguf" : SAFE_FORMATS.test(JSON.stringify(entry)) ? "safe" : "unknown");
	const tier = trustTier(entry);
	if (params === null) failReasons.push("PARAMETER_UNKNOWN");
	else if (params > 4) failReasons.push("OVER_4B");
	if (!entry.license) failReasons.push("LICENSE_UNKNOWN");
	if (format === "unknown") failReasons.push("FORMAT_UNSAFE");
	if (tier === 5) failReasons.push("UNKNOWN_SOURCE");
	const roleH = roleHints(entry);
	const eligible = failReasons.length === 0 && tier <= 3;
	const c: RadarCandidate = { name: entry.name, trustTier: tier, license: entry.license ?? "unknown", backend: entry.backend ?? "unknown", paramsGuess: params, format, eligible, failReasons, roleHints: roleH, score: 0 };
	c.score = scoreCandidate(c);
	return c;
}

export function buildReplacementRadar(catalog: readonly CatalogEntry[]): RadarCandidate[] {
	return catalog.map(evaluateCandidate).sort((a, b) => b.score - a.score);
}
