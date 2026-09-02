/**
 * ArtifactStore
 *
 * Persistence for artifacts: a small JSON index plus per-content files, with
 * atomic writes and an integrity guard. A single corrupt artifact must never
 * take down the whole registry — invalid records are dropped, never fatal.
 *
 * Pure module (node:fs only) so it is unit-testable.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { ArtifactRecord } from "./Artifact.js";

const INDEX_FILE = "index.json";
const CONTENT_DIR = "content";

export function sha256(data: string): string {
	return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function atomicWrite(filePath: string, data: string): void {
	const tmp = `${filePath}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, data, "utf8");
	fs.renameSync(tmp, filePath);
}

function isRecord(value: unknown): value is ArtifactRecord {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { id?: unknown }).id === "string" &&
		typeof (value as { sha256?: unknown }).sha256 === "string"
	);
}

export interface LoadResult {
	loaded: number;
	dropped: number;
	error?: string;
}

export class ArtifactStore {
	private readonly baseDir: string;
	private readonly indexPath: string;
	private readonly contentDir: string;
	private index: Record<string, ArtifactRecord> = {};

	constructor(baseDir: string) {
		this.baseDir = baseDir;
		this.indexPath = path.join(baseDir, INDEX_FILE);
		this.contentDir = path.join(baseDir, CONTENT_DIR);
	}

	/** Load the index, recovering gracefully from corruption. */
	load(): LoadResult {
		let loaded = 0;
		let dropped = 0;
		if (!fs.existsSync(this.indexPath)) {
			return { loaded: 0, dropped: 0 };
		}
		try {
			const raw = fs.readFileSync(this.indexPath, "utf8");
			const parsed: unknown = JSON.parse(raw);
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
				// Invalid schema: do not destroy the file, just start empty.
				return { loaded: 0, dropped: 0, error: "index schema invalid" };
			}
			const next: Record<string, ArtifactRecord> = {};
			for (const [id, record] of Object.entries(parsed as Record<string, unknown>)) {
				if (isRecord(record)) {
					next[id] = record;
					loaded++;
				} else {
					dropped++;
				}
			}
			this.index = next;
			return { loaded, dropped };
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			// Corrupt JSON: leave the file untouched, start with an empty index.
			this.index = {};
			return { loaded: 0, dropped: 0, error: message };
		}
	}

	list(): ArtifactRecord[] {
		return Object.values(this.index).sort((a, b) => b.updatedAt - a.updatedAt);
	}

	get(id: string): ArtifactRecord | undefined {
		return this.index[id];
	}

	upsert(record: ArtifactRecord): void {
		this.index[record.id] = record;
		this.saveIndex();
	}

	remove(id: string): void {
		if (id in this.index) {
			delete this.index[id];
			this.saveIndex();
		}
	}

	private saveIndex(): void {
		fs.mkdirSync(this.baseDir, { recursive: true });
		atomicWrite(this.indexPath, JSON.stringify(this.index, null, 2));
	}

	writeContent(id: string, version: number, content: string, extension = "md"): string {
		fs.mkdirSync(this.contentDir, { recursive: true });
		const file = path.join(this.contentDir, `${id}-v${version}.${extension}`);
		atomicWrite(file, content);
		return file;
	}

	readContent(fileName: string): string {
		const safe = path.basename(fileName);
		const full = path.join(this.contentDir, safe);
		if (!full.startsWith(this.contentDir)) {
			throw new Error("path traversal blocked");
		}
		return fs.readFileSync(full, "utf8");
	}

	contentUriFor(id: string, version: number, extension = "md"): string {
		return path.join(this.contentDir, `${id}-v${version}.${extension}`);
	}
}
