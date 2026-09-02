# CLI_V3_IMPLEMENTATION_PLAN (Phase 01 — architecture target + baseline + plan)

## A. BASELINE RÉELLE MESURÉE (autorité)
| Mesure | Valeur |
|---|---|
| C++ build | **PASS** (cmake build exit 0 : project-os-cli + pos_json_test) |
| CTest | **PASS** 1/1 (pos_json_test) |
| repo typecheck | **PASS** (tsc -p ./ --noEmit 0 erreur) |
| startup median | **14.6 ms** (menu + quit, 10 runs) |
| bridge latency | **~930 ms** (node + dispatch réel) |
| exit code sur succès (`docs`) | **0** |
| exit code sur erreur (`version`/`bogus`) | **0** ← **BUG L1** |
| mode non-interactif | fonctionne (préfixe `/` ajouté) |
| parsing bridge v2 | `CmdResult` lit `result.*` (ok/status/message/next/warnings/actions/artifacts/raw) |
| Unicodearg | `docs "éàç 日本語"` → OK (via `_popen`) |
| sortie | préfixes `OK/FAIL` (pas encore `--format=json`) |
| argparse difficile | `docs "a & b | c ^ d"` → passait (risque shell) |

**L1 (exit 0 sur erreur) confirmé** : les 6 commandes et leurs flags retournent 0 en cas d'erreur — à corriger (F03).

## B. ARCHITECTURE CIBLE V3 (à préserver, ne pas dupliquer la logique métier)
```
CLI C++
  ├─ args / UX / terminal (parsing, help, couleur, sanitize, Unicode)
  ├─ ProcessRunner (CreateProcessW, argv[], timeout, Ctrl+C coopératif)
  ├─ BridgeProtocolClient (contrat v2 : protocol/requestId/ok/status/result/timingMs/errors)
  ├─ rendering (human / json / ndjson / tsv) — stdout=data, stderr=diagnostics
  └─ orchestration client (commandes, exit codes)
        v
Node bridge v2  →  SlashCommandRegistry  →  Project OS TS/domain
   (factory / registry / goal / todo / addon / autonomy / artifact / routing /
    budget / tokens / LocalAI / GPU / endurance / security)
```
- Le C++ reste un **client**. Toute la logique métier reste derrière le bridge.
- Zéro dépendance C++ tant qu'un prototype ne démontre pas un gain mesurable (CLI11/FTXUI).

## C. DÉCISIONS STRUCTURANTES (phase 01)
1. **ProcessRunner** : remplacer `_popen` par `CreateProcessW` (argv exact, pas de shell) — PRIORITÉ HAUTE.
2. **Quoting** : règle MSVCRT complète (backslash+quote) — fin de l'injection d'arguments.
3. **Unicode** : `wmain` + UTF-8 interne, sortie UTF-8.
4. **VT/couleur** : détection TTY/VT + `sanitizeTerminalText()` (anti-injection terminal).
5. **JSON** : validation de structure mini en C++ (F10) ; limites profondeur/taille.
6. **GPU** : lecture `nvidia-smi` en read-only (jamais de kill), passé au bridge pour la preuve.
7. **Exit codes** : taxonomie F03 ; jamais 0 sur erreur.
8. **Aucune dépendance** tant qu'aucun benchmark ne démontre un gain (CLI11 & FTXUI : prototypes séparés).

## D. PLAN PHASES 02-30 (extrait)
- **P2**: F01 version + F02 capabilities.
- **P3**: F03 exit codes (fix L1) + F04 multi-format.
- **P4**: F05 terminal detection + F06 unicode.
- **P5**: F07 process runner (CreateProcessW) + F08 timeout.
- **P6**: F09 ctrl+c + F10 protocol schema.
- **P7-P11**: status/project query/use/inspect/watch/drift/timeline/snapshot/diff/explain.
- **P12-P15**: goal proof/todo board/artifact list/show/search/verify/addon verify/config.
- **P16-P17**: doctor/diagnostics bundle/preflight/health.
- **P18-P19**: models/model show/route explain/model smoke.
- **P20-P21**: model benchmark/gpu status/gpu watch/gpu proof.
- **P22-P23**: test runner/test matrix/benchmark compare/endurance status.
- **P24-P25**: endurance run/report/release gate/sarif export.
- **P26**: shell completion + cockpit (FTXUI ou VT renderer, après dependency gate).
- **P27**: packaging CMake presets + install.
- **P28**: fuzz + security + stress.
- **P29**: soak + real-world validation (50 scénarios).
- **P30**: final audit + release gate.

## E. GATE
**CLI_V3_BASELINE_LOCKED = PASS** (baseline mesurée, architecture verrouillée, threat model + feature matrix + research cards produits, aucune feature implémentée).
