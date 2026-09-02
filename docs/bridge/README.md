# README — ChatGPT Web ↔ MCP ↔ Project-OS ↔ Antigravity bridge

## Architecture

```
CHATGPT WEB (futur)
   ↓ (Secure MCP Tunnel, abstrait)
CUSTOM MCP APP / CLIENT MCP
   ↓ streamable-http / in-memory (127.0.0.1)
McpBridge ── McpServerAdapter (@modelcontextprotocol/sdk v1.30)
      ├── BridgeToolRegistry (10 tools)
      ├── WorkspaceBoundary  (Windows path security)
      ├── ApprovalService    (FAIL-CLOSED)
      ├── AntigravityAdapter (agy CLI, détection honnête)
      ├── ProcessRunner      (spawn borné)
      └── AuditLogger        (logs JSON + redaction)
```

## Prérequis
- Node ≥ 18 (testé en v24), `@modelcontextprotocol/sdk@1.30.0` (déjà installé).
- (Optionnel) CLI `agy` d'Antigravity pour la lane agent ; s'il est absent ⇒ `ANTIGRAVITY_RUNTIME = BLOCKED_ENV` (honnête, pas de faux PASS).

## Config (env, fail-closed)
| Var | Défaut | Note |
|---|---|---|
| `BRIDGE_ENABLED` | 1 | `0` désactive sans toucher Project-OS |
| `BRIDGE_HOST` | `127.0.0.1` | loopback uniquement |
| `BRIDGE_PORT` | 8412 | 1024..65535 |
| `BRIDGE_WRITE_ENABLED` | 1 | `0` désactive exec/write |
| `BRIDGE_APPROVAL` | `approval-required` | read auto-approve si workspace approuvé |
| `BRIDGE_TIMEOUT_MS` | 60000 | |
| `BRIDGE_MAX_OUTPUT_BYTES` | 1000000 | |
| `BRIDGE_MAX_READS` | 4 | concurrency |
| `BRIDGE_MAX_RUNS` | 1 | |
| `BRIDGE_QUEUE_LIMIT` | 64 | |
| `BRIDGE_MAX_RUNTIME_MS` | 1800000 | |
| `PROJECT_OS_AGY_PATH` | - | chemin explicite du CLI agy |

## Commandes
- `npm run typecheck` / `npm test` (364 test).
- `node scratch/bridge-e2e-evidence.mjs` → preuve E2E locale.
- Commande Project-OS : `/bridge status|doctor|tools|start|stop` (enregistrée dans `projectFactoryCommands.ts`).
- **Module CLI ChatGPT Web** `src/commands/bridgeCommands.ts` : `/bridge status|start|stop|restart|health|tools|test|tunnel`,
  enregistré dans `bin/project-os-bridge.mjs` (le CLI Project-OS dispatch les slash commands).
  - `status` / `status --format=json` → état réel (port/host/enabled/writeEnabled/approvalMode + `running`/`pid`).
  - `start` → démarre le serveur détaché (`dist/integrations/bridge/bridge-server.js`) et attend le `/healthz`.
  - `stop` → termine le process (SIGTERM sur POSIX, `taskkill /T /F` sur Windows) et supprime le lock PID.
  - `restart` → stop + start.
  - `health` → `GET /healthz` du serveur en vie (`running`, `pid`).
  - `tools` / `test` / `tunnel` → inventaire, suite d'intégration, guide OpenAI tunnel-client.

## Bridge local (no-auth, Mode A) — ✅ VOIE RETENUE (gratuit)
- Décision : **on garde le bridge local gratuit**. Le tunnel OpenAI est **optionnel** et reste bloqué (tunnels org non disponibles sur le compte de l'utilisateur → pas de clé runtime org).
- `npm run bridge:local`            → start + verify `tools/list` (laisse tourner) ; `npm run bridge:local:once` → cycle complet.
- `node scripts/bridge-local.mjs [start|once|stop|status|tunnel]` (équivalent).
- Valide le mode **no-auth local** : `/healthz` et `POST /mcp` (tools/list → 10 outils) **sans aucun token** — 100 % gratuit, aucune clé requise.

## Tunnel init (optionnel, secrets via env, jamais stockés)
- `npm run tunnel:init` → `node scripts/tunnel-init.mjs status` ; sous-commandes `create | init | doctor | run | all`.
- **Sécurité** : lit `PROJECT_OS_TUNNEL_ID`, `CONTROL_PLANE_API_KEY`, `OPENAI_ADMIN_KEY`, `PROJECT_OS_ORG_ID`, `PROJECT_OS_WS_ID` depuis l'environnement uniquement ; les affiche **masqués** (présence oui/non), jamais la valeur.
- Flux : `create` (admin key + org/ws) → `init` (tunnel-id + clé contrôle-plane) → `doctor` → `run` → `status` (mcp_url).
- ⚠️ `tunnel-mode` nécessite un compte org OpenAI avec `Tunnels Read/Manage/Use` (Business/Enterprise) + clé **runtime org**. Non disponible ici → tunnel inactif, bridge local conservé.

## Serveur MCP standalone
- Entrypoint : `src/integrations/bridge/bridge-server.ts` (compilé vers `dist/integrations/bridge/bridge-server.js`).
- `node dist/integrations/bridge/bridge-server.js` démarre le servant en foreground ; `--foreground` explicite.
- Loopback uniquement (rejet non-loopback), PID lock sous `<controlRoot>/.project-os-cli/bridge.pid`, arrêt propre (SIGINT/SIGTERM).

## Outils MCP (10)
`bridge_health`, `project_status`, `project_tree`, `file_read`, `code_search`, `git_status`, `git_diff` (read) · `tests_run`, `build_run` (scripts allowlist) · `antigravity_run` (approval).

## Permissions
Read auto-approuvées dans workspace approuvé ; exécutions/écritures `needs-approval` ; réseau/suppression inconnus `denied`.

## Antigravity CLI
- Adapté au CLI officiel headless : `agy -p "<prompt>" --output-format json --print-timeout 5m [--sandbox]`.
- `--dangerously-skip-permissions` **jamais** émis.
- Statuts : SUCCESS/ERROR/CANCELED/INTERRUPTED/INVALID/WAITING/RUNNING.

## ChatGPT Web / Secure MCP Tunnel
- Orchestration (`src/integrations/bridge/tunnelClient.ts`) : profil `project-os`, `localMcpUrl`, `findTunnelClient`, `tunnelStatus`, `initProfile` (sample `sample_mcp_remote_no_auth`), `adminTunnelsCreate`, `doctor`, `run`.
- Commande : `/bridge tunnel [--status|--init|--create|--doctor|--run]`. Détection honnête (jamais de faux PASS) : si `tunnel-client` absent → `TUNNEL_NOT_DETECTED` + instructions opérateur.
- **Installation** : `tunnel-client` v0.0.14 installé depuis `github.com/openai/tunnel-client` (`go install github.com/openai/tunnel-client/cmd/client@latest`), alias `tunnel-client.exe` dans `%USERPROFILE%\go\bin`. Détecté par le module (`TUNNEL_READY`).

### Mode local sans auth (Mode A) — ✅ actif
- Serveur MCP HTTP local `http://127.0.0.1:8412/mcp`, **aucune authentification** requise (appel direct `tools/list` → 10 outils ; `/healthz` → running). Prouvé.
- Usage : client MCP sur la même machine, ou via le tunnel une fois profil initialisé.

### Mode tunnel OpenAI (no-auth côté serveur MCP)
- Le profil utilise le sample **`sample_mcp_remote_no_auth`** (serveur MCP HTTP sans OAuth/PRMD).
- ⚠️ Même en no-auth, le **contrôle-plane OpenAI reste authentifié** : il faut `--tunnel-id` (`PROJECT_OS_TUNNEL_ID`) + `CONTROL_PLANE_API_KEY`. `init`/`run` ne peuvent pas fabriquer ces valeurs.
- Étapes : créer le tunnel (`platform.openai.com/settings/organization/tunnels`) → `$env:PROJECT_OS_TUNNEL_ID="tunnel_..."` ; `$env:CONTROL_PLANE_API_KEY="sk-..."` → `/bridge tunnel --init` → `/bridge tunnel --doctor` → `/bridge tunnel --run`.
- Configuration `tunnelMode` : `false | "secure-mcp-tunnel"` (dans `config.ts`).
- `SECURE_TUNNEL_API = VERIFIED_DOCUMENTED` ; tunnel actif = `USER_ACTION_REQUIRED` (clé contrôle-plane OpenAI absente sur l'hôte).
- `CHATGPT_WEB_LIVE_E2E = NOT_TESTED` tant qu'un vrai appel depuis ChatGPT Web n'a pas eu lieu.
- `CHATGPT_BRIDGE_LOCAL_READY = PASS` (preuve locale : client SDK ↔ serveur SDK).

## Troubleshooting
- Port occupé ⇒ changer `BRIDGE_PORT`.
- `agy` absent ⇒ doctor indique BLOCKED_ENV (normal).
- `npm test` rouge ⇒ lancer `npm run compile` avant.

## Tests / sécurité / rollback
Voir `TEST_MATRIX.md`, `SECURITY_MODEL.md`, `ROLLBACK.md`, `GOAL_CONTRACT_BEFORE.md`.
- Évidence du module CLI : `evidence/CLI_MODULE_QA.md` (goal de développement atteint : compile 0, 22 tests module, cycle réel validé, tunnel honnête).