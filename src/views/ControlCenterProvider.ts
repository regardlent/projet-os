/**
 * ControlCenterProvider
 *
 * A compact, read-only Control Center webview. It shows honest, real data:
 * project DNA (from ProjectDNA), artifact counts (from the registry), and agent
 * sessions (from the ClineRuntimeAdapter). It is secured with a strict CSP and
 * a nonce, and validates every inbound message.
 */
import * as vscode from "vscode";
import type { ArtifactRegistry } from "../artifacts/ArtifactRegistry.js";
import type { ClineRuntimeAdapter } from "../cline/ClineRuntimeAdapter.js";
import type { ProjectDNA } from "../project/ProjectDNA.js";

type InboundMessage =
	| { type: "refresh" }
	| { type: "open_artifact"; id: string };

function isInboundMessage(value: unknown): value is InboundMessage {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	if (v.type === "refresh") return true;
	return v.type === "open_artifact" && typeof v.id === "string";
}

function nonce(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let out = "";
	for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
	return out;
}

export class ControlCenterProvider {
	private panel: vscode.WebviewPanel | undefined;

	constructor(
		private readonly registry: ArtifactRegistry,
		private readonly adapter: ClineRuntimeAdapter,
		private readonly getDna: () => ProjectDNA,
	) {
		registry.onChange(() => this.refresh());
	}

	show(): void {
		if (this.panel) {
			this.panel.reveal();
			this.refresh();
			return;
		}
		this.panel = vscode.window.createWebviewPanel(
			"clineProjectOS.controlCenter",
			"Cline Project OS",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [],
			},
		);
		this.panel.webview.onDidReceiveMessage((msg: unknown) => {
			if (!isInboundMessage(msg)) {
				// Unknown message: reject, log, never execute.
				return;
			}
			this.handleMessage(msg);
		});
		this.panel.onDidDispose(() => {
			this.panel = undefined;
		});
		this.refresh();
	}

	refresh(): void {
		if (!this.panel) return;
		this.panel.webview.html = this.render();
	}

	private handleMessage(msg: InboundMessage): void {
		if (msg.type === "open_artifact") {
			void vscode.commands.executeCommand("clineProjectOS.artifact.open", msg.id);
		}
		// "refresh" is a no-op; the DOM is rebuilt on refresh().
	}

	private render(): string {
		const nonceValue = nonce();
		const dna = this.getDna();
		const artifacts = this.registry.list();
		const sessions = this.adapter.getSessions();
		const pinned = artifacts.filter((a) => a.pinned).length;
		const pendingReview = artifacts.filter((a) => a.status === "READY_FOR_REVIEW").length;
		const verified = artifacts.filter((a) => a.status === "VERIFIED").length;
		const topLangs = Object.entries(dna.languages)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 4)
			.map(([lang, n]) => `${lang} ${n}`)
			.join(", ");

		const artifactRows = artifacts
			.slice(0, 20)
			.map(
				(a) => `<li><button data-open="${escapeHtml(a.id)}">${escapeHtml(a.title)}</button>
				<span class="muted">${escapeHtml(a.type)} · ${escapeHtml(a.status)} · v${a.version}</span></li>`,
			)
			.join("");

		return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonceValue}';" />
<style>
:root{color-scheme:light dark;--bg:var(--vscode-editor-background);--fg:var(--vscode-editor-foreground);--muted:var(--vscode-descriptionForeground);--border:var(--vscode-panel-border);}
body{font-family:var(--vscode-font-family);background:var(--bg);color:var(--fg);padding:1rem;margin:0;}
h1{font-size:1.1rem;margin:0 0 .5rem;}
.muted{color:var(--muted);font-size:.8rem;}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.5rem;margin:.75rem 0;}
.card{border:1px solid var(--border);border-radius:6px;padding:.5rem .75rem;}
.card b{font-size:1.2rem;display:block;}
ul{list-style:none;padding:0;margin:0;}
li{display:flex;gap:.5rem;align-items:baseline;padding:.25rem 0;border-bottom:1px solid var(--border);}
button{background:none;border:none;color:var(--vscode-textLink-foreground);cursor:pointer;font-size:.9rem;padding:0;text-align:left;}
</style>
</head>
<body>
<h1>Cline Project OS — Control Center</h1>
<p class="muted">Root: ${escapeHtml(dna.root)} · ${dna.totalFiles} files scanned · ${escapeHtml(topLangs)}</p>
<p class="muted">Package managers: ${escapeHtml(dna.packageManagers.join(", ") || "none")}</p>
<div class="grid">
  <div class="card"><b>${artifacts.length}</b>Artifacts</div>
  <div class="card"><b>${pinned}</b>Pinned</div>
  <div class="card"><b>${pendingReview}</b>In review</div>
  <div class="card"><b>${verified}</b>Verified</div>
  <div class="card"><b>${sessions.length}</b>Agents</div>
</div>
<h2>Agents</h2>
<ul>${sessions
	.map((s) => `<li>${escapeHtml(s.providerId)}/${escapeHtml(s.modelId)} — ${escapeHtml(s.status)}</li>`)
	.join("") || "<li class=\"muted\">No agents yet. Use “Project OS: Start Agent”.</li>"}</ul>
<h2>Recent Artifacts</h2>
<ul>${artifactRows || "<li class=\"muted\">No artifacts yet.</li>"}</ul>
<script nonce="${nonceValue}">
(function(){
  document.addEventListener('click', function(e){
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('data-open')) {
      acquireVsCodeApi().postMessage({ type: 'open_artifact', id: t.getAttribute('data-open') });
    }
  });
})();
</script>
</body>
</html>`;
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
