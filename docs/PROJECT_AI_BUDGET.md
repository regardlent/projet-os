# PROJECT_AI_BUDGET — Cline Project OS

## Modèle
- Budget journalier **pay-as-you-go** par `projectId` (stable, survit aux migrations de chemin/aliases).
- `paidInferenceMode` : `OFF` (défaut) / `ASK_EVERY_TIME` / `AUTO_WITHIN_PROJECT_BUDGET`.
- `dailyPaidBudget` (défaut 0 = aucun PAYG) ; devise affichée sans conversion FX silencieuse.

## Comptabilisation (pas de double comptage)
- **PAYG** (`PAY_AS_YOU_GO`) : coût réel compté dans le daily paid spend.
- **ClinePass** (`SUBSCRIPTION_INCLUDED`) : coût variable = `SUBSCRIPTION_COVERED` ; **ne diminue pas**
  le budget pay-as-you-go.
- **Free / LocalAI** (`PROVIDER_FREE` / `LOCAL_FREE`) : coût marginal = `EXACT_ZERO` ; ne diminue pas
  le budget PAYG.
- **BYOK / prix inconnu** : `ESTIMATED` / `UNKNOWN` — jamais inventé.

## Réservations atomiques (anti-dépassement multi-agent)
Avant un run PAYG : estimate worst-case → `reserve()` atomique → run → `commitActual()` → release.
Autorisé si `spent + réservations + nouvelle <= dailyBudget`. Réservation orpheline expirée après TTL.
Le routeur ne modifie jamais le budget ; `ProjectBudgetGovernor` et la politique de sécurité sont
souverains.

## Résolution de coût
`reserve(0.80)` puis `commitActual(0.51)` → release 0.29, enregistre 0.51. Si actual > réservation,
enregistre l'actual (jamais de coût falsifié) et désactive les futurs PAYG si le budget est dépassé.

## UI
- Status bar : `$X/$Y` si PAYG activé, sinon `$(shield) Free-only`.
- `budget.status` et `mode.route` (pourquoi ce modèle) affichent spent / reserved / remaining / status.

## Garanties
- Aucun achat/recharge/souscription automatique ; aucune escalade automatique de budget.
- Aucun contournement de quota ; aucun retry storm, `cooldown` jusqu'à `resetAt`.
