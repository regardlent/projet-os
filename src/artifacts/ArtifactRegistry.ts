/**
 * ArtifactRegistry
 *
 * In-memory, persistence-backed registry of artifacts. Enforces the state
 * machine on transitions and emits change notifications so the UI can refresh.
 *
 * Pure module: no `vscode` import (its emitter is a plain callback registry),
 * so it is unit-testable.
 */
import * as crypto from "node:crypto";
import type {
	Artifact,
	ArtifactComment,
	ArtifactRecord,
	ArtifactSearchFilter,
	ArtifactStatus,
	ArtifactType,
} from "./Artifact.js";
import { sha256, ArtifactStore } from "./ArtifactStore.js";
import { assertValidTransition } from "./ArtifactStateMachine.js";

type ChangeListener = (reason: string, affectedId: string | undefined) => void;

export interface CreateArtifactInput {
	type: ArtifactType;
	title: string;
	content: string;
	agentId?: string;
	sessionId?: string;
	runId?: string;
	parentArtifactId?: string;
	sourceFiles?: string[];
	metadata?: Record<string, unknown>;
	extension?: string;
}

export class ArtifactRegistry {
	private readonly store: ArtifactStore;
	private readonly listeners: ChangeListener[] = [];

	constructor(store: ArtifactStore) {
		this.store = store;
		// Load persisted artifacts up-front so a fresh registry sees prior data.
		this.store.load();
	}

	onChange(listener: ChangeListener): () => void {
		this.listeners.push(listener);
		return () => {
			const idx = this.listeners.indexOf(listener);
			if (idx >= 0) this.listeners.splice(idx, 1);
		};
	}

	private notify(reason: string, affectedId: string | undefined): void {
		for (const l of this.listeners) {
			try {
				l(reason, affectedId);
			} catch {
				// A failing listener must never break the registry.
			}
		}
	}

	create(input: CreateArtifactInput): ArtifactRecord {
		const id = crypto.randomUUID();
		const now = Date.now();
		const sha = sha256(input.content);
		const contentUri = this.store.writeContent(
			id,
			1,
			input.content,
			input.extension ?? "md",
		);
		const record: ArtifactRecord = {
			id,
			version: 1,
			type: input.type,
			title: input.title,
			status: "DRAFT",
			agentId: input.agentId,
			sessionId: input.sessionId,
			runId: input.runId,
			parentArtifactId: input.parentArtifactId,
			createdAt: now,
			updatedAt: now,
			contentUri,
			sourceFiles: input.sourceFiles ?? [],
			comments: [],
			pinned: false,
			archived: false,
			metadata: input.metadata ?? {},
			sha256: sha,
		};
		this.store.upsert(record);
		this.notify("created", id);
		return record;
	}

	/** Persist a new content version; increments version and re-hashes. */
	updateContent(id: string, content: string, extension = "md"): ArtifactRecord {
		const record = this.mustGet(id);
		const nextVersion = record.version + 1;
		const contentUri = this.store.writeContent(id, nextVersion, content, extension);
		const next: ArtifactRecord = {
			...record,
			version: nextVersion,
			contentUri,
			updatedAt: Date.now(),
			sha256: sha256(content),
		};
		this.store.upsert(next);
		this.notify("updated", id);
		return next;
	}

	transition(id: string, to: ArtifactStatus): ArtifactRecord {
		const record = this.mustGet(id);
		assertValidTransition(record.status, to);
		const next: ArtifactRecord = { ...record, status: to, updatedAt: Date.now() };
		this.store.upsert(next);
		this.notify("transition", id);
		return next;
	}

	/** Convenience review actions, each a valid transition. */
	requestReview(id: string): ArtifactRecord {
		return this.transition(id, "READY_FOR_REVIEW");
	}
	approve(id: string): ArtifactRecord {
		return this.transition(id, "APPROVED");
	}
	reject(id: string): ArtifactRecord {
		return this.transition(id, "CHANGES_REQUESTED");
	}
	verify(id: string): ArtifactRecord {
		return this.transition(id, "VERIFIED");
	}
	fail(id: string): ArtifactRecord {
		return this.transition(id, "FAILED");
	}

	addComment(id: string, author: string, text: string): ArtifactRecord {
		const record = this.mustGet(id);
		const comment: ArtifactComment = {
			id: crypto.randomUUID(),
			author,
			text,
			at: Date.now(),
		};
		const next: ArtifactRecord = {
			...record,
			comments: [...record.comments, comment],
			updatedAt: Date.now(),
		};
		this.store.upsert(next);
		this.notify("comment", id);
		return next;
	}

	setPinned(id: string, pinned: boolean): ArtifactRecord {
		const record = this.mustGet(id);
		const next: ArtifactRecord = { ...record, pinned, updatedAt: Date.now() };
		this.store.upsert(next);
		this.notify("pin", id);
		return next;
	}
	// Archive/restore are modelled as state-machine transitions where possible.
	archive(id: string): ArtifactRecord {
		const record = this.mustGet(id);
		if (record.status === "ARCHIVED") return record;
		const next: ArtifactRecord = { ...record, archived: true, updatedAt: Date.now() };
		if (record.status !== "SUPERSEDED") {
			try {
				assertValidTransition(record.status, "ARCHIVED");
				next.status = "ARCHIVED";
			} catch {
				// Not allowed directly: keep status but mark as archived.
			}
		} else {
			next.status = "ARCHIVED";
		}
		this.store.upsert(next);
		this.notify("archive", id);
		return next;
	}

	restore(id: string): ArtifactRecord {
		const record = this.mustGet(id);
		let target: ArtifactStatus = record.status === "ARCHIVED" ? "READY_FOR_REVIEW" : record.status;
		// ARCHIVED -> READY_FOR_REVIEW is not allowed, so fall back.
		if (record.status === "ARCHIVED") {
			if (!transitionAllowed("ARCHIVED", target)) target = "DRAFT";
		}
		const next: ArtifactRecord = {
			...record,
			archived: false,
			status: target,
			updatedAt: Date.now(),
		};
		this.store.upsert(next);
		this.notify("restore", id);
		return next;
	}

	get(id: string): Artifact | undefined {
		return this.store.get(id);
	}

	list(): ArtifactRecord[] {
		return this.store.list();
	}

	search(filter: ArtifactSearchFilter = {}): ArtifactRecord[] {
		return this.store.list().filter((a) => {
			if (filter.types && filter.types.length > 0 && !filter.types.includes(a.type)) {
				return false;
			}
			if (filter.status && filter.status.length > 0 && !filter.status.includes(a.status)) {
				return false;
			}
			if (filter.agentId && a.agentId !== filter.agentId) return false;
			if (filter.sessionId && a.sessionId !== filter.sessionId) return false;
			if (filter.pinned !== undefined && a.pinned !== filter.pinned) return false;
			if (filter.archived !== undefined && a.archived !== filter.archived) return false;
			if (filter.query) {
				const q = filter.query.toLowerCase();
				const haystack = `${a.title} ${a.type} ${a.sourceFiles.join(" ")} ${a.comments
					.map((c) => c.text)
					.join(" ")}`.toLowerCase();
				if (!haystack.includes(q)) return false;
			}
			return true;
		});
	}

	count(filter: ArtifactSearchFilter = {}): number {
		return this.search(filter).length;
	}

	readContent(record: { contentUri: string }): string {
		return this.store.readContent(record.contentUri);
	}

	private mustGet(id: string): ArtifactRecord {
		const record = this.store.get(id);
		if (!record) {
			throw new Error(`Artifact not found: ${id}`);
		}
		return record;
	}
}

function transitionAllowed(from: ArtifactStatus, to: ArtifactStatus): boolean {
	try {
		assertValidTransition(from, to);
		return true;
	} catch {
		return false;
	}
}
