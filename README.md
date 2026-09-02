# Cline Project OS

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg">
  <img alt="lang" src="https://img.shields.io/badge/language-C%2B%2B%20%2B%20TypeScript-blue.svg">
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows-blue.svg">
  <img alt="vscode" src="https://img.shields.io/badge/vscode-%E2%89%A51.90-blue.svg">
  <img alt="ci" src="https://img.shields.io/github/actions/workflow/status/regardlent/projet-os/ci.yml?branch=main&style=flat">
</p>

Une extension VS Code qui branche un **Control Center / Artifact System** autour du **vrai SDK Cline** (`@cline/sdk`). Construite comme chantier greenfield **autonome** (sans dépendance à un autre projet).

**✨ Fonctionnalités clés**
- **Extension VS Code** : Control Center sécurisé (webview CSP + nonce), Artifact System (state machine + versions + review), ProjectDNA, vues Projects/Artifacts.
- **CLI C++** (`cli-cpp/`) : pilotage par menus ou scriptable via `bin/project-os-bridge.mjs` ; `--format=json|ndjson|tsv`, `--color=auto|always|never`, `--timeout=<ms>`, `--explain/--dry-run`.
- **Intelligence & analyse** (10 features, read-only) : `health score`, `health trend`, `health compare <a> [b]`, `budget forecast`, `insights tokens`, `diagnose`, `drift alert`, `goal traction`, `autonomy health`, `risk profile`.
- **Runtime réel** : LocalAI loopback, GPU (`nvidia-smi`), models, route, endurance, report, release gate, export sarif, test matrix.

> ⚠️ État : **CLI C++ 10 phases complétées (90/100 étapes)**. Typecheck **0 erreur**, cpp `ctest` **100% pass**,
> `pos_json_test` **ALL PASS**, node **368/369** (1 échec = test antigravity environnemental du host, pré-existant).
> Le CLI pilote le bridge Project OS (LocalAI loopback, GPU `nvidia-smi`, models, route, artifacts, git, cockpit,
> intelligence & analyse) ; l'extension host et Antigravity restent **UNVERIFIED** sauf détection réelle.
> `release` → Release Center (version + feature matrix), `release bump <v>`, `release changelog`. Workspace canonique : `C:\Users\eiden\Desktop\dev\projet-os`.

## Prérequis

- Node 20+ (testé sur Node 24)
- VS Code ≥ 1.90

## Développement

```bash
cd project-os
npm install
npm run compile      # tsc -> dist/
npm run typecheck    # tsc --noEmit
npm test             # compile + node --test "dist/tests/*.test.js"
```

Pour lancer : ouvrir le dossier `project-os/` dans VS Code et F5 (extension host) —
un Launch config `Debug: Extension` est attendu (voir `.vscode/`).

## Getting Started (CLI C++)

Le **CLI C++** (`cli-cpp/`) pilote Project OS sans l'IDE : il délègue toute la logique au bridge
(`bin/project-os-bridge.mjs`, protocole v2) via `CreateProcessW` (pas de shell).

### 1. Build

```powershell
# MinGW + CMake requis (C:\msys64\mingw64\bin sur PATH)
cmake -S cli-cpp -B cli-cpp/cmake-build
cmake --build cli-cpp/cmake-build          # -> cli-cpp/cmake-build/project-os-cli.exe
```

### 2. Install (optionnel)

```powershell
# Build + copie dans ~\.project-os\bin + ajout PATH + completion PowerShell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
# Mise à jour : scripts\update.ps1   |   Signature : scripts\sign.ps1 (si cert)
```

### 3. Variables d'environnement

| Variable | Rôle |
|---|---|
| `PROJECT_OS_REPO` | repo racine (défaut : `C:\Users\<you>\Desktop\dev\projet-os`) |
| `PROJECT_OS_REGISTRY` | chemin du registre hub (`...\.hub-managed.json`) |
| `PROJECT_OS_ACTIVE_SLUG` | slug du projet actif |
| `PROJECT_OS_DAILY_BUDGET` | budget quotidien (alerte `usage summary`) |
| `PROJECT_OS_PAID_MODE` | politique PAYG (`free`/`pass`/`payg`) |

### 4. Exemples

```powershell
project-os-cli --format=json status        # état JSON du projet actif
project-os-cli project list                # projets gérés
project-os-cli health score                # santé composite (score + grade + signal)
project-os-cli models                      # modèles LocalAI
project-os-cli route CODING --alt          # routage adaptatif + alternatives
project-os-cli cockpit --watch=2           # dashboard live
project-os-cli git status                  # git du projet actif
project-os-cli release                     # Release Center (version + feature matrix)
project-os-cli welcome                     # guide rapide
project-os-cli st                          # alias -> status   (ls/…/hs/qx/cfg)
project-os-cli create demo --dry-run       # plan sans mutation (NO MUTATION)
project-os-cli --trace status              # requestId sur stderr
```

- **Formats machine** : `--format=json|ndjson|tsv` · **Couleur** : `--color=auto|always|never`, `--theme=light|dark`, `--mono`
- **Aide** : `--help` catégorisé · **Tests** : `ctest --test-dir cli-cpp/cmake-build` (100% pass) · `npm run typecheck` (0 erreur).
- **Installation de la completion** : `project-os-cli completion powershell|bash|zsh [--slugs]`.

## Architecture

```
ClineCore (@cline/sdk)  ──>  ClineRuntimeAdapter  ──>  RuntimeEventNormalizer
                                                                  ↓
                                        ProjectEvent (événements internes stabilisés)
                                                                  ↓
                                          ArtifactRegistry + ArtifactStore (persistance)
                                                                  ↓
                                      ArtifactsTreeProvider + ControlCenter (webview sécurisé)
```

- `ClineRuntimeAdapter` : seule chose qui importe `@cline/sdk` à l'exécution.
- `PermissionsAdapter` : politiques d'outils réelles (lecture auto-approvée ; écriture => approbation ;
  deploy/push => désactivé).
- `ArtifactRegistry` + `ArtifactStore` : state machine, versions, commentaires, review,
  persistance atomique, tolérance aux index corrompus.
- `ProjectDNA` : scan en lecture seule du stack.

## Sécurité

- Webview : CSP stricte + nonce + validation des messages.
- Outils sensibles : jamais auto-approuvés sans politique explicite.
- Pas de télémétrie externe, pas de publication automatique, pas de secret.

## Tests

- Machine à états des artifacts.
- Normalisation des événements Cline (`chunk`, `hook`, `ended`, `status`, …).
- Politiques de permissions.
- Registre + persistance + récupération de corruption.

## CLI C++ (cli-cpp)

En complément de l'extension, un **CLI C++/CMake** (`cli-cpp/`) pilote Project OS par menus ou en
mode scriptable via la passerelle Node (`bin/project-os-bridge.mjs`). Voir `cli-cpp/README.md`.

- Surface : `help`, `version`, `status`, `project list|use|inspect|watch`, `drift`, `timeline`,
  `snapshot`, `diff`, `goal proof`, `todo board`, `artifact *`, `addon verify`, `config`, `doctor`,
  `diagnostics`, `preflight`, `models`, `model *`, `route`, `gpu`, `test list|matrix`, `report`,
  `release gate`, `export sarif`, `cockpit`, `completion`, `bridge status|start|stop|…`.
- **Intelligence & analyse (10 features, phase 27+)** : `health score`, `health trend`,
  `health compare <a> [b]`, `budget forecast`, `insights tokens`, `diagnose`, `drift alert`,
  `goal traction`, `autonomy health`, `risk profile`. Bus d'analyse déterministe (read-only),
  sortie `human|json|ndjson|tsv`, dégradation propre si git/LocalAI/GPU indisponibles.
- `--format=json|ndjson|tsv`, `--color=auto|always|never`, `--timeout=<ms>`, `--explain/--dry-run`.

## Documentation

- [Feuille de route 50×50 (2500 étapes)](docs/CLI_ROADMAP_50X50.md) — plan de la prochaine génération du CLI.
- **`cli-cpp/README.md`** — CLI C++ : build (CMake), menu interactif, mode scriptable, codes de sortie, Intelligence & analyse.
- **`docs/PROJECT_OS_CLI_V3_REFERENCE.md`** — référence CLI v3 (architecture, 50 features + IA01-IA10, limitations honnêtes).
- **`docs/SLASH_COMMANDS.md`** — commandes slash `/goal`, `/create`, `/addon`, `/autonomy`, `/docs`.
- **`artifacts/cli-v3/`** — pack d'évidence CLI (feature matrix, release gate/report, security, soak, research).

## Exemples d'utilisation (CLI)
```bash
# Projet actif
project-os-cli status                  # résumé du projet actif (── status ──)
project-os-cli health score            # score composite + barre + grade + couleur
project-os-cli diagnose                # diagnostic classé (CLEAR/WARN/ALERT, exit 1 si issues)
project-os-cli drift alert             # divergence vs baseline snapshot
project-os-cli goal traction           # traction du goal (progress + todo + critères)
project-os-cli risk profile            # risques consolidés + mitigations

# Formats machine (stdout = data, stderr = diagnostics)
project-os-cli health score --format=json
project-os-cli risk profile --format=ndjson
project-os-cli diagnose --format=tsv
```

## Roadmap (non implémenté)

Multi-agent/teams, MCP, Task/Testing API, Git/worktree/checkpoints, Release Center,
Accessibilité/E2E Antigravity.
