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
- [x] 1.7 Alignement + en-têtes étendus aux commandes `doctor` / `config` / `preflight` / `models`.
- [x] 1.8 Menu interactif raffiné (sections, touches, retours colorés).
- [x] 1.9 Suggestions de sous-commandes pour les commandes inconnues.
- [x] 1.10 `--quiet` / `--verbose` (bannière + verbosité des diagnostics).

## Phase 2 — Usage & budget intelligence
- [x] 2.1 `usage record` → store générique `artifacts/usage/USAGE_REPORT.json` (agrégé + historique).
- [x] 2.2 `usage list` (historique des observations).
- [x] 2.3 `usage summary` (agrégat par job/modèle).
- [x] 2.4 Alerte budget (si `tokens`/`cost` dépasse `PROJECT_OS_DAILY_BUDGET`) → exit non nul.
- [x] 2.5 `budget forecast` avec tendance (échéance extrapolée).
- [x] 2.6 `insights tokens` par commande/source.
- [x] 2.7 Coût par critère de goal.
- [x] 2.8 Coût par modèle (répartition PAYG vs LocalAI).
- [x] 2.9 Appliquer la politique PAYG (`paidInferenceMode`).
- [x] 2.10 Export du reporting (CSV/JSON) via `usage export`.

## Phase 3 — Cockpit / dashboard
- [x] 3.1 `cockpit` restructuré en tuiles (health, gpu, usage, goal, todo).
- [x] 3.2 Refresh live multi-sources.
- [x] 3.3 Historisation (snapshot des tuiles).
- [x] 3.4 Export du cockpit (JSON/PNG).
- [x] 3.5 Navigation clavier (flèches/onglets).
- [x] 3.6 Minimum-width + repli si terminal étroit.
- [x] 3.7 Accessibilité (monochrome, gros contraste).
- [x] 3.8 Log en bas d'écran.
- [x] 3.9 Raccourci global `--cockpit`.
- [x] 3.10 Meilleures pratiques de rendu VT (pas de débordement).

## Phase 4 — CI & packaging
- [x] 4.1 `.github/workflows/ci.yml` (typecheck + ctest).
- [x] 4.2 Handle du test environnemental `bridgeProcess`.
- [x] 4.3 Badges de CI réels dans le README.
- [x] 4.4 `CPack` (install ZIP/DEB).
- [x] 4.5 `cmake --install` documenté + testé.
- [x] 4.6 Build Windows + matrix Linux/macOS.
- [ ] 4.7 Signing (optionnel).
- [ ] 4.8 Packaging VSIX de l'extension.
- [ ] 4.9 Script de mise à jour.
- [ ] 4.10 Génération des docs (md → pdf/html) en CI.

## Phase 5 — Modèles & routing
- [x] 5.1 Routeur adaptatif au contexte (task-class + longueur).
- [x] 5.2 Cache sémantique (prompt/réponse).
- [x] 5.3 A/B benchmark (comparateur multi-mesures).
- [x] 5.4 Gating de qualité (sortie validée).
- [x] 5.5 Quota multi-modèles.
- [x] 5.6 GPU offload (éligibilité + bascule).
- [x] 5.7 Profils de modèles (par type de projet).
- [x] 5.8 Policy provider (free/pass/payg).
- [x] 5.9 Éligibilité flash.
- [x] 5.10 `model route --explain` enrichi.

## Phase 6 — Git & workflows
- [x] 6.1 `git status` intégré (branche + dirty + commit).
- [x] 6.2 `git worktree` helper.
- [x] 6.3 Checkpoints.
- [x] 6.4 `.gitignore`/`.gitattributes` de projet.
- [x] 6.5 `git branch` / `git switch` helpers.
- [x] 6.6 Commit helper (message conventionnel).
- [x] 6.7 `git diff` / `stash` helpers.
- [x] 6.8 hook pre-commit.
- [x] 6.9 drift vs git.
- [x] 6.10 PR helper.
- [ ] 6.7 Drift vs git (baseline de branches).
- [ ] 6.8 Stash/restore.
- [ ] 6.9 PR helper (titre/description auto).
- [ ] 6.10 Release notes auto.

## Phase 7 — Artefacts & MCP
- [x] 7.1 `artifact publish` depuis le CLI.
- [x] 7.2 Integration ArtifactStore complète (versions, review).
- [x] 7.3 Outils MCP pour artefacts.
- [x] 7.4 `bridge tunnel` raffiné.
- [x] 7.5 `artifact search` full-text.
- [x] 7.6 Provenance + signature.
- [x] 7.7 Partage d'artefacts.
- [x] 7.8 Audit de sécurité MCP.
- [x] 7.9 Config MCP.
- [x] 7.10 `artifact verify` enrichi (schéma).

## Phase 8 — Tests & robustesse
- [x] 8.1 Fuzz/property harness (libFuzzer).
- [x] 8.2 Sanitizers (ASan/UBSan) en CI.
- [x] 8.3 Tests de précédence de config.
- [x] 8.4 Golden tests Unicode.
- [x] 8.5 Drift compare enrichi.
- [x] 8.6 Golden budget.
- [x] 8.7 Golden redaction.
- [x] 8.8 Budget de perf (mémoire/temps).
- [x] 8.9 Robustesse processus (kill/timeout).
- [x] 8.10 100 scénarios de soak.

## Phase 9 — Extensibilité & DX
- [x] 9.1 Commande slash personnalisée.
- [x] 9.2 Templates de projet.
- [x] 9.3 Schémas de sortie (JSON Schema).
- [x] 9.4 Completion dynamique (slugs + sous-commandes).
- [x] 9.5 `--dry-run` enrichi.
- [x] 9.6 Alias de commandes.
- [x] 9.7 Fichier de config (`~/.project-os/config`).
- [x] 9.8 Doc env (`PROJECT_OS_*`) enrichie.
- [x] 9.9 Script d'installation.
- [x] 9.10 Onboarding / guide rapide.

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
