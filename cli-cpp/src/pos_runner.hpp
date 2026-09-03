// pos_runner.hpp — invoke the Project OS node bridge and surface the result.
#pragma once
#include <array>
#include <algorithm>
#include <cstdio>
#include <string>
#include "pos_json.hpp"
#include "pos_model.hpp"
#include "pos_process.hpp"
#include "pos_protocol.hpp"

namespace pos {

// Phase 49 — Internationalisation: a minimal, testable bilingual catalog (fr/en).
// The CLI surface is French-first; --lang=en switches the user-facing labels.
enum class Lang { Fr, En };
inline Lang g_lang = Lang::Fr; // global selected language (default fr)

// Bilingual label set used by errMsg/okMsg and card headers. Pure + unit-testable.
enum class Lw { ERR, OK, TRACE, TIME, RUNTIME, USAGE };
inline const char* i18n(Lang l, Lw w) {
	switch (l) {
		case Lang::En:
			switch (w) {
				case Lw::ERR: return "Error";   case Lw::OK: return "OK";
				case Lw::TRACE: return "trace";   case Lw::TIME: return "time";
				case Lw::RUNTIME: return "runtime"; case Lw::USAGE: return "usage";
			}
			break;
		case Lang::Fr:
		default:
			switch (w) {
				case Lw::ERR: return "Erreur";  case Lw::OK: return "OK";
				case Lw::TRACE: return "trace";   case Lw::TIME: return "time";
				case Lw::RUNTIME: return "runtime"; case Lw::USAGE: return "usage";
			}
			break;
	}
	return ""; // unreachable
}

// F17 timeline event.
struct TimelineEvent { long long at = 0; std::string type; std::string detail; };
// F23 artifact info.
struct ArtifactInfo { std::string id; std::string type; int size = 0; std::string status; std::string source; int version = 0; };

// Result of a dispatched slash command (subset).
struct CmdResult {
	bool ok = false;
	std::string command;
	std::string status;
	std::string message;
	std::string next;
	std::vector<std::string> warnings;
	std::vector<std::string> actions;
	std::vector<std::string> artifacts;
	std::string raw;
	std::string requestId; // 10.8 end-to-end trace (bridge envelope requestId)
	int timingMs = 0; // bridge envelope timingMs (ex. temps de création)
	// F99 create: chronogramme des étapes (label + ms).
	std::vector<std::pair<std::string, long long>> createSteps;
	// F01/F02: capability negotiation fields (bridge "capabilities").
	int protocol = 0;
	std::vector<int> protocols;
	std::vector<std::string> commands;
	std::vector<std::string> features;
	std::vector<std::string> outputModes;
	// F11 status: active project summary.
	std::string activeSlug;
	std::string activeProjectId;
	std::string activeWorkspace;
	std::string projectType;
	std::string projectStatus;
	std::string goalStatus;
	int goalProgress = 0;
	std::string goalObjective;
	int todoCount = 0;
	int todoDone = 0;
	// F12 project list.
	std::vector<ProjectInfo> projects;
	// F17 timeline events.
	std::vector<TimelineEvent> events;
	// F21 goal proof.
	std::vector<std::string> criteria;
	// F22 todo board.
	std::vector<std::string> openTasks;
	std::vector<std::string> doneTasks;
	int totalTasks = 0;
	// F23/F24 artifact.
	std::vector<ArtifactInfo> artifactList;
	std::string artifactContent;
	std::string artifactId;
	int artifactSize = 0;
	// F26 verify issues.
	std::vector<std::string> verifyIssues;
	// F27 addon verify.
	std::vector<std::string> addonIds;
	std::vector<std::string> addonStates;
	int addonEnabledCount = 0;
	// F28 config.
	std::vector<std::pair<std::string, std::string>> configKv;
	// INTELLIGENCE & ANALYSIS: composite score/grade/signal + rows(k/v) + details.
	int score = 0;
	std::string grade;
	std::string signal;
	std::vector<std::pair<std::string, std::string>> analysisKv;
	std::vector<std::string> details;
	// F31 preflight.
	bool pfLocalAI = false;
	bool pfWorkspace = false;
	bool pfGpu = false;
	bool pfSecurity = false;
	// F31 model id.
	std::string modelId;
	// F33/F34 models.
	std::vector<ArtifactInfo> modelList;
	std::vector<std::pair<std::string, std::string>> modelKv;
	// F35 route.
	std::string routeChosen;
	std::string routeReason;
	std::string routeTaskClass;
	// F36 smoke.
	int smokeHttp = 0;
	long long smokeLatencyMs = 0;
	int smokeTokens = 0;
	std::string smokeContent;
	// F37 benchmark.
	int benchmarkTps = 0;
	// F41/F42 test runner: suite inventory and matrix results.
	struct TestRow { std::string suite; std::string label; std::string resource; int count = 0; bool pass = false; int fail = 0; std::string lastResult; };
	std::vector<TestRow> testSuites;
	std::vector<TestRow> testRows;
	int passedSuites = 0;
	int totalSuites = 0;
	// F44 endurance status.
	struct GateState { int rung = 0; bool pass = false; };
	std::vector<int> completedRungs;
	std::vector<GateState> gateStates;
	std::string offloadProof;
	std::string encModel;
	std::string encGpu;
	int encVramDeltaMiB = 0;
	// F43 benchmark compare.
	struct BmSide { std::string source; std::string model; int tokensPerSec = 0; int ttftMs = 0; };
	BmSide bmA, bmB;
	std::string bmVerdict;
	// F46 report.
	int repTokensIn = 0, repTokensOut = 0, repTokensTotal = 0;
	int repCostFree = 0;
	std::string repCostLocalAI;
	int repTtftMs = 0;
	int repTps = 0;
	// F45 endurance run.
	int erRung = 0;
	std::string erStatus;
	int erFreeVramMiB = 0;
	int erRequiredMiB = 0;
	// F47 release gate.
	bool rgReady = false;
	int rgPassed = 0, rgTotal = 0;
	// F48 sarif export.
	int sarifFindings = 0;
	// F51 protocol negotiate.
	std::vector<int> serverProtocols;
	int selectedProtocol = 0;
	bool protocolCompatible = false;
};

inline std::vector<std::string> splitLines(const std::string& s) {
	std::vector<std::string> o; std::string cur;
	for (char c : s) { if (c == '\n') { o.push_back(cur); cur.clear(); } else if (c != '\r') cur += c; }
	o.push_back(cur); return o;
}

// Pure result parser (F07 refactor, testable in isolation). Decodes the v2
// envelope into a CmdResult. No side effects, no process — safe to unit-test
// with synthetic JSON. (Body defined below dispatch.)
inline CmdResult parseCmdResult(const std::string& raw);

// --- parseCmdResult body (pure, testable) ------------------------------------------
inline CmdResult parseCmdResult(const std::string& raw) {
        CmdResult r;
        r.raw = raw;
	std::string jsonLine;
	// Prefer the protocol envelope line (the JSON from the bridge). Some routes invoke
	// child suites whose stdout/stderr is echoed before the JSON; the last non-empty
	// line may be a child log, so key on the envelope marker instead.
	for (auto& line : splitLines(r.raw)) if (line.find("\"protocol\"") != std::string::npos) jsonLine = line;
	if (jsonLine.empty()) for (auto& line : splitLines(r.raw)) if (!line.empty()) jsonLine = line;
	try {
		auto root = parseJson(jsonLine);
		// F10: validate the v2 envelope schema; malformed => PROTOCOL_ERROR.
		bool hasProto = false; int proto = 0; bool okFlag = false; std::string st; std::string vreason;
		if (!pos::validateEnvelope(root, hasProto, proto, okFlag, st, vreason)) {
			r.ok = false; r.status = "PROTOCOL_ERROR"; r.message = "protocol schema invalid: " + vreason; return r;
		}
		// v2 envelope: { protocol, requestId, ok, status, result:{...}, timingMs, errors }
		const JValue* res = root.get("result");
		const JValue* src = (res && res->kind == JKind::Object) ? res : &root;
		// F07 robustness: if `result` exists but does not carry its own `ok`, fall back
		// to the envelope-level `ok`. Otherwise `ok` degenerates to false and the
		// CLI misreports the command as failed.
		bool okSet = false;
		if (auto* b = src->get("ok")) { r.ok = b->boolean; okSet = true; }
		if (!okSet) { if (auto* b = root.get("ok")) r.ok = b->boolean; }
		if (auto* s = src->get("command")) r.command = s->asString();
		if (auto* s = src->get("status")) r.status = s->asString();
		if (auto* s = src->get("message")) r.message = s->asString();
		if (auto* s = root.get("requestId")) r.requestId = s->asString(); // 10.8 end-to-end trace
		if (auto* t = root.get("timingMs")) r.timingMs = static_cast<int>(t->number); // F99 create timer
		// F99: chronogramme des étapes de création (result.steps = [{label, ms}]).
		if (auto* steps = src->get("steps"); steps && steps->kind == JKind::Array) {
			for (auto& e : steps->arr) if (e.kind == JKind::Object) {
				std::string lb = ""; long long ms = 0;
				if (auto* x = e.get("label")) lb = x->asString();
				if (auto* x = e.get("ms")) ms = (long long)x->number;
				r.createSteps.emplace_back(lb, ms);
			}
		}
		if (auto* s = src->get("next")) r.next = s->asString();
		if (auto* a = src->get("warnings"); a && a->kind == JKind::Array) for (auto& e : a->arr) r.warnings.push_back(e.asString());
		if (auto* a = src->get("actions"); a && a->kind == JKind::Array) for (auto& e : a->arr) r.actions.push_back(e.asString());
		if (auto* a = src->get("artifacts"); a && a->kind == JKind::Array) for (auto& e : a->arr) r.artifacts.push_back(e.asString());
		// F02 capability negotiation fields (flat on the result object).
		if (auto* p = src->get("protocol")) r.protocol = static_cast<int>(p->number);
		if (auto* arr = src->get("commands"); arr && arr->kind == JKind::Array) for (auto& e : arr->arr) r.commands.push_back(e.asString());
		if (auto* arr = src->get("outputModes"); arr && arr->kind == JKind::Array) for (auto& e : arr->arr) r.outputModes.push_back(e.asString());
		if (auto* arr = src->get("protocolsSupported"); arr && arr->kind == JKind::Array) for (auto& e : arr->arr) r.protocols.push_back(static_cast<int>(e.number));
		if (auto* f = src->get("features"); f && f->kind == JKind::Object) for (auto& [k, v] : f->obj) if (v.boolean) r.features.push_back(k);
		// F11 status: active + goal + todo counts.
		if (auto* act = src->get("active"); act && act->kind == JKind::Object) {
			if (auto* s = act->get("slug")) r.activeSlug = s->asString();
			if (auto* s = act->get("projectId")) r.activeProjectId = s->asString();
			if (auto* s = act->get("workspaceRoot")) r.activeWorkspace = s->asString();
		}
		// F14 inspect: flat fields on result (slug/type/projectStatus/workspaceRoot).
		if (auto* s = src->get("slug")) r.activeSlug = s->asString();
		if (auto* s = src->get("type")) r.projectType = s->asString();
		if (auto* s = src->get("projectStatus")) r.projectStatus = s->asString();
		if (auto* s = src->get("workspaceRoot")) r.activeWorkspace = s->asString();
		if (auto* g = src->get("goal")) {
			if (auto* s = g->get("status")) r.goalStatus = s->asString();
			if (auto* s = g->get("progress")) r.goalProgress = static_cast<int>(s->number);
			if (auto* s = g->get("objective")) r.goalObjective = s->asString();
		} else {
			// goal proof emits top-level goalStatus/goalProgress/goalObjective (not nested).
			if (auto* s = src->get("goalStatus")) r.goalStatus = s->asString();
			if (auto* s = src->get("goalProgress")) r.goalProgress = static_cast<int>(s->number);
			if (auto* s = src->get("goalObjective")) r.goalObjective = s->asString();
		}
		// inspect may emit a `todo` array instead of todoCount/todoDone; derive counts.
		{
			const auto* tc = src->get("todoCount");
			const auto* td = src->get("todoDone");
			if (tc) r.todoCount = static_cast<int>(tc->number);
			if (td) r.todoDone = static_cast<int>(td->number);
			if (!tc && !td) {
				if (auto* arr = src->get("todo"); arr && arr->kind == JKind::Array) {
					for (auto& e : arr->arr) { r.todoCount++; if (auto* s = e.get("state"); s && s->asString() == "done") r.todoDone++; }
				}
			}
		}
		// F12 project list: array of projects.
		if (auto* arr = src->get("projects"); arr && arr->kind == JKind::Array) {
			for (auto& e : arr->arr) {
				ProjectInfo pi;
				if (auto* s = e.get("slug")) pi.slug = s->asString();
				if (auto* s = e.get("name")) pi.name = s->asString();
				if (auto* s = e.get("type")) pi.projectType = s->asString();
				if (auto* s = e.get("status")) pi.status = s->asString();
				if (auto* s = e.get("goalProgress")) pi.goalProgress = static_cast<int>(s->number);
				if (auto* s = e.get("goalStatus")) pi.goalStatus = s->asString();
				r.projects.push_back(pi);
			}
		}
		// F17 timeline: array of { at, type, detail }.
		if (auto* arr = src->get("events"); arr && arr->kind == JKind::Array) {
			for (auto& e : arr->arr) {
				TimelineEvent ev;
				if (auto* s = e.get("at")) ev.at = (long long)s->number;
				if (auto* s = e.get("type")) ev.type = s->asString();
				if (auto* s = e.get("detail")) ev.detail = s->asString();
				r.events.push_back(ev);
			}
		}
		// F21 goal proof: criteria array.
		if (auto* arr = src->get("criteria"); arr && arr->kind == JKind::Array) for (auto& e : arr->arr) r.criteria.push_back(e.asString());
		// F22 todo board: open/done arrays + total.
		if (auto* arr = src->get("open"); arr && arr->kind == JKind::Array) for (auto& e : arr->arr) r.openTasks.push_back(e.asString());
		if (auto* arr = src->get("done"); arr && arr->kind == JKind::Array) for (auto& e : arr->arr) r.doneTasks.push_back(e.asString());
		if (auto* n = src->get("total")) r.totalTasks = static_cast<int>(n->number);
		// F23 artifact list: array of { id, type, size, status, source, version } (field name: items).
		if (auto* arr = src->get("items"); arr && arr->kind == JKind::Array) {
			for (auto& e : arr->arr) {
				ArtifactInfo ai;
				if (auto* s = e.get("id")) ai.id = s->asString();
				if (auto* s = e.get("type")) ai.type = s->asString();
				if (auto* s = e.get("size")) ai.size = static_cast<int>(s->number);
				if (auto* s = e.get("status")) ai.status = s->asString();
				if (auto* s = e.get("source")) ai.source = s->asString();
				if (auto* n = e.get("version")) ai.version = static_cast<int>(n->number);
				r.artifactList.push_back(ai);
			}
		}
		// F24 artifact show: id/content/size.
		if (auto* s = src->get("id")) r.artifactId = s->asString();
		if (auto* s = src->get("content")) r.artifactContent = s->asString();
		if (auto* s = src->get("size")) r.artifactSize = static_cast<int>(s->number);
		// F26 verify issues.
		if (auto* arr = src->get("issues"); arr && arr->kind == JKind::Array) for (auto& e : arr->arr) r.verifyIssues.push_back(e.asString());
		// F27 addon verify: array of { id, enabled, status }.
		if (auto* arr = src->get("addons"); arr && arr->kind == JKind::Array) {
			for (auto& e : arr->arr) {
				if (auto* s = e.get("id")) r.addonIds.push_back(s->asString());
				if (auto* s = e.get("status")) r.addonStates.push_back(s->asString());
			}
		}
		if (auto* n = src->get("enabledCount")) r.addonEnabledCount = static_cast<int>(n->number);
		// F28 config: object of key -> value.
		if (auto* c = src->get("config"); c && c->kind == JKind::Object) {
			for (auto& [k, v] : c->obj) { std::string val = v.kind == JKind::String ? v.asString() : (v.kind == JKind::Number ? std::to_string(v.number) : (v.boolean ? "true" : "false")); r.configKv.emplace_back(k, val); }
		}
		// F31 preflight nested booleans.
		if (auto* la = src->get("localAI"); la && la->kind == JKind::Object) if (auto* s = la->get("reachable")) r.pfLocalAI = s->boolean;
		if (auto* ws = src->get("workspace"); ws && ws->kind == JKind::Object) if (auto* s = ws->get("ok")) r.pfWorkspace = s->boolean;
		if (auto* g = src->get("gpu"); g && g->kind == JKind::Object) if (auto* s = g->get("available")) r.pfGpu = s->boolean;
		if (auto* sec = src->get("security"); sec && sec->kind == JKind::Object) if (auto* s = sec->get("loopback")) r.pfSecurity = s->boolean;
		// F31 model id.
		if (auto* s = src->get("model")) r.modelId = s->asString();
		// F33 models: array of { id, status } (field: items).
		if (auto* arr = src->get("items"); arr && arr->kind == JKind::Array) {
			for (auto& e : arr->arr) { ArtifactInfo mi; if (auto* s = e.get("id")) mi.id = s->asString(); if (auto* s = e.get("status")) mi.type = s->asString(); r.modelList.push_back(mi); }
		}
		// F34 model show: object 'model' -> flat kv.
		if (auto* m = src->get("model"); m && m->kind == JKind::Object) {
			for (auto& [k, v] : m->obj) { std::string val = v.kind == JKind::String ? v.asString() : (v.kind == JKind::Number ? std::to_string(v.number) : (v.boolean ? "true" : "false")); r.modelKv.emplace_back(k, val); }
		}
		// F35 route.
		if (auto* s = src->get("chosen")) r.routeChosen = s->asString();
		if (auto* s = src->get("reason")) r.routeReason = s->asString();
		if (auto* s = src->get("taskClass")) r.routeTaskClass = s->asString();
		// F36 smoke.
		if (auto* s = src->get("http")) r.smokeHttp = static_cast<int>(s->number);
		if (auto* s = src->get("latencyMs")) r.smokeLatencyMs = (long long)s->number;
		if (auto* s = src->get("tokens")) r.smokeTokens = static_cast<int>(s->number);
		if (auto* s = src->get("content")) r.smokeContent = s->asString();
		// F37 benchmark.
		if (auto* s = src->get("ttftMs")) r.smokeLatencyMs = static_cast<long long>(s->number);
		if (auto* s = src->get("tokensPerSec")) r.benchmarkTps = static_cast<int>(s->number);
		if (auto* s = src->get("runs")) r.smokeTokens = static_cast<int>(s->number);
		// F41/F42 test runner: suites (inventory) + tests (matrix rows).
		auto parseTestArray = [&](const char* key, std::vector<CmdResult::TestRow>& out) {
			if (auto* arr = src->get(key); arr && arr->kind == JKind::Array) for (auto& e : arr->arr) {
				CmdResult::TestRow tr;
				if (auto* s = e.get("suite")) tr.suite = s->asString();
				if (auto* s = e.get("label")) tr.label = s->asString();
				if (auto* s = e.get("resource")) tr.resource = s->asString();
				if (auto* s = e.get("count")) tr.count = static_cast<int>(s->number);
				if (auto* b = e.get("pass")) tr.pass = b->boolean;
				if (auto* s = e.get("fail")) tr.fail = static_cast<int>(s->number);
				if (auto* s = e.get("lastResult")) tr.lastResult = s->asString();
				out.push_back(tr);
			}
		};
		parseTestArray("suites", r.testSuites);
		parseTestArray("tests", r.testRows);
		if (auto* n = src->get("passedSuites")) r.passedSuites = static_cast<int>(n->number);
		if (auto* n = src->get("totalSuites")) r.totalSuites = static_cast<int>(n->number);
		// F44 endurance: completedRungs, gateStates, offloadProof.
		if (auto* arr = src->get("completedRungs"); arr && arr->kind == JKind::Array) for (auto& e : arr->arr) r.completedRungs.push_back(static_cast<int>(e.number));
		if (auto* arr = src->get("gateStates"); arr && arr->kind == JKind::Array) for (auto& e : arr->arr) { CmdResult::GateState g; if (auto* s = e.get("rung")) g.rung = static_cast<int>(s->number); if (auto* b = e.get("pass")) g.pass = b->boolean; r.gateStates.push_back(g); }
		if (auto* s = src->get("offloadProof")) r.offloadProof = s->asString();
		if (auto* s = src->get("model")) r.encModel = s->asString();
		if (auto* s = src->get("gpu")) r.encGpu = s->asString();
		if (auto* s = src->get("vramDeltaFreeMiB")) r.encVramDeltaMiB = static_cast<int>(s->number);
		// F43 benchmark compare: a{...}, b{...}, verdict.
		if (auto* a = src->get("a"); a && a->kind == JKind::Object) { if (auto* s = a->get("source")) r.bmA.source = s->asString(); if (auto* s = a->get("model")) r.bmA.model = s->asString(); if (auto* s = a->get("tokensPerSec")) r.bmA.tokensPerSec = static_cast<int>(s->number); if (auto* s = a->get("ttftMs")) r.bmA.ttftMs = static_cast<int>(s->number); }
		if (auto* b = src->get("b"); b && b->kind == JKind::Object) { if (auto* s = b->get("source")) r.bmB.source = s->asString(); if (auto* s = b->get("model")) r.bmB.model = s->asString(); if (auto* s = b->get("tokensPerSec")) r.bmB.tokensPerSec = static_cast<int>(s->number); if (auto* s = b->get("ttftMs")) r.bmB.ttftMs = static_cast<int>(s->number); }
		if (auto* s = src->get("verdict")) r.bmVerdict = s->asString();
		// F46 report: tokens{input,output,total}, cost, throughput.
		if (auto* t = src->get("tokens"); t && t->kind == JKind::Object) { if (auto* s = t->get("input")) r.repTokensIn = static_cast<int>(s->number); if (auto* s = t->get("output")) r.repTokensOut = static_cast<int>(s->number); if (auto* s = t->get("total")) r.repTokensTotal = static_cast<int>(s->number); }
		if (auto* c = src->get("cost"); c && c->kind == JKind::Object) { if (auto* s = c->get("free")) r.repCostFree = static_cast<int>(s->number); if (auto* s = c->get("localAI")) r.repCostLocalAI = s->asString(); }
		if (auto* th = src->get("throughput"); th && th->kind == JKind::Object) { if (auto* s = th->get("ttftMs")) r.repTtftMs = static_cast<int>(s->number); if (auto* s = th->get("tokensPerSec")) r.repTps = static_cast<int>(s->number); }
		// F45 endurance run: rung, status, freeVramMiB, requiredMiB.
		if (auto* s = src->get("rung")) r.erRung = static_cast<int>(s->number);
		if (auto* s = src->get("status")) r.erStatus = s->asString();
		if (auto* s = src->get("freeVramMiB")) r.erFreeVramMiB = static_cast<int>(s->number);
		if (auto* s = src->get("requiredMiB")) r.erRequiredMiB = static_cast<int>(s->number);
		// F47 release gate: ready, passedNodes, totalNodes.
		if (auto* b = src->get("ready")) r.rgReady = b->boolean;
		if (auto* n = src->get("passedNodes")) r.rgPassed = static_cast<int>(n->number);
		if (auto* n = src->get("totalNodes")) r.rgTotal = static_cast<int>(n->number);
		// F48 sarif: findings count.
		if (auto* n = src->get("findings")) r.sarifFindings = static_cast<int>(n->number);
		// F51 protocol negotiate: serverProtocols, selectedProtocol, compatible.
		if (auto* arr = src->get("serverProtocols"); arr && arr->kind == JKind::Array) for (auto& e : arr->arr) r.serverProtocols.push_back(static_cast<int>(e.number));
		if (auto* s = src->get("selectedProtocol")) r.selectedProtocol = static_cast<int>(s->number);
		if (auto* b = src->get("compatible")) r.protocolCompatible = b->boolean;
		// INTELLIGENCE & ANALYSIS: score, grade, signal, rows (k/v), details.
		if (auto* s = src->get("score")) r.score = static_cast<int>(s->number);
		if (auto* s = src->get("grade")) r.grade = s->asString();
		if (auto* s = src->get("signal")) r.signal = s->asString();
		if (auto* rows = src->get("rows"); rows && rows->kind == JKind::Array) {
			for (auto& e : rows->arr) {
				if (e.kind == JKind::Object) {
					std::string k, v;
					if (auto* x = e.get("k")) k = x->asString();
					if (auto* x = e.get("v")) v = x->asString();
					r.analysisKv.emplace_back(k, v);
				}
			}
		}
		if (auto* d = src->get("details"); d && d->kind == JKind::Array) for (auto& e : d->arr) r.details.push_back(e.asString());
	} catch (...) {}
        return r;
}

// 10.8 end-to-end trace: capture last requestId + a --trace toggle (emitted on stderr).
inline std::atomic<bool> g_trace{ false };
inline std::string g_lastRequestId;

// Dispatch a slash line to the bridge. bridgePath = path to project-os-bridge.mjs.
inline CmdResult dispatch(const std::string& bridgePath, const std::string& slashLine, int timeoutMs = 60000, std::atomic<bool>* cancelOverride = nullptr) {
	// F07: explicit process runner (CreateProcessW, no shell) — resolves node.exe once, passes argv exactly.
	static const std::wstring nodeExe = []() {
		// Resolve explicit override first.
		wchar_t buf[4096];
		GetEnvironmentVariableW(L"PROJECT_OS_NODE", buf, 4096);
		if (buf[0]) return std::wstring(buf);
		// Try to locate node.exe by probing common Windows install dirs (no shell).
		wchar_t pfBuf[4096];
		DWORD pfLen = GetEnvironmentVariableW(L"ProgramFiles", pfBuf, 4096);
		std::wstring pf = (pfLen && pfLen < 4096) ? std::wstring(pfBuf) : std::wstring(L"C:\\Program Files");
		std::wstring cand = pf + L"\\nodejs\\node.exe";
		if (GetFileAttributesW(cand.c_str()) != INVALID_FILE_ATTRIBUTES) return cand;
		// Last resort: rely on CreateProcessW search-path semantics.
		return std::wstring(L"node");
	}();

	pos::ProcessSpec spec;
	spec.executable = nodeExe;
	spec.timeoutMs = timeoutMs;
	spec.args = { std::wstring(bridgePath.begin(), bridgePath.end()), std::wstring(slashLine.begin(), slashLine.end()) };
	spec.captureStdout = true;
	spec.captureStderr = true;
	pos::ProcessResult pr = pos::runProcess(spec, cancelOverride);

	CmdResult r;
	r.raw = pr.out + pr.err;
	if (!pr.started) { r.ok = false; r.status = "BRIDGE_FAILURE"; r.message = "bridge not started: " + pr.osError; return r; }
	if (pr.timedOut) { r.ok = false; r.status = "TIMEOUT_OR_CANCELLED"; r.message = "bridge timed out"; return r; }
        CmdResult parsed = pos::parseCmdResult(r.raw);
        g_lastRequestId = parsed.requestId;
        if (g_trace.load() && !parsed.requestId.empty()) std::cerr << "[trace] requestId=" << parsed.requestId << "\n";
        return parsed;
}

// F51 helpers — pure, unit-testable. Precedence: flag > env > default.
inline std::string prefer(const std::string& flag, const std::string& env, const std::string& dflt) {
        if (!flag.empty()) return flag;
        if (!env.empty()) return env;
        return dflt;
}

// Redact bearer / sk- / api-key style secrets from a line (golden redaction).
inline std::string redactSecret(std::string s) {
        // Redact "Bearer <token>" (space-separated token up to next space/quote).
        {
                static const std::string pre = "Bearer ";
                size_t p = 0;
                while ((p = s.find(pre, p)) != std::string::npos) {
                        size_t start = p + pre.size();
                        size_t end = start;
                        while (end < s.size() && s[end] != ' ' && s[end] != '"' && s[end] != ';' && s[end] != ',' && s[end] != '\n' && s[end] != '\r') ++end;
                        if (end > start) s.replace(start, end - start, "***");
                        p = start + 3;
                }
        }
        // Redact "sk-..." occurrences (OpenAI/API style).
        {
                static const std::string pre = "sk-";
                size_t p = 0;
                while ((p = s.find(pre, p)) != std::string::npos) {
                        size_t start = p + pre.size();
                        size_t end = start;
                        while (end < s.size() && s[end] != ' ' && s[end] != '"' && s[end] != ';' && s[end] != ',' && s[end] != '\n' && s[end] != '\r') ++end;
                        size_t keep = std::min<size_t>(4, end - start);
                        std::string repl = s.substr(start, keep) + "***";
                        if (end > start) s.replace(start, end - start, repl);
                        p = start + repl.size();
                }
        }
        return s;
}

// Golden budget model (8.6): deterministic verdict from used tokens vs a daily budget.
// Ratios: < 0.5 OK, < 0.9 WARN, >= 0.9 BLOWN. Pure + unit-testable.
inline std::string budgetVerdict(long long usedTokens, long long dailyBudget) {
        if (dailyBudget <= 0) return "EXACT_ZERO";
        if (usedTokens <= 0) return "FREE";
        double ratio = static_cast<double>(usedTokens) / static_cast<double>(dailyBudget);
        if (ratio < 0.5) return "OK";
        if (ratio < 0.9) return "WARN";
        return "BLOWN";
}

// Phase 2 [2.8]: human-readable duration from milliseconds.
inline std::string fmtDuration(long long ms) {
        if (ms < 1000) return std::to_string(ms) + "ms";
        if (ms < 60000) { double s = ms / 1000.0; char b[32]; snprintf(b, sizeof(b), "%.1fs", s); return b; }
        long long m = ms / 60000; long long s = (ms % 60000) / 1000;
        if (m >= 60) { long long h = m / 60; m %= 60; char b[32]; snprintf(b, sizeof(b), "%lldh%02lldm", h, m); return b; }
        char b[32]; snprintf(b, sizeof(b), "%lldm%02llds", m, s); return b;
}

// Phase 2 [2.9]: human-readable byte size.
inline std::string fmtBytes(long long n) {
        if (n < 1024) return std::to_string(n) + " B";
        if (n < 1024LL * 1024) { char b[32]; snprintf(b, sizeof(b), "%.1fK", n / 1024.0); return b; }
        if (n < 1024LL * 1024 * 1024) { char b[32]; snprintf(b, sizeof(b), "%.1fM", n / (1024.0 * 1024.0)); return b; }
        char b[32]; snprintf(b, sizeof(b), "%.1fG", n / (1024.0 * 1024.0 * 1024.0)); return b;
}

// Phase 2 [2.6]: unicode sparkline (scaled to min..max), returns a string of block chars.
inline std::string sparkline(const std::vector<int>& values) {
        static const char* blocks = "\xE2\x96\x81\xE2\x96\x82\xE2\x96\x83\xE2\x96\x84\xE2\x96\x85\xE2\x96\x86\xE2\x96\x87\xE2\x96\x88"; // ▁▂▃▄▅▆▇█
        if (values.empty()) return "";
        int mn = values[0], mx = values[0];
        for (int v : values) { if (v < mn) mn = v; if (v > mx) mx = v; }
        std::string out;
        for (int v : values) {
                int idx;
                if (mx == mn) idx = 4;
                else idx = (int)((long long)(v - mn) * 7 / (mx - mn));
                if (idx < 0) idx = 0; if (idx > 7) idx = 7;
                out += std::string(blocks + idx * 3, 3);
        }
        return out;
}

// Phase 2 [2.7]: pad a field to a width (no truncation, safe for monospace tables).
inline std::string padRight(const std::string& s, size_t w) {
        if (s.size() >= w) return s;
        return s + std::string(w - s.size(), ' ');
}

// Phase 2 [2.7]: render an aligned table with per-column width (truncated with '…'). Pure + testable.
inline std::string renderTable(const std::vector<std::vector<std::string>>& rows, size_t maxColWidth = 40) {
        if (rows.empty()) return "";
        std::vector<size_t> w;
        for (const auto& r : rows) { if (w.size() < r.size()) w.resize(r.size(), 0); for (size_t i = 0; i < r.size(); ++i) w[i] = std::max(w[i], std::min(maxColWidth, r[i].size())); }
        std::string out;
        for (const auto& r : rows) {
                std::string line;
                for (size_t i = 0; i < w.size(); ++i) {
                        std::string c = (i < r.size() ? r[i] : "");
                        if (c.size() > w[i]) c = c.substr(0, w[i]) + "\xE2\x80\xA6";
                        else c += std::string(w[i] - c.size(), ' ');
                        if (i) line += "  ";
                        line += c;
                }
                out += line + "\n";
        }
        return out;
}

} // namespace pos
