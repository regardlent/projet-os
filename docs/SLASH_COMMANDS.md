# SLASH COMMANDS — Phase 13

> Commandes slash Project OS (control plane). Implémentées dans `src/projects/SlashCommands.ts`.
> Commandes VS Code : `clineProjectOS.goal` / `clineProjectOS.create` / `clineProjectOS.addon` /
> `clineProjectOS.slash`.

## /goal <objective>
Définit/met à jour le goal du projet actif (ou `--project=<slug>`).
```text
/goal Créer un IDE C++ Windows rapide, stable et portable.
/goal --project=vulnforge-next --accept=compiles,fast "Build a fast C++ IDE"
```
Écrit `.project-os/goal.json` + history `.project-os/goal-history.jsonl` (append-only), met à jour le
registry hub. N'entraîne aucun codage automatique (définition d'intention).

## /create <name> [--type=<t>] [--goal="..."] [--git=false]
Crée un projet géré sous `PROJECTS_ROOT` (défaut `C:\Users\eiden\Desktop\dev\projects\<slug>`).
```text
/create vulnforge-next --type=typescript --goal="Lab sécurité local-only"
```
Pipeline : VALIDATE → ID → dirs → manifest → goal → base files → git → registry → READY.
- `PROJECT_ALREADY_EXISTS` / `PATH_TRAVERSAL_BLOCKED` si invalide.
- `--type=` accepté : auto,node,typescript,python,cpp,rust,go,web,desktop,docker,localai,empty.

## /autonomy [--minutes=N | --complexity=small|medium|large|auto]
Paramètre un budget de minutes pour un run autonome sur le goal du projet actif. Un projet plus gros /
complexe = plus de minutes (heuristique). Produit un plan + handoff (résumé à la fin).
```text
/autonomy --minutes=120
/autonomy --complexity=medium        → 45 min
/autonomy                            → auto (complexité calculée)
```
Écrit `.project-os/autonomy.json` (plan: minutes, complexity, steps, checkpoints, deadline) et
`.project-os/handoff.md` (starter). Config `clineProjectOS.defaultAutonomyMinutes` (0 = auto).
`summarizeAutonomy(plan, activity)` génère le résumé/rapport final.

### `/autonomy run --write`
Lane **WRITE** bornée et approuvable (jamais d'écriture aveugle). `--write` produit :
`.project-os/write-plan.json` + `.project-os/write-scope.json` (ops CREATE/MODIFY/PATCH only,
`maxFiles` 5/15/30≤50, `delete`/`rename` bloqués, `.git`/`node_modules`/`dist`/`build`/`.project-os`/`.agents`
protégés, `.env`/`.pem`/`id_rsa`/`credentials*` secrets bloqués). Config `clineProjectOS.autonomyWriteEnabled`.
Tool policies write (`editor`/`apply_patch`/`write_file`) `autoApprove=false` ; read auto-approve ;
`deploy`/`publish`/`git_push` désactivés. Approbation explicite requise avant toute mutation.
## /addon list | recommended | install | disable | enable | uninstall | health
Gère les addons **workspace** du projet actif (`.agents/`, `.project-os/addons.lock.json`).
```text
/addon list                 → addons installés (enabled/disabled)
/addon recommended          → profils proposés (core + stack selon projectType)
/addon install <id>         → stage le profil sous .agents/ + lock (idempotent)
/addon disable <id>         → désactive (fichiers conservés)
/addon enable <id>          → réactive (idempotent)
/addon uninstall <id>       → backup dans .project-os/addon-backups puis retrait
/addon health               → état + conflits (commandes/MCP/agents dupliqués)
```
- Catalog Profils : `project-os-core`, `project-os-typescript`, `-node`, `-python`, `-cpp`, `-rust`,
  `-go`, `-web`, `-docker`, `-localai`, `-desktop`, `-empty` (définis dans `AddonCatalog.ts`).
- Sécurité : tous les profils Project OS = `remoteCode:false, scripts:false, network:false`. Aucun script
  exécuté, aucun fetch distant, aucun MCP global. Les fichiers materialisés sous `.agents/` (rules/skills).
- `/create` installe automatiquement le span `project-os-core` + profil stack.

## /bridge status | start | stop | restart | health | tools | test | tunnel
Module **ChatGPT Web Bridge** (MCP). Pilote le serveur MCP loopback (`http://127.0.0.1:8412/mcp`)
et la mise en place du tunnel sécurisé vers ChatGPT.
```
/bridge                    → usage du module
/bridge status             → état du serveur MCP (loopback, transport streamable-http)
/bridge status --format=json → JSON machine (port, enabled, writeEnabled, approvalMode)
/bridge start              → démarre le serveur MCP détaché (`dist/integrations/bridge/bridge-server.js`)
/bridge stop               → termine le serveur (taskkill sur Windows) et supprime le lock PID
/bridge restart            → stop + start
/bridge health             → santé bridge MCP (version, mcp, transport, antigravity)
/bridge tools              → liste des 10 outils MCP + class + approbation
/bridge test               → statut de la suite d'intégration MCP
/bridge tunnel             → état honnête du tunnel OpenAI (détection tunnel-client + local up)
/bridge tunnel --init      → `tunnel-client init --profile project-os --mcp-server-url <local mcp>`
/bridge tunnel --create    → `tunnel-client admin tunnels create` (nécessite admin key + org/ws id)
/bridge tunnel --doctor    → `tunnel-client doctor --profile project-os --explain`
/bridge tunnel --run       → `tunnel-client run --profile project-os`
/bridge tunnel --status    → état honnête (même sortie que `/bridge tunnel`)
```
- Implémentation : `src/commands/bridgeCommands.ts` ; enregistrement `/bridge` dans `bin/project-os-bridge.mjs`.
- Les 10 outils MCP (`bridge_health`, `project_status`, `project_tree`, `file_read`, `code_search`,
  `git_status`, `git_diff`, `tests_run`, `build_run`, `antigravity_run`) sont servis par le module
  `src/integrations/bridge/`.
- Sécurité : lecture auto-approuvée dans un workspace approuvé ; `tests_run`/`build_run`/`antigravity_run`
  nécessitent approbation ; `network`/`dangerous`/`unknown` bloqués. Le serveur ne se lie qu'en loopback
  (protection DNS-rebinding).

## Options par défaut
- Scope addon = workspace (`.agents/`), jamais global par défaut.
- Provider Cline = `openai-compatible` ; base URL LocalAI via config centrale (`http://127.0.0.1:8080/v1`).
- Bridge MCP : `enabled` (défaut selon config), `writeEnabled`, `approvalMode`, host/port loopback.

## Sécurité
- Écriture nouvelle uniquement dans PROJECTS_ROOT (pas d'overwrite, pas d'escape).
- `/goal` sans shell. `/addon` install workspace-scoped. Global = approbation explicite séparée.
- Pas de secret copié ; `.env.example` placeholders.
