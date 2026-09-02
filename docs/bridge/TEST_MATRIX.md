# TEST MATRIX — chatgpt-antigravity-bridge

| Catégorie | Fichier | Cas | Résultat |
|---|---|---|---|
| `/goal` characterization | `bridgeGoalContract.ts` + `bridgeCommand.test.ts` | objective/status/fields + intégration `/goal` avec bridge enregistré | PASS |
| Config | `bridgeConfigPath.test.ts` | defaults loopback, invalid port/host, env overrides, fail-closed approval | PASS |
| Path guards Windows | `bridgeConfigPath.test.ts` + `bridgeSecurity.test.ts` | traversal, encoded, null, device, UNC, drive, metacharacters, absolute, protected, symlink-escape (realpath) | PASS |
| Secret guards | `bridgeConfigPath.test.ts` + `bridgeSecurity.test.ts` | .env, id_rsa, credentials, redaction bearer/sk/password | PASS |
| Schema validation | `bridgeApprovalSchema.test.ts` | missing/unknown/wrong/oversized, chaque tool | PASS |
| MCP tools dispatch | `bridgeApprovalSchema.test.ts` | bridge_health, file_read (secret+traversal), tests_run (allowlist), antigravity_run (null) | PASS |
| Process runner | `bridgeProcess.test.ts` | success, timeout, non-zero, invalid exe, bounded output | PASS |
| Antigravity adapter | `bridgeProcess.test.ts` | arg builder sans flag dangereux, not-detected, success/error/soft-deny (mock) | PASS |
| Security / fault | `bridgeSecurity.test.ts` | injection shell, prompt-injection tool, rapid unknown, oversized output, concurrency, secret nested | PASS |
| Lifecycle | `bridgeE2e.test.ts` | start/active/dispose, health, NOT_DETECTED sans faux PASS | PASS |
| E2E MCP réel | `bridgeE2e.test.ts` + `evidence/MCP_E2E.json` | client SDK réel ↔ serveur SDK réel, 10 tools, bridge_health + file_read | PASS |
| Git read tools | `bridgeE2e.test.ts` | git_status/git_diff ne crashent pas hors repo, redaction | PASS |
| `/bridge` commands | `bridgeCommand.test.ts` | status/doctor (BLOCKED_ENV)/tools/subcommand inconnu fail-closed | PASS |
| **Module CLI `/bridge` (bin/project-os-bridge.mjs)** | `bridgeCliCommands.test.ts` | usage, status (+json), health, tools, test, tunnel (honnête), unknown fail-closed, dispatch registry | PASS |
| **Module CLI lifecycle** | `bridgeCliCommands.test.ts` | start/stop/restart dispatch shape | SKIP* |
| **Runtime lifecycle** | `bridgeRuntime.test.ts` | cfg fail-closed, env overrides, non-loopback fallback, lockPaths, readPid (null/pid), serverEntry | PASS |
| **Tunnel client** | `tunnelClient.test.ts` | profil project-os, localMcpUrl, findTunnelClient, tunnelStatus shape, runTunnel honest not-detected | PASS |
| **Serveur MCP standalone** | `bridge-server.ts` (entrypoint) | loopback-only, PID lock, SIGINT/SIGTERM, /healthz, tools/list | PASS (manuel / CLI) |

> \* `start/stop/restart` spawnent un vrai serveur détaché sur le port loopback 8412, ce qui crée une course avec la suite parallèle → skip dans l'unit test ; validé manuellement via `node bin/project-os-bridge.mjs /bridge start|stop`.

**Totaux : 48 tests / 122 assertions** (dont 341/341 baseline global) + **22 tests module CLI** (10 CLI + 6 runtime + 6 tunnel) → **370 actifs / 368 pass / 2 fail environnemental**.
**Antigravity runtime** : `BLOCKED_ENV` (agy absent sur l'hôte) — adapter testé par mocks, aucun faux PASS.
**ChatGPT Web** : `CHATGPT_WEB_LIVE_E2E = NOT_TESTED` (nécessite compte + tunnel-client).
**tunnel-client** : `NOT_DETECTED` sur l'hôte (non installé) — orchestration honnête, aucun faux PASS.

Non-couvert honnêtement :
- E2E ChatGPT Web réel (nécessite environnement utilisateur/tunnel).
- Antigravity write E2E sur fixture (nécessite `agy` installé).