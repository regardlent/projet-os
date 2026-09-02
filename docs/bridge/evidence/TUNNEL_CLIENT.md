# TUNNEL CLIENT & SECURE MCP TUNNEL EVIDENCE

Date: 2026-09-01
Status: `SECURE_TUNNEL_API = VERIFIED_DOCUMENTED` / `CONTROL_PLANE_API_KEY_PRESENT = NO`

## Investigation & Preflight
* Search command `where.exe tunnel-client` returned not found on host.
* Per OpenAI Documentation (`developers.openai.com/api/docs/guides/secure-mcp-tunnels`), the `tunnel-client` binary is provided via OpenAI Platform Organization Tunnel Settings for organizations with `Tunnels Read / Use / Manage` RBAC roles.
* Zero third-party or untrusted binaries were downloaded or executed, adhering to the strict security boundary.

## Instructions for Operator
1. Obtain `tunnel-client.exe` from OpenAI Platform -> Organization -> Tunnel Settings.
2. Initialize tunnel profile:
   ```powershell
   tunnel-client init --profile project-os --url http://127.0.0.1:8412/mcp
   ```
3. Run doctor:
   ```powershell
   tunnel-client doctor --profile project-os --explain
   ```
4. Run tunnel connection:
   ```powershell
   tunnel-client run --profile project-os
   ```

## Status Classification
`OPENAI_TUNNEL_ACCESS = USER_ACTION_REQUIRED` (Requires external OpenAI Enterprise / Platform Organization token).