# CHATGPT TOOL DISCOVERY (Wave 2)

Date: 2026-09-01
Endpoint: `http://127.0.0.1:8412/mcp`
Discovered Tools via Standard MCP `tools/list`:

| Tool Name | Class | Description | Input Schema Required |
|---|---|---|---|
| `bridge_health` | health | Bridge + Project-OS health (no secrets) | `[]` |
| `project_status` | read | Project root, branch, dirty state | `[]` |
| `project_tree` | read | Bounded workspace tree | `[]` |
| `file_read` | read | Read one file (bounded, secret-guarded) | `["path"]` |
| `code_search` | read | Regex search inside workspace (bounded) | `["query"]` |
| `git_status` | read | Read-only git status | `[]` |
| `git_diff` | read | Read-only git diff (redacted) | `[]` |
| `tests_run` | test-run | Run a known npm test script (approval) | `["script"]` |
| `build_run` | build-run | Run a known npm build script (approval) | `["script"]` |
| `antigravity_run` | antigravity-run | Run an Antigravity headless mission on workspace | `["prompt"]` |

## Total Tools: 10
All tools have complete JSON-schemas and are discovered cleanly via standard MCP clients.
`CHATGPT_APP_READY = PASS_LOCAL`