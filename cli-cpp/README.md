# Project OS CLI (C++)

CLI en **C++/CMake** pour piloter Project OS par menus, sans passer par l'IDE (vscode/Cline).
Il dispatche les commandes slash réelles vers une passerelle Node (`bin/project-os-bridge.mjs`)
et lit les métadonnées JSON des projets gérés pour l'affichage.

## Prérequis
- **Node.js** (les commandes Project OS réelles sont exécutées par la passerelle)
- Un build de `dist/` : `npm run compile` dans `C:\Users\eiden\Desktop\dev\projet-os`
- **g++ / mingw64** et **cmake** (MSYS2 : `C:\msys64\mingw64\bin`)

## Build
```
$ENV:Path='C:\msys64\mingw64\bin;'+$ENV:Path
cd C:\Users\eiden\Desktop\dev\projet-os\cli-cpp
cmake -S . -B cmake-build -G "MinGW Makefiles"
cmake --build cmake-build
ctest --test-dir cmake-build --output-on-failure
```

### Packaging (CPack) + install
```bash
# Installe le binaire + la cible CMake dans <prefix>
cmake --install cmake-build --prefix <install-dir>
# Produit un ZIP portable (project-os-cli-0.1.0-v3.zip)
cpack --config cmake-build/CPackConfig.cmake -G ZIP
```
- `cmake --install` : binaire dans `bin/` + `project_os_cliTargets.cmake` (lib target) dans `lib/cmake/project_os_cli/`.
- `cpack -G ZIP` : archive portable (défaut `project-os-cli-<version>.zip`).

## Lancer le menu
```
cmake-build\project-os-cli.exe
```

## Mode non-interactif (scriptable)
```
project-os-cli <command> [args...]
```
Equivalent à une slash-commande réelle (préfixe `/` ajouté automatiquement). Sortie structurée `OK/FAIL status message`.
```
project-os-cli docs "ligue"   # navigation doc officielle
project-os-cli project <slug>                  # statut d'un projet géré
project-os-cli goal "Objective"                # définit le goal du projet actif
project-os-cli todo list                       # TODO barré
project-os-cli create myproj type=cpp          # créer un projet
```

### Codes de sortie (contrat F03)
En mode non-interactif, le processus renvoie un code de sortie stable et documenté
(`pos_exitcodes.hpp`) pour permettre le scripting. Un échec n'est **jamais** mappé sur `0` :

| Code | Nom | Signification |
|------|-----|---------------|
| `0` | `SUCCESS` | commande exécutée et réussie |
| `1` | `DOMAIN_FAILURE` | commande exécutée mais échec (ex. `NO_ACTIVE_PROJECT`, `NOT_FOUND`) |
| `2` | `INVALID_USAGE` | arguments/syntaxe invalides |
| `3` | `BRIDGE_FAILURE` | passerelle Node manquante / échec process |
| `4` | `TIMEOUT_OR_CANCELLED` | timeout ou Ctrl+C |
| `5` | `DEPENDENCY_UNAVAILABLE` | dépendance requise indisponible |
| `6` | `SECURITY_BLOCKED` | politique de sécurité a bloqué |
| `7` | `PROTOCOL_ERROR` | enveloppe/protocole invalide |
| `8` | `LOCALAI_UNAVAILABLE` | endpoint LocalAI injoignable |
| `9` | `GPU_BLOCKED` | précondition GPU non satisfaite |
| `10` | `TEST_FAILURE` | échec de(s) suite(s) de test |
| `11` | `RELEASE_BLOCKED` | release gate non satisfaite |
| `12` | `INTERNAL_ERROR` | erreur interne inattendue |

Exemple : `project-os-cli status --format=json` → `exit 1` quand aucun projet actif.

### Intelligence & analyse (10 commandes, read-only, dégradation propre)
Ajoutées au plan de commande (format `human|json|ndjson|tsv` via `--format=`). Toutes lisent le
projet actif (ou `--project`/slug) + les artefacts du control-plane. Aucune mutation.

| Commande | Rôle | Signal |
|---|---|---|
| `health score` | score composite 0-100 (goal, todo, git, addons, contenu, snapshots, tokens) | GOOD/FAIR/AT_RISK + grade A-E |
| `health trend` | évolution des scores sur les snapshots | IMPROVING/DECLINING/FLAT/NOT_ENOUGH_DATA |
| `health compare <a> [b]` | santé côte-à-côte de deux projets | A_BETTER/B_BETTER/EQUAL (exit 1 si b absent) |
| `budget forecast` | coût/burn extrapolé depuis les tokens + budget quotidien | EXACT_ZERO/SPEND |
| `insights tokens` | intelligence tokens (total, in/out, ratio, modèle) | HAS_USAGE/NO_USAGE |
| `diagnose` | batterie de checks classés | CLEAR/WARN/ALERT (exit 1 si issues) |
| `drift alert` | divergence vs snapshot baseline | CLEAR/ALERT/NO_BASELINE (exit 1 si ALERT) |
| `goal traction` | traction du goal (progress, todo, critères) | STRONG/MODERATE/WEAK |
| `autonomy health` | état du plan + handoff + deadline | COMPLETED/ACTIVE/EXPIRED/MISSING |
| `risk profile` | risques consolidés + gravité + mitigations | HIGH/MEDIUM/LOW + score |

Exemple : `project-os-cli health score` → `health score : FAIR  score=62 (C)` ; `drift alert`.
Ces commandes passent par `bin/project-os-bridge.mjs` (bus d'analyse déterministe ; LocalAI/GPU/git
dégradent en `n/a` sans erreur).

## Menu
```
1. List projects        # liste les projets gérés + sélectionner l'actif
2. Create project       # /create <name> type=<type>
3. Goal (active)        # /goal <objective>
4. Todo (active)        # /todo list / add / done
5. Autonomy (active)    # /autonomy plan|run|summary|--write
6. Docs online (active) # /docs <domain>  (navigation doc officielle en ligne)
7. Addons (active)      # /addon list|add|recommended|remove
8. Raw slash command    # toute commande slash libre
0. Quit
```

## Chemins / config (variables d'environnement)
| Var | Défaut | Rôle |
|---|---|---|
| `PROJECT_OS_REPO` | `C:\Users\eiden\Desktop\dev\projet-os` | racine du repo |
| `PROJECT_OS_REGISTRY` | `<repo>\.project-os-cli\managed-projects.json` | registre des projets gérés |
| `PROJECT_OS_PROJECTS_ROOT` | `C:\Users\eiden\Desktop\dev\projects` | racine des workspaces |
| `PROJECT_OS_ACTIVE_SLUG` | `(vide)` | slug du projet actif |
| `PROJECT_OS_MODEL` | `granite-4.2-3b-flash` | modèle LocalAI pour l'autonomie |

## Architecture
- `src/pos_json.hpp` : mini-parseur JSON (header-only, C++17)
- `src/pos_model.hpp` : lecture registry/project/goal/todo + helpers
- `src/pos_runner.hpp` : invocation de la passerelle Node (via `_popen`) + parsing du résultat JSON
- `src/project_os_cli.cpp` : menu interactif + mode non-interactif (scriptable)
- `tests/test_pos.cpp` : tests du parseur + modèle (ctest)

## Note
La passerelle (Node) réalise le vrai travail Project OS (le CLI C++ ne duplique pas la logique).
`dist/` doit être compilé (`npm run compile`) avant l'exécution.
