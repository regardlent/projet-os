# PROJECT FACTORY — Phase 13

> Project OS devient un **Control Plane** capable de créer/contrôler des projets gérés (hub-spoke).
> Noyau implémenté (v1) : `/goal`, `/create` (+ `/addon list/recommended`). Testé (node --test).

## Architecture
```text
HUB = C:\Users\eiden\Desktop\dev\projet-os        (control plane)
SPOKE = C:\Users\eiden\Desktop\dev\projects\<slug>
```

## PROJECTS_ROOT (configurable)
- Config `clineProjectOS.projectsRoot` (défaut `C:\Users\eiden\Desktop\dev\projects`).
- `controlPlaneRoot` = premier workspace (metadata seulement).

## Services (séparés, pas un géant)
| Service | Fichier | Rôle |
|---|---|---|
| Types/contrats | `src/projects/projectTypes.ts` | `ManagedProjectManifest`, `GoalContract`, `CommandResult`, statuts |
| Slug + path guard | `src/projects/slug.ts` | slug safe + blocage traversal/drive/réservé |
| GoalService | `src/projects/GoalService.ts` | persistance `goal.json` + `goal-history.jsonl` |
| ManagedProjectRegistry | `src/projects/ManagedProjectRegistry.ts` | registre hub `managed-projects.json` |
| ProjectFactory | `src/projects/ProjectFactory.ts` | création transactionnelle (folder+manifest+goal+git+registry) |
| SlashCommands | `src/projects/SlashCommands.ts` | parse + registry + handlers `/goal`,`/create`,`/addon` |
| vscode wiring | `src/commands/projectFactoryCommands.ts` | config, services, commandes VS Code |

## /create (v1)
Crée sous PROJECTS_ROOT :
```text
<slug>/
├── .project-os/project.json   (manifest)
├── .project-os/goal.json      (si --goal)
├── .agents/rules/
├── README.md
├── .gitignore
├── .env.example               (placeholders only)
├── docs/  src/  tests/
```
Et inscrit dans le `ManagedProjectRegistry`.

## Guards
- Slug normalisé (`/^[a-z0-9][a-z0-9-_]*$/`), blocage `..`, absolu, drive escape, device réservé (con, nul…).
- `PROJECT_ALREADY_EXISTS` si dossier ou registry a déjà le slug.
- `git init` optionnel (`--git=false`), échec non fatal.
- Aucun vrai secret copié ; `.env.example` = placeholders.

## Contrat résultat
`CommandResult { command, ok, projectId, status, message, warnings, actions, artifacts, next }`.

## Tests
`src/tests/projectFactory.test.ts`, `src/tests/slashCommand.test.ts` (slug/path-guard, goal persist/history,
registry, création + duplicate + traversal, parse + dispatch /create → /goal → /addon).
