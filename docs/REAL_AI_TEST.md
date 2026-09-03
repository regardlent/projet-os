# Test réel — création + dev piloté par CLI & localAI

> Objectif : créer un **projet C++ réel** via le CLI, le développer pendant une session (goal/todo + inférence **localAI**), puis **compiler et lancer l'exe**.
> Projet : **`textkit`** — `count` (lignes/mots/caractères/quittes) + `csv2md` (CSV → tableau Markdown).

## 1. Création via le CLI (avec timer multi-étape)
```
create textkit --type=cpp --git=true
  status : READY   timer : 83ms
  step scaffold : 3ms · addons : 6ms · git : 71ms · todo : 1ms
```
Le CLI a créé le workspace (`.project-os/{project,goal,todo}.json`, `.agents/skills/cpp-dev`, `src/`, `tests/`, `docs/`, git init).

## 2. Goal + todos via le CLI
`goal "Build textkit: ... --accept=compiles,tests --priority=high"` → `ACTIVE` · puis 4 `todo add`.

## 3. Preuve localAI (inférence réelle)
`model smoke granite-4.2-3b-flash` → **HTTP 200 · 1764 ms · 55 tokens** · réponse `7`.

## 4. ⚠️ Constat : le CLI+localAI n'a pas (encore) pu écrire tout le projet
Le CLI ne disposait d'**aucune commande** « générer + écrire un fichier » (l'autonomie `/autonomy` est **read-only** et `@cline/agents` n'est pas installé). J'ai donc **ajouté la capacité `model write`** (bridge + CLI) :
- `model write <relpath> <objectif>` → **génération localAI** (`/chat/completions`) → **écriture dans le workspace gardé** (anti-traversal) → `WRITTEN`.

Résultats **réels et honnêtes** :
| Cible | résultat localAI | verdict |
|---|---|---|
| `src/dummy.hpp` / `src/code1.hpp` (petit, précis) | `#pragma once inline int add(int,int){...}` / `inline int triple(int){...}` | ✅ **code valide** |
| `src/textkit.cpp` / `src/textkit_core.cpp` (module complet) | plan de raisonnement — **non écrit** désormais | ❌ **`MODEL_EMPTY_OUTPUT`** (échec honnête) |

📌 **Conclusion** : le petit modèle local (**granite-4.2-3b-flash**) produit du code fiable pour un **artefact ciblé / fonction unique**, mais **pas pour un module multi-fonctions avec I/O**. Depuis l'amélioration de `model write`, il **refuse honnêtement** (`MODEL_EMPTY_OUTPUT`) plutôt que d'écrire du prose de raisonnement dans un `.cpp`.

## 5. Implémentation de référence (opérateur) → compile + tourne
`src/main.cpp` **compilable** (opérateur) :
- `cmake -S . -B build -G "MinGW Makefiles"` → OK · `cmake --build build` → **`textkit.exe`**
- **`count`** : `textkit count samples/sample.txt` → `lines=4 words=13 chars=75 bytes=75` ✅
- **`csv2md`** : `textkit csv2md samples/sample.csv` → tableau Markdown aligné ✅
- **`ctest`** : **100% tests passed (2/2)** ✅

## 6. Sécurité
`model write ../escape.cpp` → **`PATH_TRAVERSAL`** (exit non nul) · aucun fichier hors workspace créé ✅

## 7. Observations véridiques (edge)
- Sur un repo sans commit, `git status` affiche `branch : No` (parse le git status « no commits yet ») — mineur.
- Le contenu « reasoning » du modèle contient parfois des marqueurs Markdown ; la commande `model write` les strip quand ils sont en fenêtre de code.

## Fichiers d'évidence (workspace `textkit`)
- `src/dummy.hpp` (généré par localAI — valide) · `src/textkit.cpp` (généré par localAI — plan, à titre d'évidence)
- `src/main.cpp` (référence opérateur) · `CMakeLists.txt` · `samples/*` · `build/textkit.exe`
