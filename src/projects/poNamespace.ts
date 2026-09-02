/**
 * Project OS / Antigravity command namespace (Phase 14).
 * Antigravity has a native `/goal`; Project OS must NOT overwrite it. Internal
 * Project OS commands keep their names; Antigravity mirrors use a `/po-*`
 * namespace, chosen by a collision gate (never overwrite a native command).
 */
export const NATIVE_COLLISION_CANDIDATES: readonly string[] = [
	"/goal",
	"/create",
	"/addon",
	"/autonomy",
	"/projects",
	"/open",
	"/resume",
	"/status",
];

export function commandHasCollision(command: string, nativeCommands: readonly string[]): boolean {
	const slash = normalize(command);
	return nativeCommands.map(normalize).includes(slash);
}

/** Map an internal command to its safe mirror name given the known native set. */
export function resolveMirrorName(command: string, nativeCommands: readonly string[]): string {
	const slash = normalize(command);
	const name = slash.replace(/^\//, "");
	if (commandHasCollision(slash, nativeCommands)) return `/po-${name}`;
	return slash;
}

export function normalize(command: string): string {
	const c = command.trim();
	return c.startsWith("/") ? c : `/${c}`;
}
