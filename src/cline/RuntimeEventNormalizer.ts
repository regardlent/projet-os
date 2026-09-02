/**
 * RuntimeEventNormalizer
 *
 * Maps the Cline SDK's `CoreSessionEvent` discriminant union (verified against
 * the installed `@cline/core` types, v0.0.81) onto a small, stable set of
 * internal "Project OS" events. Nothing here is a Cline SDK event; these are
 * our own contracts. We deliberately avoid exposing raw agent internals.
 *
 * Pure module: no `vscode` import, so it is unit-testable under node.
 */
import type { CoreSessionEvent } from "@cline/sdk";

export type ProjectEventType =
	| "session_started"
	| "assistant_delta"
	| "tool_started"
	| "tool_finished"
	| "tool_failed"
	| "agent_event"
	| "status"
	| "session_ended"
	| "error";

export interface BaseProjectEvent {
	/** Normalized session/agent identifier. */
	agentId: string;
	at: number;
}

export interface ProjectSessionStartedEvent extends BaseProjectEvent {
	type: "session_started";
}

export interface ProjectAssistantDeltaEvent extends BaseProjectEvent {
	type: "assistant_delta";
	text: string;
	stream: "agent" | "stdout" | "stderr";
}

export interface ProjectToolStartedEvent extends BaseProjectEvent {
	type: "tool_started";
	toolName: string;
}

export interface ProjectToolFinishedEvent extends BaseProjectEvent {
	type: "tool_finished";
	toolName: string;
	ok: boolean;
}

export interface ProjectToolFailedEvent extends BaseProjectEvent {
	type: "tool_failed";
	toolName: string;
	error: string;
}

export interface ProjectAgentEvent extends BaseProjectEvent {
	type: "agent_event";
	/** Only the discriminant string is surfaced; never the full payload. */
	rawType: string;
}

export interface ProjectStatusEvent extends BaseProjectEvent {
	type: "status";
	status: string;
}

export interface ProjectSessionEndedEvent extends BaseProjectEvent {
	type: "session_ended";
	reason: string;
}

export interface ProjectErrorEvent extends BaseProjectEvent {
	type: "error";
	message: string;
}

export type ProjectEvent =
	| ProjectSessionStartedEvent
	| ProjectAssistantDeltaEvent
	| ProjectToolStartedEvent
	| ProjectToolFinishedEvent
	| ProjectToolFailedEvent
	| ProjectAgentEvent
	| ProjectStatusEvent
	| ProjectSessionEndedEvent
	| ProjectErrorEvent;

/**
 * Normalize a single Cline `CoreSessionEvent` into zero or more Project events.
 * Unknown / unrelated discriminants map to `[]` (never thrown, never re-broadcast).
 */
export function normalizeCoreEvent(
	event: CoreSessionEvent,
	now: number = Date.now(),
): ProjectEvent[] {
	switch (event.type) {
		case "chunk": {
			const s = event.payload.stream;
			const stream: ProjectAssistantDeltaEvent["stream"] =
				s === "agent" || s === "stdout" || s === "stderr" ? s : "agent";
			return [
				{
					type: "assistant_delta",
					agentId: event.payload.sessionId,
					text: event.payload.chunk,
					stream,
					at: now,
				},
			];
		}

		case "hook": {
			const payload = event.payload;
			const agentId = payload.sessionId;
			switch (payload.hookEventName) {
				case "tool_call":
					return [
						{
							type: "tool_started",
							agentId,
							toolName: payload.toolName ?? "unknown",
							at: now,
						},
					];
				case "tool_result":
					return [
						{
							type: "tool_finished",
							agentId,
							toolName: payload.toolName ?? "unknown",
							ok: true,
							at: now,
						},
					];
				case "agent_error":
					return [
						{
							type: "tool_failed",
							agentId,
							toolName: payload.toolName ?? "unknown",
							error: `agent_error (iteration ${payload.iteration ?? "?"})`,
							at: now,
						},
					];
				case "agent_end":
					// End of an agent turn; no user-facing progress event needed.
					return [];
				case "session_shutdown":
					return [
						{
							type: "session_ended",
							agentId,
							reason: "session_shutdown",
							at: now,
						},
					];
				default:
					return [];
			}
		}

		case "ended":
			return [
				{
					type: "session_ended",
					agentId: event.payload.sessionId,
					reason: event.payload.reason,
					at: now,
				},
			];

		case "status":
			return [
				{
					type: "status",
					agentId: event.payload.sessionId,
					status: event.payload.status,
					at: now,
				},
			];

		case "agent_event": {
			const raw = (event.payload.event as { type?: unknown }).type;
			return [
				{
					type: "agent_event",
					agentId: event.payload.sessionId,
					rawType: typeof raw === "string" ? raw : "unknown",
					at: now,
				},
			];
		}

		case "team_progress":
		case "pending_prompts":
		case "pending_prompt_submitted":
		case "session_snapshot":
			// Not surfaced to the Project OS event bus yet.
			return [];

		default:
			// Unknown discriminant: never re-broadcast.
			return [];
	}
}
