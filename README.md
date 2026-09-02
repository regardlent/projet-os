# Cline Project OS

Une extension VS Code qui branche un **Control Center / Artifact System** autour du **vrai SDK Cline** (`@cline/sdk`). Construite comme chantier greenfield **autonome** (sans dépendance à un autre projet).

> ⚠️ État : **Phase 2 — migration faite**. Typecheck (0 erreur) et **43/43 tests** passent (25 de
> base + 18 Phase 2). Le **cycle de vie ClineCore** (create/start/subscribe/sessionId/usage/stop/
> dispose) est **prouvé réel** contre un endpoint OpenAI-compatible local ; l'**inférence modèle**
> reste **BLOCK** (provider `openai` non activé, tokens=0) tant qu'un provider n'est pas configuré
> via les paramètres du SDK. L'extension host et Antigravity restent **UNVERIFIED**.
> Workspace canonique : `C:\Users\eiden\Desktop\dev\projet-os`.

## Prérequis

- Node 20+ (testé sur Node 24)
- VS Code ≥ 1.90

## Développement

```bash
cd project-os
npm install
npm run compile      # tsc -> dist/
npm run typecheck    # tsc --noEmit
npm test             # compile + node --test "dist/tests/*.test.js"
```

Pour lancer : ouvrir le dossier `project-os/` dans VS Code et F5 (extension host) —
un Launch config `Debug: Extension` est attendu (voir `.vscode/`).

## Architecture

```
ClineCore (@cline/sdk)  ──>  ClineRuntimeAdapter  ──>  RuntimeEventNormalizer
                                                                  ↓
                                        ProjectEvent (événements internes stabilisés)
                                                                  ↓
                                          ArtifactRegistry + ArtifactStore (persistance)
                                                                  ↓
                                      ArtifactsTreeProvider + ControlCenter (webview sécurisé)
```

- `ClineRuntimeAdapter` : seule chose qui importe `@cline/sdk` à l'exécution.
- `PermissionsAdapter` : politiques d'outils réelles (lecture auto-approvée ; écriture => approbation ;
  deploy/push => désactivé).
- `ArtifactRegistry` + `ArtifactStore` : state machine, versions, commentaires, review,
  persistance atomique, tolérance aux index corrompus.
- `ProjectDNA` : scan en lecture seule du stack.

## Sécurité

- Webview : CSP stricte + nonce + validation des messages.
- Outils sensibles : jamais auto-approuvés sans politique explicite.
- Pas de télémétrie externe, pas de publication automatique, pas de secret.

## Tests

- Machine à états des artifacts.
- Normalisation des événements Cline (`chunk`, `hook`, `ended`, `status`, …).
- Politiques de permissions.
- Registre + persistance + récupération de corruption.

## CLI C++ (cli-cpp)

En complément de l'extension, un **CLI C++/CMake** (`cli-cpp/`) pilote Project OS par menus ou en
mode scriptable via la passerelle Node (`bin/project-os-bridge.mjs`). Voir `cli-cpp/README.md`.

- Surface : `help`, `version`, `status`, `project list|use|inspect|watch`, `drift`, `timeline`,
  `snapshot`, `diff`, `goal proof`, `todo board`, `artifact *`, `addon verify`, `config`, `doctor`,
  `diagnostics`, `preflight`, `models`, `model *`, `route`, `gpu`, `test list|matrix`, `report`,
  `release gate`, `export sarif`, `cockpit`, `completion`, `bridge status|start|stop|…`.
- **Intelligence & analyse (10 features, phase 27+)** : `health score`, `health trend`,
  `health compare <a> [b]`, `budget forecast`, `insights tokens`, `diagnose`, `drift alert`,
  `goal traction`, `autonomy health`, `risk profile`. Bus d'analyse déterministe (read-only),
  sortie `human|json|ndjson|tsv`, dégradation propre si git/LocalAI/GPU indisponibles.
- `--format=json|ndjson|tsv`, `--color=auto|always|never`, `--timeout=<ms>`, `--explain/--dry-run`.

## Roadmap (non implémenté)

Multi-agent/teams, MCP, Task/Testing API, Git/worktree/checkpoints, Release Center,
Accessibilité/E2E Antigravity.
