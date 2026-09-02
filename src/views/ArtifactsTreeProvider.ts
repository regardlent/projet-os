/**
 * ArtifactsTreeProvider
 *
 * A permanent VS Code TreeView of artifacts. Each item shows icon, title,
 * type, status, and version. Refreshes whenever the registry changes.
 */
import * as vscode from "vscode";
import type { ArtifactRegistry } from "../artifacts/ArtifactRegistry.js";
import type { ArtifactRecord } from "../artifacts/Artifact.js";

export class ArtifactNode extends vscode.TreeItem {
	constructor(public readonly record: ArtifactRecord) {
		super(record.title, vscode.TreeItemCollapsibleState.None);
		this.description = `${record.type} · ${record.status} · v${record.version}`;
		this.tooltip = `${record.title}\n${record.type} · ${record.status} · v${record.version}\n${record.contentUri}`;
		this.iconPath = new vscode.ThemeIcon(statusIcon(record.status));
		this.contextValue = "artifact";
		this.id = record.id;
	}
}

function statusIcon(status: string): string {
	switch (status) {
		case "VERIFIED":
		case "APPROVED":
			return "check";
		case "READY_FOR_REVIEW":
			return "eye";
		case "CHANGES_REQUESTED":
			return "warning";
		case "FAILED":
		case "SUPERSEDED":
			return "error";
		case "ARCHIVED":
			return "archive";
		default:
			return "file";
	}
}

export class ArtifactsTreeProvider implements vscode.TreeDataProvider<ArtifactNode> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<
		ArtifactNode | undefined | void
	>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly registry: ArtifactRegistry) {
		// Refresh whenever the registry mutates.
		registry.onChange(() => this.refresh());
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: ArtifactNode): vscode.TreeItem {
		return element;
	}

	getChildren(): ArtifactNode[] {
		return this.registry.list().map((r) => new ArtifactNode(r));
	}

	getParent(): undefined {
		return undefined;
	}
}
