# GOAL CONTRACT BEFORE — `/goal`

_Annexe de la mission `PROJECT_OS_CHATGPT_ANTIGRAVITY_MCP_BRIDGE_V1` — capture de l'état avant toute modification (source = code + tests actuels)._

## 1. Fichiers responsables de `/goal`

| Fichier | Rôle |
|---|---|
| `src/projects/SlashCommands.ts` | parseur de lignes `/…`, `SlashCommandRegistry`, **`goalHandler`** (l.147), `parseSlash` |
| `src/projects/GoalService.ts` | persistance (`.project-os/goal.json`, `goal-history.jsonl`), `makeGoal` |
| `src/projects/projectTypes.ts` | type `GoalContract` (objective, acceptanceCriteria, constraints, nonGoals, priority, status, progress) |
| `src/commands/projectFactoryCommands.ts` | enregistrement `slash.register("goal", goalHandler)` |
| `bin/project-os-bridge.mjs` | dispatch réel des commandes vers le registre (bridge protocol v2) |
| `cli-cpp/src/project_os_cli.cpp` | CLI C++ : `cmdGoalProof` (l.501), help |
| `src/projects/GoalProofEngine.ts` | preuve d'atteinte (requis pour PROGRESS) |

## 2. Comportement observé

- `goalHandler(parsed, ctx)` :
  - cible active via `--project=<slug>` ou `activeProject` du contexte ; sinon → `NO_ACTIVE_PROJECT`.
  - objective manquante → `OBJECTIVE_REQUIRED`.
  - `new GoalService(target.workspaceRoot)`; `makeGoal({...})`; conserve `goalId`/`createdAt` si un goal précédent existe; `save` + `appendHistory` + `registry.update(target.slug, {goal, updatedAt})`.
  - retourne `CommandResult{command:"goal", ok:true, status:goal.status, message:"Goal set for <slug>"}`, artefact `.project-os/goal.json`.
- `makeGoal` génère `goal-<ts>-<rand>`, `status:"ACTIVE"`, `progress:0`.
- `/goal proof` (CLI C++ + bridge route) : retourne criteria + evidence.

## 3. Tests existants

- `src/tests/autonomy.test.ts` (dispatch `/goal` + `/autonomy` sur un projet créé).
- `src/tests/goalProofEngine.test.ts` (4 cas : never REACHED sans critères, REACHED seulement si tous satisfaits, maj evidence sans doublon, revoke remet unsatisfied).
- `src/tests/slashCommand.test.ts` (parseur + dispatch).
- `src/tests/todoCommand.test.ts` (utilise `/goal` comme étape du flux `/create` → `/goal` → `/todo`).

## 4. Invariants

1. Le parseur de `/goal` ne change pas (tokens, flags `--project`, `--criteria`, …).
2. Le stockage conserve les deux fichiers (json + jsonl), même schéma `GoalContract`.
3. La sémantique `status`/`progress` reste pilotée par `GoalProofEngine`.
4. Aucun nouveau module (bridge MCP) ne doit altérer le routage du `/goal` ni consommer ses fichiers en écriture hors de son propre workspace.
5. `bridge.enabled=false` ⇒ comportement Project-OS strictement identique.

## 5. Dépendances

`SlashCommandRegistry` ← `goalHandler` ← `GoalService`/`makeGoal`/`GoalProofEngine` ← `projectTypes` (`GoalContract`). Aucun état global partagé avec le futur bridge.

## 6. Risques de régression identifiés

- Réécrire le tokenizer `parseSlash` ⇒ casse `/create`, `/autonomy`, `/todo`, `/docs`, `/project`, `/report`.
- Modifier `GoalContract` ⇒ casse `GoalProofEngine`, `TradeDownPhase*`, affichages CLI/VS Code.
- Brancher le bridge dans le dispatch sans garde ⇒ `/goal` lent ou muté pendant une opération MCP.
- Non-respect de l'invariant 5 ⇒ régression silencieuse quand bridge off.

## 7. Hash / commit courant

`git rev-parse` → **repo racine SANS `.git`** (snapshot export). Aucun HEAD utilisable. La baseline de référence utilisée est :
`typecheck 0 · tests 293/293 PASS · ctest 1/1 PASS` (mesurée le 2026-09-01).

## Conclusion

Le contrat de `/goal` est **préservé intégralement** dans cette mission : aucun fichier listé ici ne sera modifié, sauf si un ajout purement additif (nouveau handler `/bridge`) est nécessaire et sans toucher au tokenizer existant.