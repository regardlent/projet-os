# CLI_V3 RESEARCH CARDS (Phase 01)

> Cartes de recherche ciblées. Sources officielles priorisées (docs officielles > source > release
> notes > issue tracker). Chaque carte : QUESTION / CURRENT / OFFICIAL_SOURCES / CANDIDATES /
> BENEFITS / RISKS / C++17 / WINDOWS / LICENSE / DEPENDENCIES / IMPACT / DECISION.
> Phase 01 = recherche + évaluation. Aucune dépendance installée.

## R01 — WIN32_PROCESS (CreateProcessW)
- **QUESTION** : Comment remplacer `_popen` par un runner explicite sous Windows ?
- **CURRENT** : `pos_runner.runNodeCommand()` → `_popen(cmd, "r")` ; `dispatch()` construit la chaîne `node <bridge> <slash>` avec `shellQuote` minimal.
- **SOURCES** : learn.microsoft.com CreateProcessW (processthreadsapi.h), CreateProcessA, Creating Processes, CommandLineToArgvW, GetCommandLineW.
- **CANDIDATES** : `CreateProcessW` avec `lpCommandLine` construit à la règle MSVCRT ; alternative `_wspawnv` (spawn avec argv[]).
- **BENEFITS** : pas de shell intermédiaire, `argv[]` exact, contrôle cwd/env/stdin/stdout/stderr, exit code réel, Unicode UTF-16.
- **RISKS** : construction `lpCommandLine` doit respecter les règles MSVCRT exactes (backslash+quote) ; gestion des pipes à l'ancienne (CreatePipe + thread).
- **C++17** : oui. **WINDOWS** : oui (Win32). **LICENSE/deps** : aucune (API système).
- **IMPACT** : HIGH (L7, T1). **DECISION** : ADOPTER — `ProcessRunner` sur `CreateProcessW` (P5).

## R02 — WINDOWS_ARGUMENT_QUOTING
- **QUESTION** : Quelle règle exacte pour encoder un argument complexe dans `lpCommandLine` ?
- **CURRENT** : `shellQuote` minimal (échappe `"` seulement).
- **SOURCES** : learn.microsoft.com "Parsing C command-line arguments" (rule 2: backslashes before a quote are doubled; 2n+1 backslashes + quote), "main function and command-line args".
- **CANDIDATES** : implémenter la règle MSVCRT de bout en bout.
- **BENEFITS** : fin de l'injection (T1), arguments exacts. **RISKS** : règle subtile — à tester (fuzzing).
- **DECISION** : ADOPTER — `quoteArg()` conforme MSVCRT, testé par fuzzing (P3/P28).

## R03 — WINDOWS_UNICODE_CONSOLE
- **QUESTION** : Comment gérer l'Unicode end-to-end (argv UTF-16, sortie UTF-8) ?
- **CURRENT** : `main(int argc, char** argv)` (ANSI) ; sortie via `std::cout` (code page).
- **SOURCES** : learn.microsoft.com "Unicode in the Windows API", `wmain`/`wargv`, SetConsoleOutputCP(CP_UTF8), SetConsoleCP.
- **CANDIDATES** : `wmain` + conversion UTF-16→UTF-8 interne ; sortie UTF-8 ; tests accents/cyrillique/japonais/emoji (P4/P19).
- **DECISION** : ADOPTER — `wmain` + UTF-8 interne, sortie UTF-8 (F06).

## R04 — VIRTUAL_TERMINAL
- **QUESTION** : Comment détecter et activer le support VT (couleur/mouvement) ?
- **CURRENT** : pas de couleur.
- **SOURCES** : learn.microsoft.com Console Virtual Terminal Sequences, GetConsoleMode, Classic vs VT, ConPTY.
- **CANDIDATES** : `GetConsoleMode` + `SetConsoleMode(ENABLE_VIRTUAL_TERMINAL_PROCESSING)` ; détection TTY/redirection/VT.
- **DECISION** : ADOPTER — `TerminalCapability` (F05) : détection TTY/VT/largeur + `sanitizeTerminalText()` (T2).

## R05 — CLI11_EVALUATION
- **QUESTION** : CLI11 apporte-t-il un gain mesurable vs le parsing actuel ?
- **CURRENT** : parsing manuel `argc/argv` dans `main`.
- **CANDIDATES** : CLI11 (header-only, MIT). **BENEFITS** : subcommands/validators/help/aliases. **RISKS** : taille binaire, compile time, migration des 50 features.
- **DECISION** : ATTENDRE — prototype isolé avant migration ; ne pas réécrire en une fois (§17). Évaluer en P26.

## R06 — FTXUI_EVALUATION
- **QUESTION** : FTXUI pour le cockpit F50 ?
- **CURRENT** : aucun TUI.
- **CANDIDATES** : FTXUI (MIT, C++17, header/libs). **BENEFITS** : menus/tableaux/scroll/keyboard/live refresh. **RISKS** : taille, startup, rendu Windows/Terminal, régression du core.
- **DECISION** : ATTENDRE — prototype séparé + dependency gate (§18). Le CLI texte doit rester fonctionnel sans TUI.

## R07 — CMAKE_CTEST
- **QUESTION** : CMakePresets + labels CTest ?
- **CURRENT** : CMakeLists minimal (C++17, 2 targets, 1 test).
- **SOURCES** : cmake.org CMakePresets, ctest labels (LABELS, --label), ctest resource spec (RESOURCE_GROUPS).
- **DECISION** : ADOPTER en P27 (presets cli-debug/release/test/live/gpu + labels unit/protocol/integration/windows/unicode/live/localai/gpu/slow).

## R08 — JSON_SCHEMA_PROTOCOL
- **QUESTION** : valider formellement le contrat bridge v2 ?
- **CURRENT** : parsing manuel de l'enveloppe v2 dans `CmdResult`.
- **CANDIDATES** : JSON Schema 2020-12 (validation côté CLI, générateur). **BENEFITS** : contrat prouvé (PROTOCOL_ERROR). **RISKS** : dépendance.
- **DECISION** : ADOPTER une validation de structure minimale en C++ (F10) ; JSON Schema formel en option (le JSON est petit).
## R09 — POWERSHELL_COMPLETION
- **QUESTION** : completion dynamique PowerShell ?
- **CURRENT** : aucune.
- **SOURCES** : learn.microsoft.com PowerShell completion (Register-ArgumentCompleter), getCompletions.
- **DECISION** : ADOPTER en P26 (F49) — `project-os-cli completion powershell` ; slugs de projets / model ids / artifact ids / commandes connues ; aucune mutation.

## R10 — SARIF_EXPORT
- **QUESTION** : export diagnostics au format SARIF 2.1 ?
- **SOURCES** : OASIS SARIF 2.1.0 (schemastore, Microsoft). **CANDIDATES** : générateur minimal.
- **DECISION** : ADOPTER en P25 (F48) — findings doctor/security/protocol/artifact/test failures ; pas de pseudo-findings.

## R11 — LOCALAI_CLI_INTEGRATION
- **QUESTION** : intégrer LocalAI (loopback) en live ?
- **CURRENT** : le CLI délègue au bridge ; LocalAI = endpoint 127.0.0.1:8080/v1.
- **SOURCES** : localai.io API docs (OpenAI-compatible /v1/models, /chat/completions).
- **DECISION** : le CLI reste client du bridge ; les modèles/smoke passent par le backend TS (F33/36). Live = serveur réel, no mock.

## R12 — GPU_OBSERVABILITY
- **QUESTION** : exposer l'état GPU (nvidia-smi) ?
- **CURRENT** : pas dans le CLI ; preuve GPU côté TS.
- **CANDIDATES** : appeler `nvidia-smi` en lecture seule (no kill). **BENEFITS** : doctor/gpu status (F38/40).
- **DECISION** : ADOPTER en P20/21 — lecture `nvidia-smi --query-gpu=...` ; read-only ; masquer si GPU indisponible (BLOCKED, pas PASS).

## R13 — SIGNAL_CANCELLATION
- **QUESTION** : cancellation coopérative Ctrl+C ?
- **CURRENT** : aucune.
- **SOURCES** : C++ signal handling (SIGINT), ConPTY, toolchain MinGW.
- **DECISION** : ADOPTER en P6 (F09) — cooperative : flag + grace period + owned-child cleanup uniquement ; jamais tuer un process externe.

## R14 — DEPENDENCY_SECURITY
- **QUESTION** : politique de dépendances (CVE, vendor/pin) ?
- **CURRENT** : aucune dépendance C++ (header-only maison).
- **DECISION** : RESTER header-only quand possible ; toute dépendance vendored/pinned + SHA + licence + CVE audit (§8). Le JSON/parseur reste maison ou minimal.

## R15 — TERMINAL_ACCESSIBILITY
- **QUESTION** : ne pas dépendre de la couleur ; petit terminal ; monochrome.
- **CURRENT** : texte brut.
- **DECISION** : ADOPTER — sorties `PASS`/`FAIL`/`BLOCKED` en texte (pas seulement couleur) ; `--color=never`/NO_COLOR ; tous signaux textuels (P4/P35).

## SYNTHÈSE PHASE 01
**Zéro dépendance installée.** Décisions : ProcessRunner (R01), quoting MSVCRT (R02), Unicode (R03), VT (R04), JSON minimal (R08), nvidia-smi read-only (R12). CLI11/FTXUI = prototype avant décision (R05/R06). Baseline mesurée (build/ctest PASS, startup 14.6 ms, exit 0 sur erreur = bug L1).

