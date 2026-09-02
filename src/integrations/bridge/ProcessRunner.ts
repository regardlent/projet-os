/**
 * ProcessRunner — centralized subprocess execution for the MCP bridge.
 * spawn() with separated args, allowlisted env, timeout, clean kill, bounded
 * output. NEVER builds a command line string from user input.
 */
import { spawn, type ChildProcess } from "node:child_process";

export interface ProcessSpec {
	executable: string;
	args: string[];
	cwd?: string;
	envAllowlist?: string[]; // keys copied from process.env; empty = inherit restricted
	timeoutMs?: number;
	maxOutputBytes?: number;
	onStdoutLine?: (line: string) => void;
	onStderrLine?: (line: string) => void;
}

export interface ProcessResult {
	started: boolean;
	exitCode: number | null;
	timedOut: boolean;
	output: string;
	stderr: string;
	spawnError?: string;
	elapsedMs: number;
}

function buildEnv(allowlist: string[] | undefined): NodeJS.ProcessEnv {
	if (!allowlist) return { PATH: process.env.PATH ?? "", SYSTEMROOT: process.env.SYSTEMROOT ?? "" };
	const out: NodeJS.ProcessEnv = {};
	for (const k of allowlist) if (process.env[k] !== undefined) out[k] = process.env[k];
	return out;
}

export async function runProcess(spec: ProcessSpec): Promise<ProcessResult> {
	const timeoutMs = spec.timeoutMs ?? 30_000;
	const maxOutput = spec.maxOutputBytes ?? 1_000_000;
	const startedAt = Date.now();
	return new Promise<ProcessResult>((resolve) => {
		let child: ChildProcess;
		try {
			child = spawn(spec.executable, spec.args, {
				cwd: spec.cwd,
				env: buildEnv(spec.envAllowlist),
				shell: false,
				windowsHide: true,
				stdio: ["ignore", "pipe", "pipe"],
			});
		} catch (e) {
			resolve({ started: false, exitCode: null, timedOut: false, output: "", stderr: "", spawnError: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - startedAt });
			return;
		}
		child.on("error", (err) => {
			resolve({ started: true, exitCode: null, timedOut: false, output: "", stderr: "", spawnError: err.message, elapsedMs: Date.now() - startedAt });
		});

		let out = "";
		let err = "";
		let truncated = false;
		const timer = setTimeout(() => {
			truncated = true;
			try {
				child.kill("SIGKILL");
			} catch {
				/* already exited */
			}
		}, timeoutMs);

		const push = (buf: Buffer, isErr: boolean): void => {
			const text = buf.toString("utf8");
			const target = isErr ? err : out;
			const room = isErr ? maxOutput : maxOutput;
			if ((target.length + text.length) <= room) {
				if (isErr) err += text;
				else out += text;
			} else {
				truncated = true;
			}
		};

		child.stdout?.on("data", (b: Buffer) => push(b, false));
		child.stderr?.on("data", (b: Buffer) => push(b, true));

		child.on("close", (code) => {
			clearTimeout(timer);
			const elapsedMs = Date.now() - startedAt;
			resolve({ started: true, exitCode: code, timedOut: truncated, output: out, stderr: err, elapsedMs });
		});
	});
}