/**
 * ProductCommands (Phase 23, W-cmds). Extra Project OS slash-command handlers to pilot
 * different project types:
 *  - /docs          : navigate ONLINE sources (DocsNavigator) for a project type/domain.
 *  - /report        : consolidate tokens + cost + perf (UsageReport) for a job/run.
 *  - /project       : summary of a managed project (goal, status, addons, todo progress).
 * Pure handlers (return CommandResult); registry/workspace injected for testability.
 */
import type { CommandResult } from "./projectTypes.js";
import { navigateDocs, sourcesByCategory } from "./DocsNavigator.js";
import type { UsageObservation } from "../tokens/UsageObservation.js";
import type { CostObservation } from "../budget/CostModel.js";
import { reportUsage, type MeasuredInference } from "../tokens/UsageReport.js";

export function docsHandler(parsed: { args: string[]; flags: Record<string, string> }, ctx: { activeProject?: { slug: string; projectId: string; workspaceRoot: string } | null }): CommandResult {
	const task = parsed.args.slice(1).join(" ") || parsed.flags["for"] || (ctx.activeProject?.slug ?? "");
	const info = navigateDocs(task);
	const cat = parsed.flags["category"];
	const sources = cat ? sourcesByCategory(task, cat) : info.sources;
	const lines = sources.map((s) => `- [${s.category}] ${s.label} -> ${s.url} (${s.authority}) ${s.purpose}`);
	return { command: "docs", ok: true, status: "NAV", message: `domain=${info.domain}\n` + lines.join("\n"), warnings: [], actions: ["docs.nav"], artifacts: [], next: "/docs --for=<type> --category=STANDINGS" };
}

export function reportHandler(parsed: { args: string[]; flags: Record<string, string> }, ctx: { activeProject?: { slug: string; projectId: string; workspaceRoot: string } | null }, tokenObservations: readonly UsageObservation[], costObservations: readonly CostObservation[], measured: readonly MeasuredInference[]): CommandResult {
	const job = parsed.flags["job"] ?? `job-${Date.now()}`;
	const rep = reportUsage({ jobId: job, projectId: ctx.activeProject?.projectId ?? null, modelId: parsed.flags["model"], tokenObservations, costObservations, measuredRuns: measured });
	return { command: "report", ok: true, status: "REPORT", projectId: ctx.activeProject?.projectId, message: `job=${job} tokens=${JSON.stringify(rep.tokens)} cost=${JSON.stringify(rep.cost)} perf=${JSON.stringify(rep.throughput)}`, warnings: [], actions: [], artifacts: [], next: "/report --job=<id>" };
}

export function projectHandler(parsed: { args: string[]; flags: Record<string, string> }, ctx: { activeProject?: { slug: string; projectId: string; workspaceRoot: string } | null; registry: { get(slugOrId: string): unknown } }): CommandResult {
	const slug = (parsed.args[0] ?? parsed.flags["project"] ?? ctx.activeProject?.slug) ?? "";
	const m = ctx.registry.get(slug) as { status?: string; goal?: { status?: string; progress?: number; objective?: string }; projectType?: string } | undefined;
	if (!m) return { command: "project", ok: false, status: "NOT_FOUND", message: "No managed project: " + slug, warnings: [], actions: [], artifacts: [] };
	return { command: "project", ok: true, status: m.status ?? "READY", projectId: ctx.activeProject?.projectId, message: `slug=${slug} type=${m.projectType} status=${m.status} goal=${m.goal?.objective ?? "-"} progress=${m.goal?.progress ?? 0}%`, warnings: [], actions: ["project.open"], artifacts: [".project-os/project.json"], next: "/project <slug>" };
}
