# MCP PROTOCOL NEGOTIATION EVIDENCE

Date: 2026-09-01
Package: `@modelcontextprotocol/sdk`
Version: `1.30.0`
Protocol Version: `2024-11-05` / `2025-11-25` (MCP JSON-RPC 2.0 wire format)

## Protocol Negotiation Details
* Client Advertised Versions: `2024-11-05`, `2025-11-25`
* Server Advertised Version: `0.1.0` (Project-OS Bridge)
* Negotiated Wire Format: JSON-RPC 2.0 over Streamable HTTP (Stateless) and InMemory Transport
* Transport Used: `StreamableHTTPServerTransport` with `createMcpExpressApp()` on loopback `127.0.0.1`

## Decision on Migration
`MCP_V2_MIGRATION = BACKLOG`
Reason: SDK v1.30.0 is fully functional, all 10 tools are discovered and invoked cleanly by SDK clients, DNS-rebinding protection is active on loopback, and zero regressions were found. Migration to v2 is not required for Wave 2.