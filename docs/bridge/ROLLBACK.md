# ROLLBACK — chatgpt-antigravity-bridge

## Principe
Le bridge est **désactivable par config** sans suppression de code. Project-OS continue de fonctionner si `bridge.enabled = false`.

## Désactivation
```bash
set BRIDGE_ENABLED=0
npm run compile
```
- `McpBridge.invokeWrapped` retourne `{ ok:false, "bridge disabled" }` dès que `!enabled` ou `stopped`.
- Le handler `/bridge status` reflète `enabled:false`.
- **Aucun fichier de `/goal`, `/create`, `/autonomy`, `/todo`, routing, budget modifié** par le module : rollback = désactiver.

## Points d'intégration (retirables sans cascade)
| Fichier | Changement | Revert |
|---|---|---|
| `package.json` | `@modelcontextprotocol/sdk` ajouté en deps | retirer |
| `src/commands/projectFactoryCommands.ts` | `slash.register("bridge", …)` + helpers | retirer le registre + helpers |
| `src/integrations/bridge/*` | module complet | supprimer le dossier |
| `src/tests/bridge*.test.ts` | tests | supprimer |

## Checkpoint
Repo racine sans `.git` (snapshot export) — pas de `git checkout` possible. La baseline de référence : `typecheck 0 · tests 341/341 PASS · ctest 1/1 PASS`. Aucune donnée utilisateur n'est écrite ou détruite par le bridge.

## Vérification après revert
`npm run typecheck && npm test` ⇒ 293/293 (baseline pré-bridge) puis tolérance des tests bridge retirés ⇒ vert.