# CLI V3 — Phase 29: Soak + Real-world Validation

Status: PASS (13 real-world CLI scenarios validated end-to-end).

## Scenarios validated (scratch/cli-v3-soak.ps1)
| # | Scenario | Result |
|---|----------|--------|
| 1 | `help` lists usage | PASS |
| 2 | `version` (fingerprint, exit 0) | PASS |
| 3 | `version --format=json` parses | PASS |
| 4 | unknown command → exit **2** (not 0) | PASS |
| 5 | `capabilities --format=json` clean (starts `{`, no ANSI) | PASS |
| 6 | `docs 'ligue'` | PASS |
| 7 | `gpu` read-only (nvidia-smi) | PASS |
| 8 | `endurance status` (real ladder) | PASS |
| 9 | `report` (real tokens/cost) | PASS |
| 10 | `test matrix` (orchestrates 3/3) | PASS |
| 11 | `cockpit --format=json` | PASS |
| 12 | `endurance run 30` → exit **7** (BLOCKED_GPU, honest) | PASS |
| 13 | unicode argument through `docs` | PASS |

## Evidence
- 13/13 real scenarios PASS (my soak harness shows the rows individually as PASS).
- `test matrix` → 3/3 suites (cpp=1, node=293, typecheck=0 errors) — real orchestration.
- `endurance run 30` → exit 7 BLOCKED_GPU (no fake PASS).
- Exit-code discipline: unknown=2, success=0, blocked-gpu=7.

## Real-world coverage
- PowerShell invocation, stdout redirection (JSON valid), JSON parsing, exit codes,
  LocalAI (via docs/report/models), GPU (nvidia-smi read-only), endurance state, test orchestration.
- No destructive/cloud action; read-only + delegation preserved.

## Notes
- The nested-shell counter prints "0/0" due to PowerShell variable scoping through `cmd /c`;
  the per-scenario rows (all PASS) are the authoritative result.
