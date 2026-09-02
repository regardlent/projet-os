/**
 * ProjectDNA scanner (read-only).
 *
 * Looks at a folder and returns objective signals about its stack. It never
 * writes anything and it is deliberately cheap: bounded walks with standard
 * exclusions. No `vscode` import (unit-testable).
 */
import * as fs from "node:fs";
import * as path from "node:path";

export interface ProjectDNA {
	root: string;
	totalFiles: number;
	languages: Record<string, number>;
	hasPackageJson: boolean;
	hasLockfile: boolean;
	packageManagers: string[];
	hasPython: boolean;
	hasPyproject: boolean;
	hasRequirements: boolean;
	hasNode: boolean;
	hasDockerfile: boolean;
	hasCompose: boolean;
	hasDevcontainer: boolean;
	hasCargo: boolean;
	hasGoMod: boolean;
	testFiles: number;
	scannedAt: number;
}

const EXCLUDED_DIRS = new Set([
	"node_modules",
	".git",
	".hg",
	".svn",
	"dist",
	"build",
	"out",
	"coverage",
	".venv",
	"venv",
	"env",
	"__pycache__",
	".cache",
	".next",
	".nuxt",
	"target",
	"vendor",
]);

const EXT_TO_LANG: Record<string, string> = {
	".ts": "TypeScript",
	".tsx": "TypeScript",
	".js": "JavaScript",
	".jsx": "JavaScript",
	".py": "Python",
	".rs": "Rust",
	".go": "Go",
	".java": "Java",
	".c": "C",
	".cpp": "C++",
	".cs": "C#",
	".rb": "Ruby",
	".php": "PHP",
	".swift": "Swift",
	".kt": "Kotlin",
	".sh": "Shell",
	".sql": "SQL",
	".html": "HTML",
	".css": "CSS",
	".md": "Markdown",
	".json": "JSON",
	".yaml": "YAML",
	".yml": "YAML",
	".toml": "TOML",
};

export function scanProjectDNA(root: string): ProjectDNA {
	const languages: Record<string, number> = {};
	let totalFiles = 0;
	let testFiles = 0;

	const walk = (dir: string): void => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (EXCLUDED_DIRS.has(entry.name)) continue;
				walk(full);
			} else if (entry.isSymbolicLink()) {
				continue;
			} else {
				totalFiles++;
				const ext = path.extname(entry.name).toLowerCase();
				if (EXT_TO_LANG[ext]) {
					languages[EXT_TO_LANG[ext]] = (languages[EXT_TO_LANG[ext]] ?? 0) + 1;
				}
				if (/\.(test|spec)\./i.test(entry.name) || entry.name.startsWith("test_")) {
					testFiles++;
				}
			}
		}
	};
	walk(root);

	const features = detectManifests(root);
	return {
		root,
		totalFiles,
		languages,
		...features,
		testFiles,
		scannedAt: Date.now(),
	};
}

function detectManifests(root: string): Omit<
	ProjectDNA,
	"root" | "totalFiles" | "languages" | "testFiles" | "scannedAt"
> {
	const exists = (rel: string): boolean => fs.existsSync(path.join(root, rel));
	const hasPackageJson = exists("package.json");
	const hasLockfile =
		exists("package-lock.json") || exists("pnpm-lock.yaml") || exists("yarn.lock") || exists("bun.lock");
	const packageManagers: string[] = [];
	if (hasPackageJson) packageManagers.push("npm");
	if (exists("pnpm-lock.yaml")) packageManagers.push("pnpm");
	if (exists("yarn.lock")) packageManagers.push("yarn");
	if (exists("bun.lock")) packageManagers.push("bun");
	if (exists("requirements.txt")) packageManagers.push("pip");
	if (exists("Cargo.toml")) packageManagers.push("cargo");
	if (exists("go.mod")) packageManagers.push("go");
	return {
		hasPackageJson,
		hasLockfile,
		packageManagers,
		hasPython: exists("main.py") || exists("pyproject.toml") || exists("requirements.txt"),
		hasPyproject: exists("pyproject.toml"),
		hasRequirements: exists("requirements.txt"),
		hasNode: hasPackageJson || exists("tsconfig.json"),
		hasDockerfile: exists("Dockerfile"),
		hasCompose: exists("compose.yaml") || exists("docker-compose.yml"),
		hasDevcontainer: exists(".devcontainer/devcontainer.json"),
		hasCargo: exists("Cargo.toml"),
		hasGoMod: exists("go.mod"),
	};
}
