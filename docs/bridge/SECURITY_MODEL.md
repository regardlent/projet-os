# SECURITY MODEL — ChatGPT Web ↔ MCP ↔ Project-OS bridge

## Périmètre
Le bridge expose **uniquement** des outils MCP sur un serveur loopback (`127.0.0.1`). Aucune mutation Project-OS directe à travers le bridge : les writes passent par les guards Project-OS existants (pas de voie parallèle).

## Principes FAIL-CLOSED
1. Workspace non approuvé ⇒ tout refusé (y compris les lectures).
2. Tool inconnu/toolClass inattendu ⇒ `dangerous` ⇒ refusé.
3. `bridge.enabled=false` ⇒ module inactif, Project-OS identique.
4. Validation de schéma par outil (missing required / unknown / wrong type / oversized).
5. Aucune exécution de commande arbitraire : `tests_run`/`build_run` acceptent uniquement des scripts **connus** du projet (allowlist).

## Path security (Windows)
- Suppression du préfixe long-path `\\?\` normalisé (légal à l'intérieur du volume root).
- Rejet : traversal `..`, encodé `%2e%2e`, octet nul, device paths `\\.\`, UNC hors volume, métacaractères shell `;&|<>"$`*?`, drive différent.
- Après résolution réelle : le target **realpath** doit rester dans le **realpath** du root (symlink/junction escape impossible).

## Secret guard
- `isSecretFile` (réutilisé) : `.env*`, `id_rsa`, `*.pem/p12/pfx/key`, credentials, tokens.
- Redaction logs : clés, bearer, `sk-…`, password, token ; jamais de contenu de fichier complet ni prompt dans les logs.
- `git_diff` passe par redaction avant retour.

## ProcessRunner
- `spawn()` args séparés, `shell:false`, cwd fixé, env allowlistée.
- timeout ⇒ `SIGKILL`; sortie bornée (`maxOutputBytes`); exit code capturé.
- jamais de concaténation de commande issue d'un input utilisateur.

## Permissions
| classe | décision |
|---|---|
| health / read (workspace approuvé) | approve |
| test-run / build-run (scripts connus) | needs-approval |
| antigravity-run | needs-approval |
| antigravity-write | needs-approval (only si writeEnabled) |
| network / dangerous / unknown | denied |

`--dangerously-skip-permissions` **jamais** émis (testé par `buildAntigravityArgs`).

## Concurrency
- maxConcurrentReads (4), maxConcurrentRuns (1), queueLimit (64), maxRuntimeMs (30 min).
- Refus propre quand saturé (pas de worker infini).

## Prompt injection
Le prompt/un fichier est du *data*. Aucune instruction contenue dans un fichier n'est interprétée comme permission système. Les classes d'outils sont dérivées du nom d'outil, jamais du contenu.

## Transport
- Mode A local : `127.0.0.1` (jamais `0.0.0.0` par défaut).
- Mode B tunnel : abstrait (`TunnelTransport` prévu) ; aucun endpoint OpenAI propriétaire inventé ; `SECURE_TUNNEL_API = NOT_VERIFIED` tant que `tunnel-client` absent.