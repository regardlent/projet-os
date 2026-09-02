/**
 * ProjectsTreeProvider — Control Center view of managed projects (Phase 13).
 * Lists ManagedProjectManifest entries from the hub registry, with children
 * carrying status / goal / git / addons / workspace. Refreshes on change.
 */
import * as vscode from "vscode";
import type { ManagedProjectRegistry } from "../projects/ManagedProjectRegistry.js";
import type { ManagedProjectManifest } from "../projects/projectTypes.js";

export class ProjectNode extends vscode.TreeItem {
	constructor(public readonly manifest: ManagedProjectManifest) {
		super(manifest.name, vscode.TreeItemCollapsibleState.Expanded);
		this.description = `${manifest.status} · ${manifest.projectType} · ${manifest.addons.length} addon(s)`;
		this.tooltip = `${manifest.name}\n${manifest.slug}\n${manifest.workspaceRoot}\n${manifest.status}`;
		this.iconPath = new vscode.ThemeIcon("folder");
		this.contextValue = "managedProject";
		this.id = manifest.projectId;
		this.command = { command: "clineProjectOS.project.status", title: "Status", arguments: [manifest.slug] };
	}
}

export class InfoNode extends vscode.TreeItem {
	constructor(label: string, description: string, icon = "info") {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.description = description;
		this.iconPath = new vscode.ThemeIcon(icon);
		this.contextValue = "projectInfo";
	}
}

export class ProjectsTreeProvider implements vscode.TreeDataProvider<ProjectNode | InfoNode> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<ProjectNode | InfoNode | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly registry: ManagedProjectRegistry) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: ProjectNode | InfoNode): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ProjectNode | InfoNode): (ProjectNode | InfoNode)[] {
		if (element) {
			if (element instanceof ProjectNode) {
				const m = element.manifest;
				const goal = m.goal?.objective ? `"${m.goal.objective.slice(0, 44)}"` : "(none)";
				return [
					new InfoNode("Status", m.status, "gear"),
					new InfoNode("Type", m.projectType, "symbol-structure"),
					new InfoNode("Goal", goal, "target"),
					new InfoNode("Git", m.git.initialized ? "initialized" : "not initialized", "git-branch"),
					new InfoNode("Addons", m.addons.join(", "), "extensions"),
					new InfoNode("Workspace", m.workspaceRoot, "folder"),
				];
			}
			return [];
		}
		return this.registry.list().map((m) => new ProjectNode(m));
	}

	getParent(): undefined {
		return undefined;
	}
}
