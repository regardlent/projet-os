# INTELLIGENT_MODEL_ROUTER — Cline Project OS

## Objectif
Choisir automatiquement le modèle **assez bon et assez bon marché** pour la tâche (jamais « toujours
le moins cher », jamais « toujours le plus fort »), sous capabilités/santé/quota/budget.

## Pipeline
```
TASK → classifyTask → TaskRequirements (complexité, context, tools, reasoning, vision)
→ buildCatalog → ModelCandidate[] (LocalAI, Cline free, ClinePass, PAYG)
→ capability filter (isCapable, hasUsableContext, isUp, cooldown/reset)
→ policy ordering (LOCAL_FIRST / FREE_FIRST / FREE_UNTIL_EXHAUSTED / PASS_FIRST / BALANCED /
   QUALITY_FIRST_WITH_BUDGET / MANUAL / FREE_ONLY)
→ score (capabilities + historique modèle/tâche + latence)
→ PAYG gated by ProjectBudgetGovernor (canAfford; COST_UNKNOWN => reject)
→ ModelSelectionDecision (selected, reasons, alternatives, budgetEffect, confidence)
```

## Politique par défaut recommandée
`FREE_UNTIL_EXHAUSTED` : candidats à coût marginal nul d'abord (LOCAL_FREE, PROVIDER_FREE,
SUBSCRIPTION_INCLUDED), puis PAYG **seulement si** PAYG activé + budget disponible. Sur limite :
`cooldown` jusqu'à `resetAt` (ou backoff borné), passage au candidat suivant — aucun retry storm.

## Capabilités avant gratuité
Une tâche de gros refactoring ne retient jamais un modèle gratuit sans `tools`/`reasoning` juste
parce qu'il est gratuit. LocalAI (qwen3-4b) : `streaming` prouvé, `tools` **non prouvé** → filtré pour
les tâches tool-heavy.

## Déterminisme
À données identiques, même sélection (tie-break par `modelId`). Aucune décision LLM opaque pour
choisir le modèle.

## Historique
`ModelPerformanceRegistry` : succès par (modèle, catégorie de tâche) + confiance qui croît avec
l'échantillon ; un seul run ne suffit pas à condamner/hisser un modèle.

## Budget
`ProjectBudgetGovernor` : budget journalier par `projectId` (tous sessions/agents/aliases), réservations
**atomiques** (anti-dépassement multi-agent), jamais remis à zéro par nouvelle session/déplacement de
workspace. `FREE_ONLY` => paid cost = 0.

## Limites connues
- Aucun prix PAYG réel (catalogue Cline recommandé n'en expose pas) → COST_UNKNOWN => approbation requise.
- Catalogue Cline free/pass : capacités déclarées (coding agent), non prouvées par le projet.
