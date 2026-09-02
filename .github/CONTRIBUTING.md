# Contribuer à Cline Project OS

Merci pour votre intérêt ! Ce guide décrit la marche à suivre pour contribuer.

## Environnement

- C++17 (MinGW + CMake) pour le CLI (`cli-cpp/`), TypeScript pour l'extension/le bridge.
- Node 20+, CMake ≥ 3.16.

## Workflow recommandé

1. **Fork** le dépôt et **créez une branche** (`git checkout -b feat/nom-court`).
2. **Commits conventionnels** : `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`, `perf:`.
3. Après modification, **validez localement** :
   ```bash
   npm run typecheck        # 0 erreur attendu
   npm test                 # suite node (node --test)
   cmake --build cli-cpp/cmake-build
   ctest --test-dir cli-cpp/cmake-build   # 100% pass attendu
   node scripts/soak-cli.mjs 100          # soak 100/100
   ```
4. **Ouvrez une PR** : utilisez le template `PULL_REQUEST_TEMPLATE.md` et référencez le contexte.

## Convention de style

- **CLI C++** : le CLI **délègue** toute logique métier au bridge ; ne ré-implémentez jamais Project OS.
- **Sortie** : `stdout` = données, `stderr` = diagnostics. Respectez `--format=json|ndjson|tsv`.
- **Invariants** : jamais d'exit code 0 sur erreur ; jamais de fake PASS ; `--dry-run` ne mute jamais.
- **Test** : chaque nouvelle fonctionnalité ajoute un test (`pos_json_test`, test TS, ou scénario soak).

## Signaler un bug

Ouvrez une **issue** via le template `ISSUE_TEMPLATE/bug_report.md`. Pour les **failles de sécurité**,
voir `SECURITY.md` (merci de ne pas les publier publiquement).

## Licence

En contribuant, vous acceptez que vos contributions soient diffusées sous la licence
Apache-2.0 du projet.
