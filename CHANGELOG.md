# Changelog

Toutes les modifications notables de **Cline Project OS**.

Le format s'appuie sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et ce projet suit le
[versioning sémantique](https://semver.org/lang/fr/).

## [Unreleased]

### Ajouté
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
