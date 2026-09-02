# Rendre le dépôt populaire — guide appliqué

Synthèse des recommandations GitHub (docs officielles : *Viewing your subscriptions* et best-practices
SEO/community health) et des guides spécialisés. Contenu actionnable.

## 1. Découvrabilité (SEO GitHub)

- **Description du repo** (réglages → About → cog) : 1 phrase claire + mots-clés. **Ne pas laisser vide.**
  Suggestion déjà prête :
  > CLI C++ + extension VS Code qui pilote Project OS : LocalAI, GPU, artefacts, MCP, cockpit, git.
  > `--format=json|ndjson|tsv`, groups, intelligence & analyse. Délégué au bridge (no shell).
- **Topics** (réglages → About → Topics) — à ajouter :
  `cli`, `devtools`, `c-plus-plus`, `cxx`, `cmake`, `typescript`, `vscode-extension`, `mcp`,
  `localai`, `gpu`, `artifacts`, `open-source`, `developer-tools`, `productivity`.
- **URL du site** (About → website) : pointez vers votre page/gh-pages si dispo.
- **README** : badges d'action (CI, license), section « what it does », installation **claire et en tête**,
  section « contribute » → `CONTRIBUTING.md`, et **liens vers les docs**.
- **Activité** (stars/forks) : un dépôt **actif** (commits réguliers, releases, issues traitées) gagne des étoiles.

## 2. Fichiers communauté (≥ minimum)

Créés dans `.github/` :
- `CODE_OF_CONDUCT.md` (Contributor Covenant) ✅
- `CONTRIBUTING.md` ✅
- `SECURITY.md` ✅
- `FUNDING.yml` ✅
- `ISSUE_TEMPLATE/bug_report.md` + `feature_request.md` ✅
- `PULL_REQUEST_TEMPLATE.md` ✅
- (Astuce) un dépôt `.github` d'organisation permet des fichiers par défaut partagés.

## 3. Tags & releases

- **Taguer les releases** (`git tag -a v1.0 -m "…"` puis `git push origin v1.0`) ✅ fait.
- **Changelog** dans `CHANGELOG.md` (Keep a Changelog) ✅.
- **`.gitattributes`** : `export-ignore` pour ne pas embarquer les artefacts de build dans les zip ✅.
- Publier des **assets téléchargeables** (zip du binaire via CPack) sur chaque release.

## 4. Abonnements & notifications (veille active)

Pour suivre l'activité d'un repo et être notifié des **releases/issues/PR/security** :
1. Cliquez sur **Watch** → **Custom** → cocheur exactement ce qui vous intéresse
   (**Releases, Issues, Pull requests, Discussions, Security alerts**) — recommandation GitHub pour un flux sain.
2. Revoir ses abonnements : icône cloche (haut-droite) → **Notifications** → barre latérale →
   **Gérer les notifications** → **Subscriptions** / **Dépôts surveillés**.
3. **Trier par « abonnements les moins récents »** pour repérer les oublis, puis **se désabonner**.
4. Utiliser les options **Custom** pour éviter la sur-abonnement ; laisser les `@mention`/participations
   recevoir quand même les notifications.

## 5. Hygiène du dépôt

- **Branches** : supprimer les branches périmées (plusieurs douzaines = signal de manque de contrôle).
- **Badges d'actions** : CI (`typecheck`, `ctest`, `docs`, `cpp-sanitize`) activés ✅.
- Un **`.github/`** bien rempli = dépôt perçu comme **maintenu et accueillant**.
