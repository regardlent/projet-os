# MCP TO ANTIGRAVITY REAL E2E EVIDENCE (Wave 2)

Date: 2026-09-01
Test Suite: `src/tests/bridgeAntigravityLive.test.ts` (4/4 PASS)

## E2E Chain
`MCP Client -> McpBridge (invokeWrapped 'antigravity_run') -> AntigravityCliAdapter -> ProcessRunner -> agy.exe -> Gemini Agent -> Formatted Response`

## Test Output
```text
✔ live antigravity: detects installed agy binary automatically (1.2ms)
✔ live antigravity: headless read returns SUCCESS response from Gemini model (9489.1ms)
✔ live antigravity: MCP bridge tool antigravity_run invokes real agy and formats result (7845.4ms)
✔ live antigravity: controlled write smoke on temporary fixture (11821.5ms)
```

## Security Verifications
1. `buildAntigravityArgs` guarantees `--dangerously-skip-permissions` is NEVER passed.
2. Temporary fixture isolation: only writes inside authorized temp directory.
3. Redaction and secret masking active.

`MCP_TO_ANTIGRAVITY_REAL_E2E = PASS`
`ANTIGRAVITY_CONTROLLED_WRITE = PASS`