/**
 * DocsNavigator (Phase 23, W-docsnav). Navigation to collect ONLINE info for a given project
 * type/domain. For a sport/football observatory it lists authoritative online sources
 * (league, standings, results, stats) so the project can gather real data. Pure + testable;
 * a live fetch adapter is separate. Extends the "official docs" idea to data sources.
 */
export type ProjectDomain = "football" | "sports" | "cpp" | "web" | "generic";

export interface OnlineSource {
	id: string;
	label: string;
	url: string;
	category: string; // e.g. STANDINGS, RESULTS, STATS, OFFICIAL_DOCS
	authority: "official" | "community" | "vendor";
	purpose: string;
}

export interface DomainInfo {
	domain: ProjectDomain;
	sources: OnlineSource[];
	primary: OnlineSource | null;
}

const SOURCES: Record<ProjectDomain, OnlineSource[]> = {
	football: [
		{ id: "league", label: "Ligue (officielle)", url: "https://football.example.com/", category: "OFFICIAL_DOCS", authority: "official", purpose: "Calendrier, resultats, classement officiel de la ligue." },
		{ id: "standings", label: "Ligue — Classement", url: "https://football.example.com/standings", category: "STANDINGS", authority: "official", purpose: "Classement (pts, J, diff) a recolter." },
		{ id: "results", label: "Ligue — Resultats", url: "https://football.example.com/matches", category: "RESULTS", authority: "official", purpose: "Resultats par journee (domicile, ext., score)." },
		{ id: "stats", label: "Ligue — Stats joueurs", url: "https://football.example.com/stats", category: "STATS", authority: "official", purpose: "Buteurs, passes, stats joueurs." },
		{ id: "football-data", label: "football-data.org (API)", url: "https://www.football-data.org/", category: "STATS", authority: "vendor", purpose: "API clubs/matchs de ligue." },
	],
	sports: [
		{ id: "generic-sports", label: "Sources sportives officielles", url: "https://sports.example.com/", category: "OFFICIAL_DOCS", authority: "official", purpose: "Source de reference pour leagues sportives." },
	],
	cpp: [
		{ id: "cppref", label: "cppreference", url: "https://en.cppreference.com/w/", category: "OFFICIAL_DOCS", authority: "official", purpose: "API C++ standard." },
		{ id: "ms-win32", label: "Microsoft Learn Win32", url: "https://learn.microsoft.com/en-us/windows/win32/api/", category: "OFFICIAL_DOCS", authority: "official", purpose: "API Win32." },
	],
	web: [
		{ id: "mdn", label: "MDN Web Docs", url: "https://developer.mozilla.org/", category: "OFFICIAL_DOCS", authority: "official", purpose: "API web (HTML/CSS/JS)." },
		{ id: "react", label: "React docs", url: "https://react.dev/", category: "OFFICIAL_DOCS", authority: "official", purpose: "Composants React." },
	],
	generic: [
		{ id: "wikipedia", label: "Wikipedia (lien externe)", url: "https://www.wikipedia.org/", category: "GENERAL", authority: "community", purpose: "Recherche d'infos generales." },
	],
};

function detectDomain(task: string): ProjectDomain {
	const j = task.toLowerCase();
	if (/super league|football|ligue|soccer|fifa|fut/.test(j)) return "football";
	if (/cpp|win32|cmake|c\+\+/.test(j)) return "cpp";
	if (/react|web|html|css|jsx|frontend/.test(j)) return "web";
	if (/sport|match|equipe|joueur/.test(j)) return "sports";
	return "generic";
}

export function navigateDocs(task: string): DomainInfo {
	const domain = detectDomain(task);
	const sources = SOURCES[domain];
	return { domain, sources, primary: sources[0] ?? null };
}

/** Category filter for navigating sources by kind. */
export function sourcesByCategory(task: string, category: string): OnlineSource[] {
	const info = navigateDocs(task);
	return info.sources.filter((s) => s.category.toLowerCase() === category.toLowerCase());
}
