# TOKEN INTELLIGENCE — Cline Project OS

## Objectif
Suivre de façon honnête les tokens connus des sessions Cline pilotées/reconnues par Project OS,
avec provenance et qualité, sans jamais fabriquer ni confondre EXACT/ESTIMATED/UNKNOWN.

## Sources réelles accessibles (vérifiées 0.0.81)
- `ClineCore.getAccumulatedUsage(sessionId)` → 0 pour LocalAI streaming (gap d'usage).
- `session.result.usage` (AgentResult) → 0 aussi.
- Raw LocalAI (`/v1/chat/completions`, non-streaming) → `completion_tokens > 0`.
- LocalAI streaming (+`include_usage`) → `usage {0,0,0}` (racine du problème).

## Où disparaissent les tokens (preuve)
1. Cline envoie `stream:true` + `stream_options.include_usage:true` (traces réelles).
2. LocalAI renvoie un chunk `usage: {prompt_tokens:0, completion_tokens:0, total_tokens:0}`.
3. Donc `ClineCore` accumule 0 → `getAccumulatedUsage`/`session.result.usage` = 0.
→ **Catégorie B** : LocalAI ne peuple pas l'usage en streaming (non-streaming le peuple, 2048).

## Pipeline
```
Cline events / results / accumulated usage
        │
   UsageTelemetryCollector (collecte + normalise)
        │
   UsageReconciler (dédup par correlationId/id, précédence source, delta cumulatif, counter-reset)
        │
   TokenLedger (JSONL observations + aggregates atomiques)
        │
   TokenAggregates (session/agent/workspace/project/global, par modèle/provider)
        │
   Token Intelligence UI + Status bar
```

## Qualité (jamais fusionnée silencieusement)
- `EXACT` : compteur fourni par provider/runtime fiable.
- `DERIVED` : delta de snapshots cumulatifs.
- `ESTIMATED` : tokenizer approximatif local (`tokenEstimate`).
- `UNKNOWN` : aucune mesure fiable (ex. `SDK_USAGE_GAP`).

## Anti-double-comptage
- Observations de la même requête (`correlationId`) comptées une fois, précédence :
  `LOCALAI_REQUEST_USAGE > CLINE_SESSION_RESULT > CLINE_USAGE_EVENT > CLINE_ACCUMULATED_USAGE > LOCAL_ESTIMATE > UNKNOWN`.
- Les `RAW_PROBE` (tests diagnostics) sont **exclus** des totaux projet/session.

## Historique honnête
- Import via `HistoricalUsageImporter` : EXACT si usage>0 ; sinon `UNKNOWN/quality=UNKNOWN, note=SDK_USAGE_GAP`.
- `WorkspaceRegistry` : `projectId` stable ; les chemins historique + canonique → **même workspaceId**.
- `developmentStartedAt` : date la plus ancienne prouvée, jamais inventée.

## Sécurité / vie privée
- Le ledger stocke **uniquement nombres + métadonnées**. Jamais contenu, code, clés, secrets.
- Écritures atomiques ; corruption tolérée (lignes invalides droppées, pas de perte totale).

## Limitations connues
- Avec LocalAI streaming, aucun compteur exact par session n'est disponible (usage=0).
- Estimation locale = qualité ESTIMATED, jamais EXACT.
- Le ledger est une métrique Project OS ; il ne modifie pas l'état Cline/SDK.
