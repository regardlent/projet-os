/**
 * ClineRuntimeAdapter
 *
 * Thin, typed wrapper around the real `@cline/sdk` `ClineCore`. It hides raw
 * SDK events behind `ProjectEvent` (via RuntimeEventNormalizer) and provides
 * the small stable surface the Project OS consumes.
 *
 * This is the ONLY module that imports `@cline/sdk` at runtime, so the rest of
 * the Project OS stays decoupled from Cline internals.
 *
 * IMPORTANT: this module is designed so that no production code path relies on
 * private Cline internals. Only the public `ClineCore` API is used.
 */
import { ClineCore } from "@cline/sdk";
import type {
	AgentResult,
	CoreSessionEvent,
	SessionHistoryRecord,
	SessionRecord,
	SessionUsageSummary,
} from "@cline/sdk";
import { normalizeCoreEvent, type ProjectEvent } from "./RuntimeEventNormalizer.js";
import { buildToolPolicies } from "./PermissionsAdapter.js";

export interface AgentSession {
	sessionId: string;
	status: string;
	startedAt: number;
	prompt: string;
	providerId: string;
	modelId: string;
}

export interface StartSessionRequest {
	prompt: string;
	providerId: string;
	modelId: string;
	apiKey?: string;
	baseUrl?: string;
	cwd?: string;
	enableTools?: boolean;
	systemPrompt?: string;
	sessionMetadata?: Record<string, unknown>;
}

type ProjectListener = (event: ProjectEvent) => void;

export class ClineRuntimeAdapter {
	private core: ClineCore | undefined;
	private projectListeners = new Set<ProjectListener>();
	private coreUnsubscribe: (() => void) | undefined;
	private readonly sessions = new Map<string, AgentSession>();

	/** Create the underlying Cline Core runtime (local, in-process). Idempotent. */
	async create(clientName = "cline-project-os"): Promise<void> {
		if (this.core) return;
		this.core = await ClineCore.create({
			clientName,
			backendMode: "local",
			toolPolicies: buildToolPolicies(),
		});
		// One global subscription; events are normalized and broadcast.
		this.coreUnsubscribe = this.core.subscribe((event: CoreSessionEvent) => {
			this.onCoreEvent(event);
		});
	}

	subscribe(listener: ProjectListener): () => void {
		this.projectListeners.add(listener);
		return () => this.projectListeners.delete(listener);
	}

	async startSession(req: StartSessionRequest): Promise<AgentSession> {
		const core = this.requireCore();
		const systemPrompt =
			req.systemPrompt ??
			"You are a Project OS agent. Follow workspace rules, keep changes small, and produce evidence.";
		const result = await core.start({
			prompt: req.prompt,
			mode: "act",
			sessionMetadata: req.sessionMetadata,
			config: {
				providerId: req.providerId,
				modelId: req.modelId,
				apiKey: req.apiKey,
				baseUrl: req.baseUrl,
				cwd: req.cwd,
				enableTools: req.enableTools ?? true,
				enableSpawnAgent: true,
				enableAgentTeams: false,
				systemPrompt,
			},
		});
		const session: AgentSession = {
			sessionId: result.sessionId,
			status: "running",
			startedAt: Date.now(),
			prompt: req.prompt,
			providerId: req.providerId,
			modelId: req.modelId,
		};
		this.sessions.set(session.sessionId, session);
		this.broadcast({ type: "session_started", agentId: session.sessionId, at: Date.now() });
		return session;
	}

	/** Send a follow-up turn to an active session. */
	async send(sessionId: string, prompt: string): Promise<AgentResult | undefined> {
		const core = this.requireCore();
		return core.send({ sessionId, prompt, mode: "act", delivery: "queue" });
	}

	async abort(sessionId: string): Promise<void> {
		const core = this.requireCore();
		await core.abort(sessionId);
	}

	async stop(sessionId: string): Promise<void> {
		const core = this.requireCore();
		await core.stop(sessionId);
	}

	async get(sessionId: string): Promise<SessionRecord | undefined> {
		const core = this.requireCore();
		return core.get(sessionId);
	}

	async list(limit = 50): Promise<SessionHistoryRecord[]> {
		const core = this.requireCore();
		return core.list(limit);
	}

	async getUsage(sessionId: string): Promise<SessionUsageSummary | undefined> {
		const core = this.requireCore();
		return core.getAccumulatedUsage(sessionId);
	}

	getSessions(): AgentSession[] {
		return [...this.sessions.values()];
	}

	getSession(sessionId: string): AgentSession | undefined {
		return this.sessions.get(sessionId);
	}

	private onCoreEvent(event: CoreSessionEvent): void {
		for (const projectEvent of normalizeCoreEvent(event)) {
			// Keep session status roughly in sync with project events.
			if (projectEvent.type === "status") {
				const s = this.sessions.get(projectEvent.agentId);
				if (s) s.status = projectEvent.status;
			}
			if (projectEvent.type === "session_ended") {
				const s = this.sessions.get(projectEvent.agentId);
				if (s) s.status = "ended";
			}
			this.broadcast(projectEvent);
		}
	}

	private broadcast(event: ProjectEvent): void {
		for (const l of this.projectListeners) {
			try {
				l(event);
			} catch {
				// Listeners must not break the runtime adapter.
			}
		}
	}

	private requireCore(): ClineCore {
		if (!this.core) {
			throw new Error("ClineRuntimeAdapter not created. Call create() first.");
		}
		return this.core;
	}

	async dispose(): Promise<void> {
		this.projectListeners.clear();
		this.coreUnsubscribe?.();
		this.coreUnsubscribe = undefined;
		if (this.core) {
			await this.core.dispose();
			this.core = undefined;
		}
		this.sessions.clear();
	}
}
