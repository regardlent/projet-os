# v1.0 — Project OS CLI

**Tag : `v1.0`** · Lignes : C++17 (CLI) + TypeScript (extension/bridge) · Licence : Apache-2.0

## Résumé
Roadmap CLI **10×10 complétée (100/100)** + **feuille de route 50×50 (2500 étapes)** initiée.
Le CLI C++ pilote Project OS en **déléguant** toute la logique au bridge (protocole v2, `CreateProcessW`, no shell).

## Fonctionnalités (extrait)
- **UX** : aide catégorisée, cartes `──…──`, barre de score, grade coloré, `--theme`, `--mono`, `--no-emoji`,
  `--quiet|--verbose`, `--format=json|ndjson|tsv`, `--json/--ndjson/--tsv`, `--silent/--check`, `--time`, `--width`, `--trace`.
- **Intelligence & analyse** : `health score|trend|compare`, `budget forecast`, `insights tokens`, `diagnose`,
  `drift alert|compare`, `goal traction|cost`, `autonomy health`, `risk profile`.
- **Modèles** : routeur adaptatif (`--alt`), `model qualify|compare|flash|policy|quota|profiles|offload|cache`.
- **Git** : `git status|log|commit|diff|branch|worktree|stash|ignore|checkpoint|hook|drift|pr`.
- **Artefacts & MCP** : `artifact publish|versions|review|provenance|share|verify`, MCP tools artifact_*, `/bridge config|audit`.
- **Cockpit** : dashboard live (`--watch`), `history`, `export`, tuile `[Perf]` (fmtDuration).

## Robustesse & qualité
- Régressions : typecheck **0 erreur** · `ctest` **100% pass** · `pos_json_test` **ALL PASS** ·
  node **368/369** (1 échec = test antigravity environnemental) · soak **100/100**.
- Durcissement : `redactSecret`, `--trace` stderr, `/bridge audit`, sanitizers ASan/UBSan (`-DPOS_SANITIZE=ON`),
  fuzz/property, `set_terminate` (exit 70), `budgetVerdict`/`fmtDuration`/`fmtBytes`/`sparkline`.

## Install (Windows)
```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
project-os-cli welcome
```
Ou build manuel : `cmake -S cli-cpp -B cli-cpp/cmake-build && cmake --build cli-cpp/cmake-build`.

## Liens
- Docs : `docs/PROJECT_OS_CLI_V3_REFERENCE.md`, `docs/CLI_ROADMAP_50X50.md`, `docs/GITHUB_POPULARITY.md`.
- `release` → `release version|bump <v>|changelog`.
