# Changelog

Toutes les modifications notables de **Cline Project OS**.

Le format s'appuie sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et ce projet suit le
[versioning sémantique](https://semver.org/lang/fr/).

## [1.0.0] - 2026-09-02

### Résumé
- **Roadmap CLI C++ 10×10 complétée (100/100)** et tag git **`v1.0`** publié.
- Le CLI garde l'invariant **« le CLI délègue toute logique métier au bridge »** (jamais de ré-implémentation).
- Régression verte : typecheck **0 erreur**, cpp `ctest` **100%**, `pos_json_test` **ALL PASS**, node **368/369**
  (1 échec = test antigravity environnemental pré-existant), soak **100/100**.

### Ajouté
- **UX** : `--help` catégorisé, cartes `── … ──`, score bar, grade coloré, `--theme`, `--mono`, `--no-emoji`,
  `--quiet|--verbose`, `cockpit --watch|history|export`, alias (`st/ls/inspect/hs/qx/cfg`), `welcome`.
- **Intelligence & analyse** : `health score|trend|compare`, `budget forecast`, `insights tokens`, `diagnose`,
  `drift alert|compare`, `goal traction|cost`, `autonomy health`, `risk profile` (+ `--source`, politique PAYG).
- **Modèles** : routeur adaptatif (`--alt`), `model qualify|compare|flash|policy|quota|profiles|offload|cache`.
- **Git** : `git status|log|commit|diff|branch|worktree|stash|ignore|checkpoint|hook|drift|pr`.
- **Artefacts & MCP** : `artifact publish|versions|review|provenance|share|verify` (+ schéma), MCP tools
  `artifact_verify|artifact_search`, `/bridge config|audit`, `--tools` tunnel (12 outils MCP).
- **Robustesse** : `prefer` (précédence config), `redactSecret`, `budgetVerdict` (golden), fuzz/property,
  perf budget, soak, `--trace` requestId, config file `~/.project-os/config.json`, `custom add|list`.
- **Release & packaging** : `release` (center/bump/changelog), `schema envelope|exitcodes`, `template list`,
  `scripts/install.ps1|update.ps1|sign.ps1`, Vsix packaging, job CI `docs` + `cpp-sanitize`.

### Corrigé / Durci
- Build cassé réparé ; `cmdHelpOld` (code mort) supprimé.
- Mapping `parseCmdResult` (`goal proof`, `project inspect` todo), contrat exit-code F03, UTF-8 console.
- `.gitignore` : `.vscode/`, `artifacts/published|shared|provenance`, `_CPack_Packages`.
- Sanitizers ASan/UBSan (`-DPOS_SANITIZE=ON`) en CI.

## [Unreleased]

### Ajouté
- **Feuille de route CLI 50×50 (2500 étapes)** : `docs/CLI_ROADMAP_50X50.md` (+ générateur `scripts/gen-roadmap50.mjs`).

- **`--help` catégorisé** : regroupement par thème (Général / Projet / Intelligence & analyse /
  Artefact & config / Modèle & GPU / Qualité & release / Bridge MCP) avec en-têtes `── … ──` et
  colonnes alignées.
- **`usage record`** : pipeline d'usage **générique** — enregistre une observation tokens/coût/perf
  (`--job --input --output --model --ttft --tps --cost`) dans `artifacts/usage/USAGE_REPORT.json`
  (agrégé + historique), lue par `report`, `insights tokens` et `budget forecast`. Restaure `tokens`
  après le retrait des rapports de projets de test.
- **CLI C++ — Intelligence & analyse (10 features, read-only)** :
  `health score`, `health trend`, `health compare <a> [b]`, `budget forecast`, `insights tokens`,
  `diagnose`, `drift alert`, `goal traction`, `autonomy health`, `risk profile`.
  Bus d'analyse déterministe dans `bin/project-os-bridge.mjs` (`gatherSignals`), rendu
  `human|json|ndjson|tsv`, dégradation propre si git/LocalAI/GPU indisponibles.
- **Affichage utilisateur soigné** : en-tête `── … ──`, **barre de score** `[######----] 62/100`,
  grade coloré `[C]`, signal coloré (vert/jaune/rouge) selon `--color`, colonnes alignées.
- **REAME/CHANGELOG** : badges, section « Fonctionnalités clés », ce changelog.

### Corrigé
- Build CLI C++ (**compilait plus** : `cmdSemanticDiff` non fermé + doublon `cmdHelp`).
- Contrat de code de sortie (F03) : `status`, `project list|use|inspect` retournaient `0` même en échec.
- Mapping `parseCmdResult` : `goal proof` (champs `goalStatus`/`goalObjective` top-level) et
  `project inspect` (comptes `todo` dérivés du tableau) affichaient vide/`0/0`.
- UTF-8 console (page de code `65001`) pour les caractères de boîte / tirets cadratins.
- Retrait des références aux projets de test (`prob-reddit`, `sfl`, `futtable`, `vulnforge`, …) des
  docs, artefacts, code et tests ; le dépôt ne contient que **CLI + projet-os**.

### Sécurité
- Aucun secret versionné (`.env`, clés) ; `.gitignore` exclut `node_modules`, `dist`, builds, artefacts
  d'environnement, `diagnostics`.
