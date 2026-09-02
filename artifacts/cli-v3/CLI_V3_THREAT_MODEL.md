# CLI_V3 THREAT MODEL (Phase 01)

> Modèle de menace du CLI C++ (client de Project OS). Chaque vecteur est analysé contre
> l'implémentation actuelle et la cible V3. Aucune vulnérabilité n'est cachée.

## TL;DR
Le CLI C++ est un client qui (1) lit du JSON, (2) invoque Node via une commande construite, (3)
affiche du texte dans un terminal Windows. Les vecteurs les plus à risque : **injection de
commande via arguments**, **injection de texte terminal (ANSI/control chars)**, **JSON malformé /
oversized**, **absence de timeout**, **exit code toujours 0**.

## Vecteurs

| # | Vecteur | Sévérité | Implémentation actuelle | Cible V3 |
|---|---|---|---|---|
| T1 | **Command injection via args** | HIGH | `dispatch()` → `"node " + shellQuote(bridge) + " " + shellQuote(slash)`. `shellQuote` minimal : échappe `"` mais pas les métacaractères PowerShell/cmd (`&`, `|`, `^`, `%`, `!`, `$`, `;`, newline) | `ProcessRunner` sur `CreateProcessW` avec `argv[]` explicit, aucun shell intermédiaire |
| T2 | **Terminal injection (ANSI/ESC/control)** | MEDIUM | Le renderer affiche `r.message`/`r.raw` sans assainir ; un `model name`/`title`/`artifact title` hostile peut injecter des séquences VT | `sanitizeTerminalText()` : strip ESC/BEL/C0, politique `--color` |
| T3 | **JSON malformé/oversized** | MEDIUM | `parseJson` mini-parser récursif ; pas de limite de profondeur/taille ; un JSON piégé → stack overflow/OOM | Limites explicites : profondeur max, taille max, récursion bornée, tests négatifs |
| T4 | **Path injection / traversal** | MEDIUM | `parseRegistry` lit le fichier `PROJECT_OS_REGISTRY` (chemin env) ; `readContent` non concerné (pas dans CLI) ; `project <slug>` passe au bridge | Le bridge/registry filtre déjà ; le CLI doit valider les slugs avant de les relayer |
| T5 | **Secret leak dans diagnostics** | MEDIUM | pas encore de bundle diagnostics (F30) ; à construire | `diagnostics bundle` doit rediger `[REDACTED]` (password/token/secret/api_key/Authorization/.env/private key) |
| T6 | **Resource exhaustion** | MEDIUM | `_popen` sans timeout → hang infini | `--timeout` global + `ProcessRunner` avec timeout ; jamais de hang silencieux |
| T7 | **Protocol spoof / stale evidence** | MEDIUM | la preuve GPU vit côté TS ; le CLI afficherait des données bridge non validées | contrat protocol v2 : validate `protocol`, `requestId`, `ok`, `status`, `result`, `timingMs`, `errors` |
| T8 | **Exit code 0 sur erreur (L1)** | HIGH | `main` retourne `0` dans tous les cas | taxonomie exit codes F03 (0 success / 1 domain / 2 usage / 3 bridge / 4 timeout / 5 dependency / 6 security / 7 protocol) |
| T9 | **ARGV Unicode / quoting** | LOW-MED | `argv` passé tel quel ; shellQuote minimal | `CreateProcessW` (UTF-16) + `argv[]` exact ; tests Unicode |
| T10 | **Oversized bridge response** | LOW-MED | `runNodeCommand` buffer `char[4096]` par `fgets` sur pipe → acceptable, mais pas de limite totale | limite de taille de réponse configurable + statut dédié |

## Menaces ÉCARTÉES (non applicables)
- **Kill de processus externe** : jamais (policy owned/child §13).
- **Cloud exfiltration** : jamais (no telemetry/crash-report/analytics cloud, §39).
- **Mutation non approuvée** : le CLI délègue au bridge gated ; lui-même read-only pour projet.

## Contraintes à respecter (invariants)
- Never kill LocalAI / Docker / Windows / user GPU app.
- No shell when an explicit process API suffices.
- No cloud. No fake PASS. No invented GPU proof. No exit 0 on error.

## 2026-09 — durcissement ajoutés (CLI C++)
- `pos::redactSecret` : masque Bearer / `sk-` dans les diagnostics/diff (testé golden).
- `--trace` emet le `requestId` sur **stderr** (jamais dans stdout machine), pas de secret.
- `toolClassOf` + `/bridge audit` : classification read/run et verrou `approval-required` par défaut.
- Sanitizers ASan/UBSan via `-DPOS_SANITIZE=ON` (CI `cpp-sanitize`) ; fuzz/property harness sur `parseJson`.
- Invariant conservé : **never exit 0 on error** (taxonomie F03), `--dry-run` n'effectue jamais de mutation.

