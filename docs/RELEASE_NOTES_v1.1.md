# Project OS CLI v1.1 — Génération de code par IA (codegen)

> Suite de `model write` / `model codegen` / `model project`. Le CLI choisit le modèle (routeur adaptatif), génère, compile, s'auto-corrige et **écrit/lance un projet complet**.

## Nouveautés
- **`model write <relpath> <obj>`** : génère via **localAI** et écrit dans le workspace gardé (anti-traversal `PATH_TRAVERSAL` → exit 6). N'écrit que le **vrai contenu** (jamais du prose de raisonnement).
- **`model codegen <relpath> <obj>`** : **autonome** — choix de modèle par le routeur, génère → compile (`g++`) → **s'auto-répare** en boucle jusqu'à un artefact compilable. Flags `--model/--tries/--gen-timeout` (anti-blocage).
- **`model project <name> <obj>`** : le CLI **écrit un projet complet** (impl + `main.cpp` + `CMakeLists.txt` isolé sous `work/<name>/`), **compile** et **lance** `run()`. Override déterministe `--impl=<relpath>`.
- **Routage** : le choix de modèle de codegen/project réutilise le routeur adaptatif (`route CODING`).

## Validation
- **`npm run test:codegen`** : preuve assemble+compile+run (déterministe, `--impl`) → **PASS** (`PROJECT_COMPILED`).
- Réel : `model project gencalc` → `work/gencalc/` + `gencalc.exe` **lance (exit 0)** ; `model codegen src/gen_csv.hpp` → `CODEGEN_COMPILED` (1 essai).
- `model write ../escape.cpp` → **`PATH_TRAVERSAL` exit 6** (aucun fichier hors workspace).
- Régression repo : typecheck **0 erreur** · cpp `ctest` **100%** · feature matrix **66**.

## Limite connue (honnête)
La **latence/qualité de LocalAI varie** : certaines générations aboutissent en secondes (qwen3-4b → splitter), d'autres renvoient vide/bloquent. Le chemin `--impl` du `model project` est **déterministe** (assemble+compile+run sans LocalAI).

## Install
```powershell
cmake -S cli-cpp -B cli-cpp/cmake-build && cmake --build cli-cpp/cmake-build
project-os-cli model write <relpath> "<objective>"
project-os-cli model codegen <relpath> "<objective>"
project-os-cli model project <name> "<objective>"
```
