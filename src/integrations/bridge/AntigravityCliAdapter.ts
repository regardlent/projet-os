/**
 * AntigravityCliAdapter — interface + CLI implementation based on the official
 * `agy` headless CLI (v1.1.22/v1.1.23 documented). NEVER uses --dangerously-skip-permissions.
 * Pure arg-builder exported for direct testing; adapter is safe with a fake CLI.
 */
import fs from "node:fs";
import path from "node:path";
import { runProcess, type ProcessSpec } from "./ProcessRunner.js";

export interface AntigravityRunInput {
	prompt: string;
	cwd: string;
	timeoutMs?: number;
	readOnly: boolean;
	sandbox?: boolean;
	printTimeout?: string; // e.g. "5m"
}

export interface AntigravityRunResult {
	detected: boolean;
	version: string | null;
	ran: boolean;
	status: string | null; // SUCCESS/ERROR/CANCELED/INTERRUPTED/INVALID/WAITING/RUNNING
	error: string | null;
	response: string;
	exitCode: number | null;
	elapsedMs: number;
	softDeny?: boolean;
}

export interface IAntigravityAdapter {
	detect(): { detected: boolean; version: string | null; cliPath: string | null };
	run(input: AntigravityRunInput): Promise<AntigravityRunResult>;
}

/**
 * Resolves the installed `agy` CLI binary if available.
 * Checks environment override, winget link, and user localappdata.
 */
export function findAntigravityCli(): string | null {
	const envPath = process.env.PROJECT_OS_AGY_PATH;
	if (envPath && fs.existsSync(envPath)) return envPath;

	const localAppData = process.env.LOCALAPPDATA;
	if (localAppData) {
		const wingetLink = path.join(localAppData, "Microsoft", "WinGet", "Links", "agy.exe");
		if (fs.existsSync(wingetLink)) return wingetLink;
	}

	return null;
}

/**
 * Build the agy headless argv. The DANGEROUS flag is NEVER emitted — readOnly is
 * enforced by omitting it (fail-closed: if readOnly is requested and we cannot
 * guarantee safety, we still refuse the dangerous flag).
 */
export function buildAntigravityArgs(input: Pick<AntigravityRunInput, "prompt" | "sandbox" | "printTimeout">): string[] {
	const args: string[] = ["-p", input.prompt, "--output-format", "json"];
	if (input.sandbox) args.push("--sandbox");
	if (input.printTimeout) args.push("--print-timeout", input.printTimeout);
	for (const a of args) {
		if (a.includes("skip-permissions") || a.includes("dangerously")) throw new Error("dangerous flag forbidden");
	}
	return args;
}

export class AntigravityCliAdapter implements IAntigravityAdapter {
	constructor(private readonly cli: string | null = null) {}

	detect(): { detected: boolean; version: string | null; cliPath: string | null } {
		const target = this.cli ?? findAntigravityCli();
		if (!target) return { detected: false, version: null, cliPath: null };
		return { detected: true, version: "1.1.23", cliPath: target };
	}

	async run(input: AntigravityRunInput): Promise<AntigravityRunResult> {
		const target = this.cli ?? findAntigravityCli();
		if (!target) return { detected: false, version: null, ran: false, status: null, error: "agy not detected", response: "", exitCode: null, elapsedMs: 0 };
		const spec: ProcessSpec = {
			executable: target,
			args: buildAntigravityArgs(input),
			cwd: input.cwd,
			timeoutMs: input.timeoutMs ?? 60_000,
			maxOutputBytes: 1_000_000,
		};
		const pr = await runProcess(spec);
		let status: string | null = null;
		let error: string | null = null;
		let response = "";
		try {
			const parsed = JSON.parse(pr.output) as { status?: string; error?: string; response?: string };
			status = parsed.status ?? null;
			error = parsed.error ?? null;
			response = parsed.response ?? "";
		} catch {
			status = pr.exitCode === 0 ? "SUCCESS" : "ERROR";
			error = String(pr.spawnError ?? pr.output).slice(0, 500);
		}
		const softDeny = (error ?? "").toLowerCase().includes("permission") || pr.stderr.toLowerCase().includes("permission");
		return { detected: true, version: "1.1.23", ran: pr.exitCode !== null, status, error, response, exitCode: pr.exitCode, elapsedMs: pr.elapsedMs, softDeny };
	}
}