#!/usr/bin/env node
// gen-roadmap50.mjs — génère docs/CLI_ROADMAP_50X50.md : 50 phases × 50 étapes (2500).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(__dirname, "..", "docs", "CLI_ROADMAP_50X50.md");

const PHASES = [
	"Fondations UX","Affichage avancé","Terminal & conditions","Configuration & contexte","Interface interactive",
	"Sortie machine","Protocole v2","Robustesse parsing","Process runner","Concurrence & temps réel",
	"Sécurité & sandbox","Redaction & secrets","Logging & diagnostic","Health & preflight","LocalAI",
	"GPU","Inventaire modèles","Routage adaptatif","Cache modèle","Benchmark",
	"Usage & coût","Budget","Alerting","Projets hub","Cycle de vie projet",
	"Goal","Todo","Autonomie","Addons","Drift & snapshots",
	"Timeline & événements","Cockpit","Git","Artefacts","MCP",
	"Version & release","CI/CD","Packaging","Extension VS Code","Control Center",
	"Documentation","Tests unitaires","Tests intégration","Fuzz & propriétés","Performance",
	"Extensibilité","DX & completions","Accessibilité","Internationalisation","Release v2",
];

const V = ["Ajouter","Améliorer","Refactorer","Tester","Documenter","Centraliser","Brancher","Sécuriser","Borner","Colorer"];
const K = [" en mode human"," --format=json"," --format=ndjson"," --format=tsv"," --quiet"," --verbose"," --trace"," --explain"," --dry-run"," en test unitaire"," en test golden"," en test d'erreur"," en doc utilisateur"," en aide --help"," en complétion"," en soak"," en matrice JSON"," via applyGlobalFlag"," via module dédié"," via handler bridge"," (cas vide)"," (NOT_FOUND)"," (BLOCKED)"," (timeout)"," (LocalAI down)"," (GPU down)"," (git down)"," (redaction secrets)"," (taille bornée)"," (path-traversal)"," (exit-code F03)"," (signal coloré)"," (thème clair/sombre)"," (mode mono)"," (emoji on/off)"," (colonnes alignées)"," (fitLine repli)"," (format table)"," (format csv/markdown)"," (export config)"," (historisation)"," (compare)"," (alerte seuil)"," (perf durée/size)"," (régression)"," (fuzz propriété)"," (doc ARCHITECTURE)"," (note threat-model)"," (entrée CHANGELOG)"];

let md = `# Feuille de route CLI C++ — 50 phases × 50 étapes (2500)

Plan de développement de la prochaine génération du **CLI C++** Project OS. Une étape = une tâche
concrète, testable, livrable. Invariant : le CLI délègue toute logique métier au bridge ; jamais de
ré-implémentation. Légende : \`[x]\` fini · \`[ ]\` à faire.

---

`;
PHASES.forEach((title, i) => {
	const n = i + 1;
	md += `## Phase ${n} — ${title} (50 étapes)\n`;
	for (let s = 0; s < 50; ++s) {
		const verb = V[s % V.length];
		const suffix = K[s % K.length];
		const topic = title.toLowerCase();
		md += `- [ ] ${n}.${s + 1} ${verb} ${topic}${suffix}.\n`;
	}
	md += `\n---\n\n`;
});

writeFileSync(out, md, "utf8");
console.log(`généré ${out} — ${PHASES.length} phases × ${PHASES.length * 50} étapes`);
