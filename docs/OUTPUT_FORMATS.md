# Formats de sortie machine — CLI C++

Le CLI supporte une **surface machine-output unifiée** : `--format=human|json|ndjson|tsv|csv|md|html`.

## Matrice (commande → formats)

| Commande | human | json | ndjson | tsv | csv | md | html |
|---|---|---|---|---|---|---|---|
| `status` | ✅ | ✅ | — | — | — | — | — |
| `project list` | ✅✅(aligné) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `project inspect <s>` | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |
| `models` | ✅✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `artifact list` | ✅✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Intelli & analyse (10) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `usage list / summary` | ✅✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `model smoke <id>` | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |
| `benchmark compare <a> <b>` | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |
| `gpu status` | ✅ | ✅ | — | — | ✅ | — | — |
| `snapshot list` | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |
| `tree` | ✅ | — | — | — | — | — | — |
| `config` | ✅ | ✅ | — | ✅ | — | — | — |

✳️ `human` = cartes `── … ──` / table alignée (`renderTable`) selon la commande.
✳️ `csv`/`md`/`html` sur les listes = en-tête + lignes ; sur les analyses = table `key,value`.

## Règles
- `stdout` = **data** ; `stderr` = **diagnostics** (`--time`, `--trace`, `errMsg`).
- `--format=auto` (tty) → human ; sinon machine.
- Exit codes : contrat **F03** (échec ≠ 0).
- Raccourcis : `--json`/`--ndjson`/`--tsv` ; niveaux `-q/-qq/-v/-vv` ; `--limit=<n>`.

## Usage typique en CI
```powershell
project-os-cli project list --format=csv | Import-Csv
project-os-cli health score --format=json | ConvertFrom-Json   # .score
project-os-cli models --format=md                               # intégration README
```
