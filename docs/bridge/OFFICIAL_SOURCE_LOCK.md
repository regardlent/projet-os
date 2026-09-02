# OFFICIAL SOURCE LOCK — ChatGPT Web ↔ MCP ↔ Project-OS ↔ Antigravity

| Domaine | Page | Source officielle | Date vérifiée | Claim utilisé | Version/API | Vérifié localement |
|---|---|---|---|---|---|---|
| MCP spec | `/specification/2026-07-28` | modelcontextprotocol.io | 2026-09-01 | JSON-RPC 2.0, tools, consent utilisateur obligatoire avant invocation, capabilities négociées | spec 2026-07-28 | ✅ (lecture doc) |
| MCP TS SDK (v2) | `ts.sdk.modelcontextprotocol.io/v2` | Model Context Protocol | 2026-09-01 | SDK v2 stable (`@modelcontextprotocol/server`, `McpServer.registerTool` + `serveStdio`), line stable 2026-07-28 | v2 stable | ❌ (non installé) |
| MCP TS SDK (v1, installé) | `node_modules/@modelcontextprotocol/sdk` | npm package | 2026-09-01 | `Server` (Protocol), `mcp.js` (McpServer), `streamableHttp.js` (NodeStreamableHTTPServerTransport), `Client` | **1.30.0** | ✅ (installé, import testé) |
| OpenAI ChatGPT MCP apps | `help.openai.com/…/developer-mode-and-mcp-apps-in-chatgpt` | OpenAI | 2026-09-01 | custom MCP app = `application.yml` + `mcpServers`; write/modify = action déclarative ; confirmation utilisateur du host | ChatGPT Apps | ⚠️ (403, re-fetch ci-dessous) |
| OpenAI Secure MCP Tunnel | `developers.openai.com/api/docs/guides/secure-mcp-tunnels` | OpenAI API docs | 2026-09-01 | `tunnel-client` CLI (« tunnel-client run … is still running », `tunnel-client doctor --profile … --explain`, `/healthz /readyz /metrics`, `/ui` loopback par défaut) | Secure MCP Tunnel | ⚠️ CLI non installé localement → `SECURE_TUNNEL_API = NOT_VERIFIED` à exécuter via l'abstraction |
| Antigravity CLI | `antigravity.google/docs/cli/headless` | Google Antigravity Docs | 2026-09-01 | `agy -p "<prompt>"` (--print/--prompt), `--output-format text|json|stream-json`, `--json-schema`, `--print-timeout 5m`, `--sandbox`, `--continue/--conversation`, status `SUCCESS/ERROR/CANCELED/INTERRUPTED/INVALID/WAITING/RUNNING`, exit 1 sur erreur | CLI **v1.1.22** | ❌ `agy` absent (PATH) → `ANTIGRAVITY_RUNTIME = BLOCKED_ENV` (saignement honnête) |
| Cline SDK | `docs.cline.bot/sdk/clinecore` | Anthropic/Cline docs | 2026-09-01 | `ClineCore.create`, `start(config{toolPolicies})`, `requestToolApproval`, `Agent` direct, hub-spoke backends | @cline/sdk | ✅ **0.0.81 installé** (localement vérifié dans node_modules) |

## Décisions verrouillées

1. **MCP transport** : SDK **v1.30.0 déjà installé** (pas de migration v2 automatique). La spec demandée est la révision 2026-07-28 ; le SDK v2 est stable mais **non installé** ; migrer sans nécessité violerait la règle. On expose un serveur v1 conforme (initialize/tools/list/tools/call) et on note la migration v2 dans le plan.
2. **Secure MCP Tunnel** : documenté + abstraction `TunnelTransport` prévue, mais aucun `tunnel-client` local ⇒ `SECURE_TUNNEL_API = NOT_VERIFIED`, `CHATGPT_WEB_LIVE_E2E = NOT_TESTED`.
3. **Antigravity** : adapter `AntigravityCliAdapter` construit pour `agy` officiel, mais le diagnostic local est `BLOCKED_ENV` (agrafe : tester avec un fake executable en test, jamais favoriser un PASS).
4. **Types installés** : `@cline/sdk@0.0.81` gagne sur toute doc correspondant à une autre version.

## Re-fetch OpenAI ChatGPT app (contournement 403)
Vérifié à nouveau via recherche web — même conclusion : les apps ChatGPT custom requièrent un compte et l'onglet page de démarrage (dev mode requis). Aucune modification du claim.