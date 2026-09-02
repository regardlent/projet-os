# IMPLEMENTATION PLAN — ChatGPT Web ↔ MCP ↔ Project-OS ↔ Antigravity

## 1. Architecture (module isolé, réutilisant l'existant)

```
src/integrations/bridge/
  McpBridge.ts            → orchestration start/stop/health/tool-discovery/lifecycle
  McpServerAdapter.ts     → wrapper @modelcontextprotocol/sdk v1.30 (Server + StreamableHttp)
  BridgeToolRegistry.ts   → déclaration + schémas + dispatch des outils MCP
  WorkspaceBoundary.ts    → Windows path sécurité (réutilise guardPath + PROTECTED_DIRS)
  ApprovalService.ts      → matrice permissions FAIL-CLOSED (+ réutilise isSecretFile)
  AntigravityCliAdapter.ts→ interface + impl agy (détection/version/smoke; fake-testable)
  ProcessRunner.ts        → spawn centralisé (args séparés, timeout, kill propre, output limit)
  AuditLogger.ts          → logs JSON structurés + redaction
  config.ts               → config env/lecture, defaults, validation
  index.ts                → exports publics
src/integrations/bridge/__tests__/  (ou src/tests/bridge.*.test.ts)
```

- Réutilise `workspaceGuard.ts` (`guardPath`, `PROTECTED_DIRS`, `isSecretFile` via `AutonomyWriteScope`), **en fonction** — zéro duplication.
- ✅ Ne modifie **aucun** fichier de `/goal` ni le tokenizer slash.

## 2. Scope / limites

- **Mode A (local)** : serveur MCP sur `127.0.0.1:<port>` (jamais `0.0.0.0` par défaut), StreamableHttpSDK v1.30.
- **Mode B (tunnel)** : abstraction `TunnelTransport` + doc Secure MCP Tunnel ; aucune impl OpenAI propriétaire ; `SECURE_TUNNEL_API=NOT_VERIFIED` tant que tool `tunnel-client` absent.
- **Écritures Project-OS** : uniquement via les guards existants + approbation ; pas de voie parallèle.
- **Antigravity V1** : `AntigravityCliAdapter` (agy headless `-p`, `--output-format json`, `--print-timeout`, `--sandbox`, jamais `--dangerously-skip-permissions`). Testé via fake executable.

## 3. Transport MCP

- v1.30 installé = autorité. `StreamableHTTPServerTransport` sur `127.0.0.1`. `initialize`, `tools/list`, `tools/call`, `ping`, notifications (annulation `notifications/cancelled`).
- Client de test : SDK v1.30 `Client` + `StreamableHTTPClientTransport`.

## 4. Outils MCP (v1)

| id | scope | permission |
|---|---|---|
| `bridge_health` | read | auto (apprové) |
| `project_status` | read | auto |
| `project_tree` | read borné | auto |
| `file_read` | read borné + secret-guard | auto |
| `code_search` | read | auto |
| `git_status` / `git_diff` | read-only (+ redaction) | auto |
| `tests_run` | exécution de scripts **connus** du projet | approval |
| `build_run` | exécution de scripts **connus** | approval |
| `antigravity_run` | mission headless (prompt=data, args séparés) | approval (write ⇒ contrôlé) |

## 5. Sécurité

- WorkspaceBoundary : chemins Windows (drives, UNC `\\?\`, `\\.\`, octets nuls, `..`, encodage `%2e%2e`, trailing dots, symlinks/junctions avec `realpath`) ; résolu réellement contenu dans root réel.
- SecretGuard : `.env*`, `id_rsa`, `*.pem`, caches Antigravity/auth, etc.
- ApprovalService : APPROVAL_REQUIRED pour écriture/test/build/antigravity-write ; DISABLED par défaut pour delete récursif/push/deploy/credentials/ssh/registry.
- ProcessRunner : `spawn(args[])`, cwd, env allowlist, timeout (défaut réglable), kill propre, limite stdout/stderr, redaction.
- Conçurences : maxConcurrentReads (4), maxConcurrentRuns (1 par workspace), queueLimit (64), maxRuntimeMs (30 min).
- Journalisation : corrélationId + toolName + status + bytes ; pas de clés/secrets/contenus complets.

## 6. Commandes `/bridge`

- `/bridge status` `doctor` `start` `stop` `tools` `test` — handler slash **nouveau** (additif), zéro impact sur les handlers existants.

## 7. Tests (minimum 60 assertions pertinentes)

- `/goal` characterization (4) ; config (6) ; path guards Windows (10) ; secret guards (5) ; schéma validation outils (6) ; ProcessRunner (7) ; Antigravity adapter fake (6) ; MCP tools dispatch (6) ; ApprovalService (5) ; security/concurrency (8) ; E2E local MCP client (10) ; lifecycle (5). Total ≥ 68.

## 8. Rollback / désactivation

- `bridge.enabled=false` ⇒ module chargé mais inactif : Project-OS inchangé. Docs `ROLLBACK.md`.

## 9. Gates

- GATE A baseline (293 PASS) ; B docs (fait) ; C module isolé sans bypass guards ; D unit green ; E E2E local client réel ; F Antigravity = `BLOCKED_ENV` (agy absent) ⇒ pas de faux PASS ; G regression 293+ ; H sécurité ; I `CHATGPT_BRIDGE_LOCAL_READY` PASS local / `CHATGPT_WEB_LIVE_E2E` NOT_TESTED.

## Critères PASS/WARN/BLOCK

PASS : toutes les gates locales (sauf F déclaré BLOCKED_ENV et I live NOT_TESTED, conformes à la politique).
WARN : aucune.
BLOCK : régression `/goal`, baseline rouge non diagnostiquée, secret fui, write hors workspace, API inventée.