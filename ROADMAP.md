# ROADMAP — Cline Project OS CLI (développement par phases)

> Plan de développement en **10 phases × 10 étapes = 100 étapes**. Chaque étape est un livrable
> actionnable et validable (build + ctest + démo CLI). Les étapes déjà réalisées sont cochées `[x]`.

## Phase 1 — UX & affichage
- [x] 1.1 `--help` catégorisé par thème (en-têtes `── … ──`, colonnes alignées).
- [x] 1.2 En-têtes `── … ──` uniformes sur `status` / `project inspect`.
- [x] 1.3 Barre de score `[######----]` + grade coloré sur les commandes Intelligence.
- [x] 1.4 Signal coloré (vert/jaune/rouge) géré par `--color` (coulé dans `wmain`).
- [x] 1.5 Émojis de statut (✅ / ⚠️ / ❌) devant le signal, désactivables via `--no-emoji`.
- [x] 1.6 `--theme=light|dark|auto` (palette ANSI standard vs bright).
- [ ] 1.7 Alignement + en-têtes étendus aux commandes `doctor` / `config` / `preflight` / `models`.
- [ ] 1.8 Menu interactif raffiné (sections, touches, retours colorés).
- [ ] 1.9 Suggestions de sous-commandes pour les commandes inconnues.
- [ ] 1.10 `--quiet` / `--verbose` (bannière + verbosité des diagnostics).

## Phase 2 — Usage & budget intelligence
- [x] 2.1 `usage record` → store générique `artifacts/usage/USAGE_REPORT.json` (agrégé + historique).
- [ ] 2.2 `usage list` (historique des observations).
- [ ] 2.3 `usage summary` (agrégat par job/modèle).
- [ ] 2.4 Alerte budget (si `tokens`/`cost` dépasse `PROJECT_OS_DAILY_BUDGET`) → exit non nul.
- [ ] 2.5 `budget forecast` avec tendance (échéance extrapolée).
- [ ] 2.6 `insights tokens` par commande/source.
- [ ] 2.7 Coût par critère de goal.
- [ ] 2.8 Coût par modèle (répartition PAYG vs LocalAI).
- [ ] 2.9 Appliquer la politique PAYG (`paidInferenceMode`).
- [ ] 2.10 Export du reporting (CSV/JSON) via `usage export`.

## Phase 3 — Cockpit / dashboard
- [ ] 3.1 `cockpit` restructuré en tuiles (health, gpu, usage, goal, todo).
- [ ] 3.2 Refresh live multi-sources.
- [ ] 3.3 Historisation (snapshot des tuiles).
- [ ] 3.4 Export du cockpit (JSON/PNG).
- [ ] 3.5 Navigation clavier (flèches/onglets).
- [ ] 3.6 Minimum-width + repli si terminal étroit.
- [ ] 3.7 Accessibilité (monochrome, gros contraste).
- [ ] 3.8 Log en bas d'écran.
- [ ] 3.9 Raccourci global `--cockpit`.
- [ ] 3.10 Meilleures pratiques de rendu VT (pas de débordement).

## Phase 4 — CI & packaging
- [ ] 4.1 `.github/workflows/ci.yml` (typecheck + ctest).
- [ ] 4.2 Handle du test environnemental `bridgeProcess`.
- [ ] 4.3 Badges de CI réels dans le README.
- [ ] 4.4 `CPack` (install ZIP/DEB).
- [ ] 4.5 `cmake --install` documenté + testé.
- [ ] 4.6 Build Windows + matrix Linux/macOS.
- [ ] 4.7 Signing (optionnel).
- [ ] 4.8 Packaging VSIX de l'extension.
- [ ] 4.9 Script de mise à jour.
- [ ] 4.10 Génération des docs (md → pdf/html) en CI.

## Phase 5 — Modèles & routing
- [ ] 5.1 Routeur adaptatif au contexte (task-class + longueur).
- [ ] 5.2 Cache sémantique (prompt/réponse).
- [ ] 5.3 A/B benchmark (comparateur multi-mesures).
- [ ] 5.4 Gating de qualité (sortie validée).
- [ ] 5.5 Quota multi-modèles.
- [ ] 5.6 GPU offload (éligibilité + bascule).
- [ ] 5.7 Profils de modèles (par type de projet).
- [ ] 5.8 Policy provider (free/pass/payg).
- [ ] 5.9 Éligibilité flash.
- [ ] 5.10 `model route --explain` enrichi.

## Phase 6 — Git & workflows
- [ ] 6.1 `git status` intégré (branche + dirty + commit).
- [ ] 6.2 `git worktree` helper.
- [ ] 6.3 Checkpoints.
- [ ] 6.4 `.gitignore`/`.gitattributes` de projet.
- [ ] 6.5 `git branch` / `git switch` helpers.
- [ ] 6.6 Commit helper (message conventionnel).
- [ ] 6.7 Drift vs git (baseline de branches).
- [ ] 6.8 Stash/restore.
- [ ] 6.9 PR helper (titre/description auto).
- [ ] 6.10 Release notes auto.

## Phase 7 — Artefacts & MCP
- [ ] 7.1 `artifact publish` depuis le CLI.
- [ ] 7.2 Integration ArtifactStore complète (versions, review).
- [ ] 7.3 Outils MCP pour artefacts.
- [ ] 7.4 `bridge tunnel` raffiné.
- [ ] 7.5 `artifact search` full-text.
- [ ] 7.6 Provenance + signature.
- [ ] 7.7 Partage d'artefacts.
- [ ] 7.8 Audit de sécurité MCP.
- [ ] 7.9 Config MCP.
- [ ] 7.10 `artifact verify` enrichi (schéma).

## Phase 8 — Tests & robustesse
- [ ] 8.1 Fuzz/property harness (libFuzzer).
- [ ] 8.2 Sanitizers (ASan/UBSan) en CI.
- [ ] 8.3 Tests de précédence de config.
- [ ] 8.4 Golden tests Unicode.
- [ ] 8.5 Drift compare enrichi.
- [ ] 8.6 Golden budget.
- [ ] 8.7 Golden redaction.
- [ ] 8.8 Budget de perf (mémoire/temps).
- [ ] 8.9 Robustesse processus (kill/timeout).
- [ ] 8.10 100 scénarios de soak.

## Phase 9 — Extensibilité & DX
- [ ] 9.1 Commande slash personnalisée.
- [ ] 9.2 Templates de projet.
- [ ] 9.3 Schémas de sortie (JSON Schema).
- [ ] 9.4 Completion dynamique (slugs + sous-commandes).
- [ ] 9.5 `--dry-run` enrichi.
- [ ] 9.6 Alias de commandes.
- [ ] 9.7 Fichier de config (`~/.project-os/config`).
- [ ] 9.8 Doc env (`PROJECT_OS_*`) enrichie.
- [ ] 9.9 Script d'installation.
- [ ] 9.10 Onboarding / guide rapide.

## Phase 10 — Finition & release
- [ ] 10.1 Release Center.
- [ ] 10.2 Version bump automatisé.
- [ ] 10.3 Changelog auto.
- [ ] 10.4 Docs finales (référence complète).
- [ ] 10.5 README polish final.
- [ ] 10.6 Mise à jour de `docs/ARCHITECTURE_DECISION.md`.
- [ ] 10.7 Mise à jour du threat model / security report.
- [ ] 10.8 Trace de bout en bout (request id).
- [ ] 10.9 Test de régression complet (typecheck + node + cpp).
- [ ] 10.10 TAG de release v1.0.
