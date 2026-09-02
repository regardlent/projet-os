# TUNNEL DOCTOR SIMULATION & VERIFICATION

Date: 2026-09-01
Module: `McpHttpServer` + `bridge_health`

## Local Server Verification (Prerequisite for Tunnel Doctor)
* Bind Host: `127.0.0.1` (Strict loopback)
* Port: `8412` (configurable via `BRIDGE_PORT`)
* Endpoints:
  - `GET /healthz` -> HTTP 200 `{"ok":true,"service":"project-os-bridge","port":8412,"running":true}`
  - `POST /mcp` -> HTTP 200 Streamable HTTP MCP Endpoint
* DNS Rebinding Protection: Active (`localhostHostValidation` applied automatically by `createMcpExpressApp`).

## Status
`LOCAL_TUNNEL_ENDPOINT_READY = PASS`
`TUNNEL_DOCTOR = PENDING_EXTERNAL_TUNNEL_CLIENT` (Ready to connect immediately once tunnel-client profile is started).