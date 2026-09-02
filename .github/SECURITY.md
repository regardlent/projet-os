# Politique de sécurité

Merci de signaler toute vulnérabilité de manière **responsable**. Merci de **ne pas** publier
publiquement les failles avant leur correction.

## Signaler une vulnérabilité

- Ouvrez une issue **privée** (Security Advisory) de préférence, ou contactez les mainteneurs.
- Décrivez la faille, la version impactée, et une preuve de concept si possible.
- Ne divulguez pas publiquement avant que nous ayons publié un correctif.

## Périmètre

Ce projet inclut :
- Le **CLI C++** (`cli-cpp/`) — process runner (`CreateProcessW`, no shell), parsing JSON, rendu.
- Le **bridge Node** (`bin/project-os-bridge.mjs`) et le module MCP (`src/integrations/bridge/`).
- L'**extension VS Code** (webview Control Center, ArtifactSystem).

## Invariants de sécurité (à préserver)

- **Aucun shell** lorsqu'une API de processus explicite suffit (jamais de ligne de commande construite
  à partir d'entrée utilisateur).
- **Redaction** des secrets (Bearer, `sk-`) via `pos::redactSecret` ; `--trace` n'émet que sur stderr.
- **Path-traversal** bloqué (guardPath / `boundaryRead` / `artifact verify`).
- **Jamais d'exit 0 sur erreur** ; `--dry-run` n'effectue jamais de mutation.

## Réponse

Nous visons une réponse sous 7 jours pour les signalements, avec un correctif priorisé selon la
gravité (critique / élevé / moyen / faible).
