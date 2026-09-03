# PROJECT OS CLI V3 — REFERENCE & NEXT-PHASE PLANNING
Handoff document for ChatGPT web to plan the next 50 development phases of the C++ CLI.

## 1. Identity & Location
- **Repo**: `C:\Users\eiden\Desktop\dev\projet-os`
- **CLI source**: `cli-cpp/` (C++17, CMake, header-only helpers)
- **Binary**: `cli-cpp/cmake-build/project-os-cli.exe`
- **Build**: CMakePresets (Ninja): `debug`, `release`, `test`, `workflow ci`; installable (`cmake --install ... --prefix`)
- **Node bridge**: `bin/project-os-bridge.mjs` (protocol v2)
- **LocalAI**: `http://127.0.0.1:8080/v1` (loopback, models)
- **Toolchain**: MinGW `C:\msys64\mingw64\bin`, CMake 4.3.3, g++ 16.1.0
- **GPU**: NVIDIA GPU Laptop, 8 GB, driver 616.56

## 2. Architecture (hub-spoke)
- CLI (C++) parses/UX/terminal → runner (CreateProcessW, no shell) → Node bridge → SlashCommandRegistry → Project OS TS domain.
- The CLI **delegates** business logic to the bridge; it never re-implements Project OS.
- Layered: UI/extension → application/domain → services → providers/adapters (LocalAI/fs/bridge/GPU).

## 3. Baseline (real, measured)
- C++ build PASS · CTest **1/1 PASS** · typecheck **0 errors** · CLI soak **100/100** scenarios PASS.
- Feature matrix: **50/50 PASS**.
- Post-V3 : machine-output `--format=human|json|ndjson|tsv|csv|md|html|svg` (cf. `docs/OUTPUT_FORMATS.md`),
  `snapshot diff`, `snapshot list --age`, `git log --graph`, `tree`, `create --timer` (multi-étape),
  `--profile=dev|ci|minimal`, `--help` coloré, cockpit `[Addons]`/`[Perf]`.

## 4. The 50 features (all implemented + PASS)
F01 version · F02 capabilities · F03 exit codes · F04 multi-format (human/json/ndjson/tsv) ·
F05 terminal detection · F06 unicode · F07 process runner (CreateProcessW) · F08 timeout ·
F09 ctrl+c · F10 protocol schema · F11 status · F12 project query · F13 project use · F14 project inspect ·
F15 project watch · F16 drift · F17 timeline · F18 snapshot · F19 diff · F20 explain/dry-run ·
F21 goal proof · F22 todo board · F23 artifact list · F24 artifact show · F25 artifact search ·
F26 artifact verify · F27 addon verify · F28 config · F29 doctor · F30 diagnostics bundle ·
F31 preflight · F32 health · F33 models · F34 model show · F35 route · F36 model smoke ·
F37 model benchmark · F38 gpu status · F39 gpu watch · F40 gpu proof · F41 test list · F42 test matrix ·
F43 benchmark compare · F44 endurance status · F45 endurance run · F46 report · F47 release gate ·
F48 sarif export · F49 shell completion · F50 cockpit.

## 5. Command surface (CLI)
`help`, `version`, `capabilities`, `status`, `project list|use|inspect|watch`, `drift`, `timeline`,
`snapshot create|list|show`, `diff`, `goal proof`, `todo board`, `artifact list|show|search|verify`,
`addon verify`, `config`, `doctor`, `diagnostics`, `preflight`, `health [--watch]`, `models`,
`model show|smoke|benchmark`, `route <class>`, `gpu|watch|proof`, `test list|matrix`,
`benchmark compare <a> <b>`, `endurance status|run <rung>`, `report`, `release gate`, `export sarif`,
`completion powershell|bash|zsh`, `cockpit`,
`bridge status|start|stop|restart|health|tools|test|tunnel`.
Intelligence & analyse (IA01-IA10, phase 27+) : `health score`, `health trend`, `health compare <a> [b]`,
`budget forecast`, `insights tokens`, `diagnose`, `drift alert`, `goal traction`, `autonomy health`, `risk profile`.
Global flags: `--format=json|ndjson|tsv`, `--color=auto|always|never`, `--explain/--dry-run`.

## 6. Packages & entry points
- `cli-cpp/src/`: `pos_json.hpp` (JSON parser), `pos_model.hpp` (registry/goal/todo), `pos_runner.hpp`
  (dispatch + parseCmdResult pure), `pos_process.hpp` (ProcessRunner), `pos_terminal.hpp`,
  `pos_output.hpp`, `pos_exitcodes.hpp`, `pos_protocol.hpp`, `pos_health.hpp`, `project_os_cli.cpp` (main/menu).
- `cli-cpp/tests/test_pos.cpp` (unit + fuzz), `cli-cpp/CMakeLists.txt`, `cli-cpp/CMakePresets.json`.
- `bin/project-os-bridge.mjs` (protocol v2: protocol/requestId/ok/status/result/timingMs/errors).

## 6bis. Bridge MCP (ChatGPT Web) — Phase 23
- **Module CLI** : `src/commands/bridgeCommands.ts`, enregistré dans `bin/project-os-bridge.mjs` (dispatch `/bridge`).
- **Sous-commandes** : `status` (+`--format=json`), `start`, `stop`, `restart`, `health`, `tools`, `test`, `tunnel`.
- **Serveur MCP standalone** : `src/integrations/bridge/bridge-server.ts` → `dist/integrations/bridge/bridge-server.js` (loopback, PID lock, arrêt propre).
- **Runtime lifecycle** : `src/integrations/bridge/bridgeRuntime.ts` (start détaché + waitReady, stop taskkill/SIGTERM, restart, isRunning, health).
- **Orchestration tunnel** : `src/integrations/bridge/tunnelClient.ts` (profil `project-os`, sample `sample_mcp_remote_no_auth`, init/doctor/run).
- **Bridge local gratuit (no-auth)** : `scripts/bridge-local.mjs` (`npm run bridge:local`) — `/mcp` (tools/list → 10 outils) et `/healthz` répondent **sans aucun token**.
- **Retenu** : bridge **local gratuit**. Tunnel OpenAI optionnel (nécessite clé runtime org + tunnel-id — non disponibles ici).

## 7. Honest limitations
- `/backend/monitor` returns 500 (signature mismatch) — GPU proof uses VRAM delta + HTTP 200.
- Endurance rung 30/60 pending external GPU VRAM (~3 GB) — reported honestly, never fake PASS.
- Model backend/quant/license UNKNOWN when not declared by LocalAI.
- Cockpit = inline VT renderer (no FTXUI; minimal dependency).
- No cloud, no telemetry, no source upload — loopback only.

## 8. Evidence pack (artifacts/cli-v3)
- `release/CLI_V3_RELEASE_GATE.json` (productionReady: true), `release/CLI_V3_FEATURE_MATRIX.json`
- `CLI_V3_RELEASE_REPORT.md`, `CLI_V3_FEATURE_MATRIX.json` (50/50), `CLI_V3_IMPLEMENTATION_PLAN.md`,
  `CLI_V3_THREAT_MODEL.md`, `CLI_V3_PACKAGING.md`, `CLI_V3_SECURITY_REPORT.md`, `CLI_V3_SOAK_REPORT.md`,
  `research/CLI_V3_RESEARCH_CARDS.md`.

## 9. Candidate focus areas for the next 50 phases (to be refined by ChatGPT web)
- Fuzz/property harness (libFuzzer), SARIF deeper, TUI upgrade (FTXUI decision gate), completion for
  subcommands + dynamic slugs, protocol v3 negotiation, request correlation/trace, performance budget,
  memory safety (sanitizers), packaging (CPack/installer, DEB/ZIP), CI matrix (Windows/Linux/macOS),
  streaming/LocalAI parity, multi-model routing, endurance orchestration integration, diagnostics
  redaction golden tests, Unicode Windows console (UTF-8 mode), config precedence source view, status bar /
  VS Code command parity, snapshot diff richer, workspace drift baseline compare, artifact store integration,
  budget/token integration, observability (OpenTelemetry local), accessibility (monochrome+small terminal),
  machine-consumer contract (schema version), exit-code taxonomy extension, and 50 real-user scenarios.

## 10. Intelligence & analyse (IA01-IA10, phase 27+) — implemented
Bus d'analyse **déterministe** (`bin/project-os-bridge.mjs` → `gatherSignals()`), read-only, rendu
`human|json|ndjson|tsv`. Réutilise goal/todo/autonomy/addons/git/snapshots/tokens + artefacts control-plane.
Git/LocalAI/GPU dégradent en `n/a` sans erreur. Verified live contre `projet-gere` (health=62/C FAIR,
insights ratio 2.87, diagnose WARN, risk MEDIUM).

- **IA01 `health score`** — score composite 0-100 (goal 20+coté progress, todo 20, git 15, addons 10, contenu 5, snapshots 5) + grade A-E + signal GOOD/FAIR/AT_RISK.
- **IA02 `health trend`** — deux+ scores de snapshots → IMPROVING/DECLINING/FLAT/NOT_ENOUGH_DATA.
- **IA03 `health compare <a> [b]`** — santé côte-à-côte (A_BETTER/B_BETTER/EQUAL) ; exit 1 si b absent.
- **IA04 `budget forecast`** — coût/burn extrapolé (tokens × coût, budget quotidien `PROJECT_OS_DAILY_BUDGET`) ; EXACT_ZERO/SPEND.
- **IA05 `insights tokens`** — total/in/out + ratio + modèle ; HAS_USAGE/NO_USAGE.
- **IA06 `diagnose`** — batterie de checks classés (goal/todo/git/addons/snapshot/contenu) ; CLEAR/WARN/ALERT, exit 1 si issues.
- **IA07 `drift alert`** — divergence goal/todo/working-tree vs dernier snapshot baseline ; CLEAR/ALERT/NO_BASELINE, exit 1 si ALERT.
- **IA08 `goal traction`** — traction = progress×0.4 + todo×0.4 + critères ; STRONG/MODERATE/WEAK.
- **IA09 `autonomy health`** — état du plan (minutes/complexity/status/handoff/deadline) ; COMPLETED/ACTIVE/EXPIRED/MISSING.
- **IA10 `risk profile`** — risques consolidés classés (high/med/low) + mitigations ; score 0-100 + signal HIGH/MEDIUM/LOW.

Contrat de sortie : un échec n'est jamais mappé sur 0 (ex. `diagnose` → exit 1, `drift alert` ALERT → exit 1,
`health compare` b-absent → exit 1). Tests unitaires : `testParseInspectGoalProof` + parsing score/grade/signal/rows/details.
