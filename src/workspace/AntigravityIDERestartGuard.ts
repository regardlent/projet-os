/**
 * AntigravityIDERestartGuard (Phase 7).
 *
 * SAFETY GATE for restarting Antigravity IDE only. It NEVER permits a Windows
 * restart/shutdown/logout, NEVER force-kills, and refuses to target non-IDE
 * processes or non-canonical workspaces. Pure module, testable.
 */

export type IdeKind = "ANTIGRAVITY_IDE" | "ANTIGRAVITY_2_0" | "UNRELATED" | "UNKNOWN";

export const CANONICAL_WORKSPACE = "C:\\Users\\eiden\\Desktop\\dev\\projet-os";
export const OLD_WORKSPACE_ALIAS = "C:\\Users\\eiden\\Desktop\\dev\\prob-reddit\\project-os";

/** Windows/system-destructive commands that must NEVER appear in the restart broker. */
export const FORBIDDEN_WINDOWS_COMMANDS: readonly string[] = [
	"Restart-Computer",
	"shutdown.exe /r",
	"shutdown.exe /s",
	"shutdown /r",
	"shutdown /s",
	"shutdown -r",
	"shutdown -s",
	"logoff",
	"logoff.exe",
	"reboot",
];

/** Classify a process target; ONLY the IDE is eligible for restart. */
export function classifyProcess(executablePath: string, productName?: string): IdeKind {
	const exe = executablePath.toLowerCase();
	const prod = (productName ?? "").toLowerCase();
	// Distinguish Antigravity IDE from Antigravity 2.0 desktop agent / agy CLI.
	if (prod.includes("antigravity") && (prod.includes("ide") || exe.includes("antigravityide"))) {
		return "ANTIGRAVITY_IDE";
	}
	if (exe.includes("antigravity-2") || prod.includes("antigravity 2") || exe.includes("agy") || prod.includes("desktop agent")) {
		return "ANTIGRAVITY_2_0";
	}
	if (exe.includes("code") || exe.includes("electron") || exe.includes("idea") || exe.includes("studio")) {
		return "UNRELATED";
	}
	return "UNKNOWN";
}

export type WorkspaceValidation = "CANONICAL" | "WRONG" | "EMPTY" | "OLD_ALIAS";

export function validateWorkspace(path: string | undefined): WorkspaceValidation {
	if (!path || path.trim().length === 0) return "EMPTY";
	const norm = (p: string) => p.replace(/[\\/]+$/, "").toLowerCase();
	if (norm(path) === norm(CANONICAL_WORKSPACE)) return "CANONICAL";
	if (norm(path) === norm(OLD_WORKSPACE_ALIAS)) return "OLD_ALIAS";
	return "WRONG";
}

/** Returns the first forbidden Windows command found in a string, if any. */
export function findForbiddenWindowsCommand(text: string): string | undefined {
	const lower = text.toLowerCase();
	return FORBIDDEN_WINDOWS_COMMANDS.find((c) => lower.includes(c.toLowerCase()));
}

/** True if an IDE restart plan is permitted by policy (IDE only). */
export function isIdeRestartAllowed(target: IdeKind, workspace: string | undefined): boolean {
	if (target !== "ANTIGRAVITY_IDE") return false;
	return validateWorkspace(workspace) === "CANONICAL";
}
