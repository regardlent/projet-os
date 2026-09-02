# CHATGPT WEB LIVE E2E (Wave 2 Classification)

Date: 2026-09-01

## Live E2E Matrix & Evidence-First Rule

| Item | Status | Verified / Proven Evidence |
|---|---|---|
| `LOCAL_MCP_E2E` | **PASS** | `bridgeE2e.test.ts` + `bridgeHttp.test.ts` (10 tools discovered, invoked over InMemory and real Streamable HTTP loopback) |
| `ANTIGRAVITY_RUNTIME` | **PASS** | Official `agy` 1.1.23 installed, native auth verified, read-only smoke PASS (`"Four\n"`), live fixture write smoke PASS |
| `MCP_TO_ANTIGRAVITY_REAL_E2E` | **PASS** | Real MCP bridge tool `antigravity_run` invoking real `agy.exe` and returning formatted Gemini agent result |
| `CHATGPT_APP_READY` | **PASS_LOCAL** | Standard JSON-RPC 2.0 tools schema, loopback HTTP with DNS-rebinding, 10 tools discovered |
| `SECURE_TUNNEL_API` | **VERIFIED_DOCUMENTED** | Official OpenAI Platform tunnel workflow documented; requires operator token to run tunnel-client binary |
| `CHATGPT_WEB_LIVE_E2E` | **NOT_TESTED** | Per absolute rule: cannot be marked PASS until an actual request from chatgpt.com reaches the server |

## Next User Action for Full Web E2E
Run `tunnel-client run --profile project-os` and connect custom MCP app in ChatGPT Developer Mode.