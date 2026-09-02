/**
 * AddonCatalog — Project OS-owned, deterministic, workspace-scoped addon profiles
 * (Phase 13). No remote fetch, no scripts, no secrets. Materialized under `.agents/`.
 */
import type { AddonProfile, AddonType } from "./addonTypes.js";

function profile(
	id: string,
	name: string,
	description: string,
	types: AddonType[],
	revision: string,
	files: { path: string; content: string }[],
	opts: Partial<AddonProfile> = {},
): AddonProfile {
	return {
		id,
		name,
		description,
		types,
		version: "0.1.0",
		revision,
		files,
		security: { remoteCode: false, scripts: false, network: false },
		commands: [],
		mcpServers: [],
		agents: [],
		...opts,
	};
}

const CORE_RULE = `# PROJECT_SCOPE (Project OS)
Managed project: {{PROJECT_NAME}}
Workspace root: {{WORKSPACE_ROOT}}
Goal: {{GOAL}}
Rule: stay inside this workspace when using file/shell tools. Outside-of-folder access = DENY. Project OS hub is control plane only.
`;

const CORE_SKILL = `# Project Context
Describe the goal, stack and constraints of this managed project from \`.project-os/project.json\` and \`.project-os/goal.json\`.
`;

export const CORE_PROFILE = profile(
	"project-os-core",
	"Project OS Core",
	"Workspace scope rule + project context skill + goal/handoff support.",
	["RULE", "SKILL"],
	"2026-08-31",
	[
		{ path: "rules/project-scope.md", content: CORE_RULE },
		{ path: "skills/project-context/SKILL.md", content: CORE_SKILL },
	],
);

const TYPE_RULES: Record<string, { name: string; rule: string; skill: string; types: AddonType[]; commands?: string[] }> = {
	typescript: {
		name: "TypeScript Dev",
		rule: "Use TypeScript strict; run `npm test` (node --test) as the QA gate; avoid deprecated APIs.",
		skill: "TypeScript workspace: compile (tsc --noEmit), test (node --test), no unused locals.",
		types: ["RULE", "SKILL"],
	},
	node: {
		name: "Node Dev",
		rule: "Node ESM; lockfile present; run tests before handoff; never commit .env.",
		skill: "Node workspace: npm test, package scripts, no real secret committed.",
		types: ["RULE", "SKILL"],
	},
	python: {
		name: "Python Dev",
		rule: "Python venv; pytest as QA gate; requirements pinned; never commit .env.",
		skill: "Python workspace: pytest, venv, no absolute paths.",
		types: ["RULE", "SKILL"],
	},
	cpp: {
		name: "C++ Dev",
		rule: "C++20; CMake build; tests via ctest; clamp writes to workspace.",
		skill: "C++ workspace: cmake --build, ctest, no global toolchain mutation (explicit only).",
		types: ["RULE", "SKILL"],
	},
	rust: {
		name: "Rust Dev",
		rule: "Cargo workspace; `cargo test`; clippy clean; no global cargo install silently.",
		skill: "Rust workspace: cargo build/test/clippy.",
		types: ["RULE", "SKILL"],
	},
	go: {
		name: "Go Dev",
		rule: "Go modules; `go test ./...`; gofmt; no module replace outside workspace.",
		skill: "Go workspace: go test, go vet, gofmt.",
		types: ["RULE", "SKILL"],
	},
	web: {
		name: "Web Dev",
		rule: "Frontend build; keep tooling local; no silent 40-dep install.",
		skill: "Web workspace: typecheck, build, lint; describe stack.",
		types: ["RULE", "SKILL"],
	},
	docker: {
		name: "Docker Dev",
		rule: "Dockerfile/compose workspace-scoped; no privileged containers by default.",
		skill: "Docker workspace: build/up/down; never restart Windows.",
		types: ["RULE", "SKILL"],
	},
	localai: {
		name: "LocalAI Dev",
		rule: "Use LocalAI flash models (<=4B); provider openai-compatible; no cloud fallback.",
		skill: "LocalAI workspace: flash model profile from .project-os/models.json.",
		types: ["RULE", "SKILL"],
	},
	desktop: {
		name: "Desktop Dev",
		rule: "Bundle locally; no PII; QA gate = build + tests.",
		skill: "Desktop workspace: build, run local, test.",
		types: ["RULE", "SKILL"],
	},
	empty: {
		name: "Empty",
		rule: "No assumed stack; bootstrap only defaults.",
		skill: "Bare workspace; define stack via /goal and ./project-os/project.json.",
		types: ["RULE", "SKILL"],
	},
};

export function profileForType(projectType: string): AddonProfile {
	const t = TYPE_RULES[projectType];
	if (!t) return CORE_PROFILE;
	return profile(
		`project-os-${projectType}`,
		`Project OS ${t.name}`,
		`${projectType} workspace rule + development skill (Project OS).`,
		t.types,
		"2026-08-31",
		[
			{ path: `rules/${projectType}.md`, content: `# ${t.name} (Project OS)\n${t.rule}\n` },
			{ path: `skills/${projectType}-dev/SKILL.md`, content: `# ${t.name}\n${t.skill}\n` },
		],
		{ commands: t.commands ?? [] },
	);
}

export function listAddonProfiles(): AddonProfile[] {
	const ids = ["core", "typescript", "node", "python", "cpp", "rust", "go", "web", "docker", "localai", "desktop", "empty"];
	return ids.map((id) => (id === "core" ? CORE_PROFILE : profileForType(id)));
}
