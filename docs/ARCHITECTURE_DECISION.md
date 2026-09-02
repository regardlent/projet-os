# ARCHITECTURE DECISION — Cline Project OS

Statut : `PASS` (décision documentée et appliquée). Cible : une extension VS Code autonome
(chantier greenfield) qui consomme le **vrai SDK Cline** via sa surface publique.

## 1. Contexte

La mission décrit une « Cline Project OS / Workspace OS / Artifact Agent Control Center ».
Le workspace ouvert (`prob-reddit`) est une application **Python** sans infra extension ni SDK
Cline. Décision utilisateur : construire l'extension **séparément** (`project-os/`) en
TypeScript, en la branchant sur un **vrai `@cline/sdk`** audité, et en respectant
`SOURCE-FIRST` / `INSTALLED TYPES WIN` / `NO FAKE API`.

## 2. Décision retenue

| Sujet | Décision |
|---|---|
| Type | Extension VS Code (ESM, `"type": "module"`) |
| Runtime Cline | `@cline/sdk@0.0.81` via `ClineCore` (backend `local`, in-process) |
| Session | `ClineCore.create` + `start({ prompt, config })` ; suivi via `subscribe` |
| Événements | `CoreSessionEvent` → `ProjectEvent` via `RuntimeEventNormalizer` |
| Permissions | `toolPolicies: Record<string, ToolPolicy>` construit par `PermissionsAdapter` |
| Persistance | `ArtifactStore` : index JSON + fichiers de contenu, écritures atomiques |
| UI | TreeView natif + 1 WebviewPanel Control Center sécurisé |
| Package manager | npm (existant) — conservé, aucun changement |

## 3. Architectures rejetées

- **Fork de Cline / injection DOM de l'extension Cline** : rejeté (privé, non supporté, interdit).
- **Importer les `.d.ts` internes de `@cline/core` directement** : rejeté ; on passe par
  `@cline/sdk` (barrel public).
- **CommonJS + require du SDK** : rejeté car `@cline/sdk` est un module ECMAScript ;
  on émet en ESM.
- **Webview custom pour tout** : rejeté ; priorité aux API natives (TreeView, QuickPick, éditeur),
  un seul Webview pour le Control Center.

## 4. APIs publiques utilisées (type réel vérifié)

Depuis `@cline/sdk` :
- `ClineCore.create({ clientName, backendMode, toolPolicies })`
- `core.start({ prompt, mode, sessionMetadata, config })` (config = `ClineCoreStartConfig`)
- `core.send({ sessionId, prompt, mode, delivery })`
- `core.abort(sessionId)`, `core.stop(sessionId)`, `core.dispose()`
- `core.get(sessionId)`, `core.list(limit)`, `core.getAccumulatedUsage(sessionId)`
- `core.subscribe(listener)` → `{ type: "chunk" | "hook" | "ended" | "status" | ... }`
- Types : `ToolPolicy`, `CoreSessionEvent`, `SessionRecord`, `SessionHistoryRecord`,
  `SessionUsageSummary`, `AgentResult`

## 5. API privées / internes ÉVITÉES

Aucune importation de modules internes `@cline/*` (ex. `runtime/host`, `session/...`).
L'adapter n'expose jamais les événements bruts hors normalisation. Les événements internes
(`session_started`, `tool_started`, …) sont **nos** contrats, pas des événements SDK.

## 6. Runtime

- Node 24 (environnement), `@cline/sdk@0.0.81`, TypeScript 5.5, `@types/vscode@1.90`.
- Module ESM. Entrypoint `dist/extension.js`.

## 7. Sécurité

- `toolPolicies` : lecture seule auto-approuvée ; écriture/shell/réseau => approbation ;
  deploy/push/destructif => **désactivé**. Outils inconnus non couverts => signalés.
- Webview : CSP stricte + nonce + `localResourceRoots` vide + validation des messages.
- Persistance : filtrage de traversée de chemin sur les lectures de contenu.
- Pas de secret, pas de télémétrie externe, pas de publication auto.

## 8. Limites connues (Phase 1)

- **Éditeur natif ESM** : dépend du support VS Code ≥1.82 ; runtime non vérifié ici (UNVERIFIED).
- **Antigravity** : non testé → `UNVERIFIED` / `BLOCK`.
- **Pas de Git dans le workspace** : waves Git/worktree/checkpoint non applicables (hors scope).
- **Multi-agent/teams, MCP, Task/Testing API, Release** : non implémentés (waves suivantes).
- L'adapter `create()`/`start()` n'a pas été exécuté contre un provider réel ici (nécessite clé/vrai run).

---

## 9. PHASE 2 — migrations, runtime, workspace

### Emplacement canonique
- Migration passée de l'ancien `project-os/` vers `C:\Users\eiden\Desktop\dev\projet-os` (copie, pas de move).
- Ancien dossier préservé. Voir `artifacts/WORKSPACE_MIGRATION.md` + `WORKSPACE_MIGRATION_MANIFEST.json`.

### Provider strategy (vérifiée à l'exécution)
- Provider local OpenAI-compatible (LocalAI `http://localhost:8080/v1`, model `qwen3-4b`) détecté.
- Config `start` exacte : `providerId, modelId, apiKey?, baseUrl?, cwd, enableTools,
  enableSpawnAgent, enableAgentTeams, systemPrompt` — les booléens camelCase `enableSpawnAgent`/
  `enableAgentTeams` sont REQUIS par le runtime local (les `.d.ts` avaient raison).
- **Échec honnête** : le provider `openai` renvoie `Unknown or disabled provider` ; l'inférence
  modèle n'est PAS prouvée (usage=0). Le **cycle de vie SDK** est prouvé (voir RUNTIME_PROOF).

### Nouveaux modules ajoutés
| Module | Rôle |
|---|---|
| `runtime/ProviderPreflight.ts` | santé provider (AVAILABLE/UNAVAILABLE/AUTH_REQUIRED/...) sans secret |
| `runtime/StreamingBuffer.ts` | flush groupé pour le streaming |
| `observability/OutputChannel.ts` | logger structuré + redaction de secrets |
| `workspace/WorkspaceTopology.ts` | SINGLE/MULTI/EMPTY + racine canonique |
| `workspace/WorkspaceTrustGuard.ts` | opérations autorisées selon trust |

### Runtime
- Cycle ClineCore (create/start/subscribe/sessionId/usage/stop/dispose) : prouvé réel.
- Inférence modèle : **BLOCK** (provider non activé) — prochaine étape avant LOCAL_RUNTIME_READY.

