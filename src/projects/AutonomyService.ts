/**
 * AutonomyService — persistence for an autonomy plan + handoff (Phase 13).
 */
import fs from "node:fs";
import path from "node:path";
import type { AutonomyPlan } from "./autonomy.js";

export class AutonomyService {
	private readonly file: string;
	private readonly handoffFile: string;

	constructor(projectRoot: string) {
		this.file = path.join(projectRoot, ".project-os", "autonomy.json");
		this.handoffFile = path.join(projectRoot, ".project-os", "handoff.md");
	}

	load(): AutonomyPlan | undefined {
		try {
			const p = JSON.parse(fs.readFileSync(this.file, "utf8")) as AutonomyPlan;
			return p && typeof p.objective === "string" ? p : undefined;
		} catch {
			return undefined;
		}
	}

	save(plan: AutonomyPlan): void {
		fs.mkdirSync(path.dirname(this.file), { recursive: true });
		fs.writeFileSync(this.file, JSON.stringify(plan, null, 2), "utf8");
	}

	writeHandoff(md: string): void {
		fs.mkdirSync(path.dirname(this.handoffFile), { recursive: true });
		fs.writeFileSync(this.handoffFile, md, "utf8");
	}
}
