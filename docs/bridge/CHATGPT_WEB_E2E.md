# CHATGPT WEB LIVE E2E — état réel

## Règle d'évidence
> Tant que ChatGPT Web lui-même n'a pas réellement appelé le serveur :
> `CHATGPT_WEB_LIVE_E2E = NOT_TESTED` — jamais PASS.

## Statut (2026-09-01)

| Item | Statut | Preuve |
|---|---|---|
| `LOCAL_MCP_E2E` | **PASS** | `evidence/MCP_E2E.json` — client SDK @modelcontextprotocol/sdk 1.30.0 ↔ serveur SDK, 10 tools, `bridge_health` + `file_read` ok |
| `CHATGPT_APP_READY` | **PASS_LOCAL** | serveur loopback exposé, tools listables, capabilities v1 |
| `SECURE_TUNNEL_API` | **NOT_VERIFIED** | CLI `tunnel-client` introuvable sur cet environnement ; abstraction prévue ; aucun client/jeton OpenAI configuré |
| `CHATGPT_WEB_LIVE_E2E` | **NOT_TESTED** | aucun appel réel provenant de ChatGPT Web |

## Scénario documenté (à exécuter quand l'environnement le permet)
1. Démarrer le bridge local (loopback 127.0.0.1:8412).
2. Installer/configurer `tunnel-client` (Secure MCP Tunnel) pour exposer le serveur privé.
3. Créer l'app custom MCP dans ChatGPT (developer mode) pointant vers le tunnel.
4. Lister les tools, appeler `bridge_health`, `project_status`, lire un fixture, lancer `tests_run` (script connu), `antigravity_run` read-only.
5. Tester une opération write avec confirmation utilisateur ; vérifier le diff ; rollback du fixture.
6. Re-consigner `CHATGPT_WEB_LIVE_E2E` **uniquement si** l'appel provient réellement du web ChatGPT.

## Bloqueurs d'environnement (hors code)
- Compte OpenAI + permissions "Tunnels" (org-level) + client `tunnel-client`.
- Installation du CLI `agy` Antigravity (pour la lane agent réelle).