# Test CLI en conditions réelles

> Documenté le 09/2026 — CLI C++ `cli-cpp/cmake-build/project-os-cli.exe` contre la **passerelle Node réelle**
> (`bin/project-os-bridge.mjs`, protocole v2) et le **projet réel** `sfl-observatory` (type `cpp`, READY, git, addons `core`+`cpp`).
> Env : `PROJECT_OS_REPO`, `PROJECT_OS_REGISTRY` (hub), `PROJECT_OS_ACTIVE_SLUG`.

## Matrice de résultats réels

| # | Commande | Résultat | Exit |
|---|---|---|---|
| 1 | `version` | `0.1.0-v3` · bridge protocole 2 · x86_64 | 0 |
| 2 | `status --format=json` | `{"ok":true,"status":"STATUS","active":"sfl-observatory","goalStatus":"ACTIVE","goalProgress":0,"todoDone":6,"todoCount":6}` | 0 |
| 3 | `project list` | `sfl-observatory cpp READY goal=ACTIVE (0%)` + `tmrdemo cpp READY` | 0 |
| 4 | `project inspect sfl-observatory` | carte `── project inspect ──` (slug/type/status/workspace/goal/todo 6/6) | 0 |
| 5 | `health score` | `⚠ FAIR 62/100 [C]` · goal défini · todo 6/6 · git 1 dirty · addons 2/2 · snapshots 0 · tokens 7200 | 0 |
| 6 | `git status` | `⚠ DIRTY` branch master · dirty 1 · commit `692b266` · changé `?? docs/` | 0 |
| 7 | `cockpit` (1 shot) | tuiles `[Status][Health][Usage][Addons 2][GPU RTX 5060][Perf 4.0s]` + log | 0 |
| 8 | `project inspect nosuch` | **exit 1** (contrat F03 : erreur ≠ 0) | **1** ✅ |
| 9 | `models --format=csv` | `id,status` (huggingface_smollm3-3b AVAILABLE …) | 0 |
| 10 | `route CODING --alt --format=json` | `chosen=granite-4.2-3b-flash` + raisons + alternatives classées (json) | 0 |
| 11 | `soak 20` | **20 pass, 0 fail** | 0 |
| 12 | `ctest` | **100% tests passed, 0 failed** | 0 |
| 13 | `npm run compile` | typecheck/build OK | 0 |

## Points forts validés
- **Machine-output cohérent** : `human` / `json` / `csv` fonctionnent en réel (status, models, route, cockpit).
- **Contrat de code de sortie (F03)** : `project inspect nosuch` → **exit 1** (jamais `0` sur erreur).
- **Runtime réel** : GPU **NVIDIA GeForce RTX 5060 Laptop** (nvidia-smi), routeur adaptatif (rank 15 modèles), addons réels `core`/`cpp`.
- **Cockpit** : 6 tuiles dont GPU réel + perf mesure (4 sources), log.

## Note de rendu console
Les glyphes box-drawing (`──`, `⚠`) apparaissent en mojibake dans les captures de terminal non-UTF-8 (CP437), mais **s'affichent correctement** dans une vraie console (le CLI force la page de code UTF-8 au démarrage).

## Release v1.0 — état de préparation
- **Tag `v1.0`** poussé sur `origin/main` ✅
- **Notes** : `docs/RELEASE_NOTES_v1.0.md` + `artifacts/cli-v3/CLI_V3_RELEASE_REPORT.md` ✅
- **Archive** : `cli-cpp/project-os-cli-0.1.0-v3.zip` (CPack) ✅
- **Script de publication** : `scripts/release-gh.mjs` ✅
- **Publication** : ⚠️ nécessite un token GitHub (ni `gh` ni `GITHUB_TOKEN` disponibles dans cet environnement).

### Commandes de publication (à exécuter par le propriétaire)
```powershell
# Option A — via gh CLI (si `gh auth login` fait)
gh release create v1.0 --repo regardlent/projet-os --title "Project OS CLI v1.0" --notes-file docs/RELEASE_NOTES_v1.0.md cli-cpp/project-os-cli-0.1.0-v3.zip

# Option B — via script avec un PAT (repo scope)
$env:GITHUB_TOKEN="ghp_xxx" ; node scripts\release-gh.mjs v1.0
```
