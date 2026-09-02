/**
 * AutonomyRunner — bounds an @cline/agents Agent run to a minutes budget and
 * emits a summary. Uses read-only, workspace-guarded tools (safe by default).
 * Write autonomy is a separate, approval-gated lane (not enabled here).
 */
import { Agent, createTool, type AgentRuntimeEvent } from "@cline/agents";
import type { AutonomyPlan } from "./autonomy.js";
import { safeReadFiles, safeSearch } from "./workspaceGuard.js";
import { classifyAutonomyOutcome, type AutonomyOutcomeKind } from "./autonomyFailure.js";
import { AutonomyActivityLedger, deterministicSummary } from "./AutonomyActivityLedger.js";

export interface AutonomyRunnerOptions {
	projectRoot: string;
	modelId: string;
	baseUrl: string;
	apiKey?: string;
	providerId?: string;
}

export interface AutonomyRunResult {
	status: "COMPLETED" | "STOPPED" | "FAILED";
	outcome: AutonomyOutcomeKind;
	summary: string;
	output: string;
	iterations: number;
	errors: string[];
}

const AUTONOMY_SYSTEM_PROMPT = `You are an autonomous Project OS coding agent.
Work on the objective using ONLY the provided read-only tools (read_files, search_codebase). Never edit files.
Stay inside the workspace (the tools enforce this). When done, report findings and the recommended next action.`;

export class AutonomyRunner {
	constructor(private readonly opts: AutonomyRunnerOptions) {}

	private buildTools() {
		const root = this.opts.projectRoot;
		const readTool = createTool({
			name: "read_files",
			description: "Read text files at absolute paths inside the workspace.",
			inputSchema: { type: "object", properties: { files: { type: "array", items: { type: "string" } } }, required: ["files"] },
			execute: async (input: { files: string[] }) => {
				const r = safeReadFiles(root, input.files ?? []);
				return { content: r.content, skipped: r.skip };
			},
		});
		const searchTool = createTool({
			name: "search_codebase",
			description: "Regex search across the workspace.",
			inputSchema: { type: "object", properties: { pattern: { type: "string" }, maxFiles: { type: "number" } }, required: ["pattern"] },
			execute: async (input: { pattern: string; maxFiles?: number }) => ({
				matches: safeSearch(root, input.pattern, input.maxFiles ?? 500),
			}),
		});
		return [readTool, searchTool];
	}

	async run(plan: AutonomyPlan, log: (s: string) => void = () => {}): Promise<AutonomyRunResult> {
		const ledger = new AutonomyActivityLedger();
		const model = this.opts.modelId;
		const agent = new Agent({
			providerId: this.opts.providerId ?? "openai-compatible",
			modelId: model,
			apiKey: this.opts.apiKey ?? "localai",
			baseUrl: this.opts.baseUrl,
			systemPrompt: AUTONOMY_SYSTEM_PROMPT,
			tools: this.buildTools(),
			maxIterations: 12,
		});
		agent.subscribe((e: AgentRuntimeEvent) => {
			if (e.type === "tool-started") {
				ledger.add({ ts: Date.now(), iteration: e.iteration, model, eventType: "tool-call", tool: e.toolCall.toolName });
				log(`tool ${e.toolCall.toolName} started`);
			}
			if (e.type === "assistant-text-delta") {
				// could stream; not surfaced here
			}
		});

		// Bounded by the plan's minutes (capped at 30 min actual wall clock).
		const durationMs = Math.min(Math.max(plan.minutes * 60_000, 1), 30 * 60_000);
		const timer = setTimeout(() => {
			try {
				agent.abort("autonomy time budget");
			} catch {
				// ignore
			}
		}, durationMs);

		try {
			const result = await agent.run(plan.objective);
			clearTimeout(timer);
			const output = result.outputText;
			const outcome = classifyAutonomyOutcome({
				outputText: output,
				toolCalls: ledger.toolCalls(),
				missionRequiresContent: true,
				missionRequiresTool: false,
			});
			let summary = deterministicSummary({ ...plan, status: "COMPLETED" }, ledger);
			if (output.trim()) summary += `\n\n## Modèle\n${output.trim().slice(0, 1200)}`;
			else summary += `\n\n> Modèle sans sortie exploitable.`;
			return { status: "COMPLETED", outcome, summary, output, iterations: result.iterations, errors: [] };
		} catch (err) {
			clearTimeout(timer);
			const msg = String(err);
			const status = msg.includes("time budget") || msg.includes("abort") ? "STOPPED" : "FAILED";
			const outcome = classifyAutonomyOutcome({ outputText: "", toolCalls: ledger.toolCalls(), missionRequiresContent: true, missionRequiresTool: false });
			const summary = deterministicSummary({ ...plan, status }, ledger);
			return { status, outcome, summary, output: "", iterations: 0, errors: [msg.slice(0, 200)] };
		}
	}
}
