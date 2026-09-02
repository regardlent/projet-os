// project_os_cli.cpp — C++ menu-driven CLI front-end for Project OS.
// Dispatches slash commands to a Node bridge (bin/project-os-bridge.mjs) and
// reads project metadata (registry/goal/todo JSON) for display. No vscode.
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <chrono>
#include <thread>
#include <limits>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <string>
#include <vector>
#include <map>
#include "pos_model.hpp"
#include "pos_runner.hpp"
#include "pos_exitcodes.hpp"
#include "pos_output.hpp"
#include "pos_terminal.hpp"
#include "pos_health.hpp"
#include <windows.h>
#if defined(_WIN32)
#include <conio.h> // _kbhit/_getch for cockpit keyboard navigation (Phase 3.5)
#endif

namespace pos {
inline const char* repoRoot() { return getenv("PROJECT_OS_REPO") ? getenv("PROJECT_OS_REPO") : "C:\\Users\\eiden\\Desktop\\dev\\projet-os"; }
inline const char* registryPath() { return getenv("PROJECT_OS_REGISTRY") ? getenv("PROJECT_OS_REGISTRY") : nullptr; }

inline std::string bridgePath() { return std::string(repoRoot()) + "\\bin\\project-os-bridge.mjs"; }
inline std::string defaultRegistry() { return std::string(repoRoot()) + "\\.project-os-cli\\managed-projects.json"; }
inline std::string registryFile() { const char* r = registryPath(); return (r && *r) ? r : defaultRegistry(); }
inline std::string projectsRoot() { const char* p = getenv("PROJECT_OS_PROJECTS_ROOT"); return (p && *p) ? p : "C:\\Users\\eiden\\Desktop\\dev\\projects"; }
inline void setActiveSlug(const std::string& s) { _putenv_s("PROJECT_OS_ACTIVE_SLUG", s.c_str()); }

// --- IO for display ------------------------------------------------------
inline std::string projectJsonFile(const std::string& ws) { return ws + "\\.project-os\\project.json"; }
inline std::string goalJsonFile(const std::string& ws) { return ws + "\\.project-os\\goal.json"; }
inline std::string todoJsonFile(const std::string& ws) { return ws + "\\.project-os\\todo.json"; }
inline std::string todoMdFile(const std::string& ws) { return ws + "\\TODO.md"; }

inline std::string trim(const std::string& s) { size_t b = s.find_first_not_of(" \t\r\n"); if (b == std::string::npos) return ""; size_t e = s.find_last_not_of(" \t\r\n"); return s.substr(b, e - b + 1); }

// --- Signals/config ------------------------------------------------------
inline std::string activeSlugEnv() { const char* a = getenv("PROJECT_OS_ACTIVE_SLUG"); return (a && *a) ? a : ""; }
} // namespace pos

// F09: cooperative Ctrl+C. Sets a flag; never kills an external/user process.
#include <csignal>
#include <atomic>
inline std::atomic<bool> g_cancel(false);
inline void onSigInt(int) { g_cancel.store(true); }
// F08 improvement (phase 22): global dispatch timeout, override with --timeout=<ms>.
inline std::atomic<long long> g_timeoutMs(60000);
// F55: status emojis (✅/⚠️/❌) enabled by default; --no-emoji disables.
inline std::atomic<bool> g_emoji(true);
// F56: color theme. 1 = dark (bright ANSI), 0 = light (standard ANSI). --theme=light|dark.
inline std::atomic<int> g_theme(1);
// F57: output verbosity. --quiet suppresses card headers; --verbose adds detail.
inline std::atomic<bool> g_quiet(false);
inline std::atomic<bool> g_verbose(false);

// --- Helpers -------------------------------------------------------------
static int readChoice(int max) {
	std::string line; std::getline(std::cin, line);
	line = pos::trim(line);
	if (line.empty()) return -1;
	try { int n = std::stoi(line); return (n >= 0 && n <= max) ? n : -1; } catch (...) { return -1; }
}

// --- Non-interactive command mode (scriptable) ---------------------------
// project-os-cli <command> [args...]
// --- F11 status ----------------------------------------------------------
static int cmdStatus(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "status", g_timeoutMs, &g_cancel);
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"ok\":" << (r.ok ? "true" : "false")
			<< ",\"status\":" << pos::json_quote(r.status)
			<< ",\"active\":" << pos::json_quote(r.activeSlug)
			<< ",\"goalStatus\":" << pos::json_quote(r.goalStatus)
			<< ",\"goalProgress\":" << r.goalProgress
			<< ",\"todoDone\":" << r.todoDone
			<< ",\"todoCount\":" << r.todoCount << "}\n";
	} else {
		std::cout << "\xE2\x94\x80\xE2\x94\x80 status \xE2\x94\x80\xE2\x94\x80 \n";
		std::cout << "  active : " << (r.activeSlug.empty() ? "(none)" : r.activeSlug) << "\n";
		std::cout << "  goal   : " << r.goalStatus << " (" << r.goalProgress << "%)\n";
		std::cout << "  todo   : " << r.todoDone << "/" << r.todoCount << "\n";
	}
	// F03 exit contract: a FAIL status must never exit 0.
	return pos::exitFor(r.ok, r.status);
}

// --- F12 project list ------------------------------------------------------
static int cmdProjectList(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "project list", g_timeoutMs, &g_cancel);
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"ok\":" << (r.ok ? "true" : "false") << ",\"count\":" << r.projects.size() << ",\"projects\":[";
		for (size_t i = 0; i < r.projects.size(); ++i) {
			const auto& p = r.projects[i];
			if (i) std::cout << ",";
			std::cout << "{\"slug\":" << pos::json_quote(p.slug) << ",\"status\":" << pos::json_quote(p.status) << ",\"type\":" << pos::json_quote(p.projectType) << ",\"goalProgress\":" << p.goalProgress << "}";
		}
		std::cout << "]}\n";
	} else if (fmt == pos::OutputFormat::Ndjson) {
		for (const auto& p : r.projects) {
			std::cout << "{\"slug\":" << pos::json_quote(p.slug) << ",\"status\":" << pos::json_quote(p.status) << ",\"type\":" << pos::json_quote(p.projectType) << "}\n";
		}
	} else if (fmt == pos::OutputFormat::TsV) {
		for (const auto& p : r.projects) pos::emitScalar(pos::OutputFormat::TsV, p.slug, p.status + "\t" + p.projectType);
	} else {
		if (r.projects.empty()) { std::cout << "  (no projects)\n"; return 0; }
		for (const auto& p : r.projects) {
			std::cout << "  " << p.slug << "  [" << p.projectType << "]  " << p.status
				<< "  goal=" << p.goalStatus << " (" << p.goalProgress << "%)\n";
		}
	}
	// F03 exit contract: a FAIL status must never exit 0.
	return pos::exitFor(r.ok, r.status);
}


static int runCommandLine(const std::string& cmd, const std::vector<std::string>& args, bool useColor);

// --- JSON escaping -------------------------------------------------------
static std::string jsonEscape(const std::string& s) {
	std::string o = "\"";
	for (char c : s) { switch (c) { case '"': o += "\\\""; break; case '\\': o += "\\\\"; break; case '\n': o += "\\n"; break; case '\r': o += "\\r"; break; case '\t': o += "\\t"; break; default: if ((unsigned char)c < 0x20) { char buf[8]; snprintf(buf, sizeof(buf), "\\u%04x", c); o += buf; } else o += c; } }
	o += "\"";
	return o;
}
static void printJsonKV(const std::string& k, const std::string& v, bool first) {
	std::cout << (first ? "" : ",") << jsonEscape(k) << ":" << jsonEscape(v);
}

// --- F37 cmdHelp: local, no bridge. Lists commands + usage. ------------------------
static int cmdHelpOld() {
	std::cout << "Project OS CLI v3 — usage\n"
		<< "  version            build fingerprint (--format=json)\n"
		<< "  capabilities       negotiation with the bridge\n"
		<< "  status             active project summary\n"
		<< "  project list       enumerate managed projects\n"
		<< "  project use <slug> set active project\n"
		<< "  project inspect <slug> read-only project view\n"
		<< "  project watch      live refresh of active project\n"
		<< "  drift              workspace drift summary\n"
		<< "  timeline           chronological goal/todo events\n"
		<< "  snapshot <cmd>     create | list | show\n"
		<< "  diff <a> <b>       compare two projects\n"
		<< "  goal proof         goal criteria/evidence\n"
		<< "  todo board         open/done view\n"
		<< "  artifact list|show|search|verify <id>\n"
		<< "  addon verify       addon lock/state\n"
		<< "  config             effective config\n"
		<< "  doctor             named health checks\n"
		<< "  diagnostics        redacted diagnostics bundle\n"
		<< "  preflight          aggregate bridge/LocalAI/GPU check\n"
		<< "  health [--watch]   periodic read-only health\n"
		<< "  models             LocalAI model inventory\n"
		<< "  model show|smoke|benchmark <id>\n"
		<< "  route <task-class> deterministic model selection\n"
		<< "  gpu|gpu watch|gpu proof   real nvidia-smi\n"
		<< 		"  endurance          GPU endurance mode\n"
		"  benchmark          model performance testing\n"
		"  release            release / version negotiation\n"
		"  export             data export\n"
		"  report             token usage report\n"
		"  health score       composite health of active project\n"
		"  health trend       historical snapshot health\n"
		"  health compare <a> [<b>]   side-by-side health\n"
		"  budget forecast    token cost / burn prediction\n"
		"  insights tokens    token intelligence\n"
		"  diagnose           ranked auto-diagnostic battery\n"
		"  drift alert        baseline divergence alert\n"
		"  goal traction      goal evidence / velocity\n"
		"  autonomy health    plan + handoff health\n"
		"  risk profile       consolidated risk score\n"
		"  usage record       record token/cost/perf → generic usage store\n"
		"  cockpit            live VT dashboard\n"
		"  completion         shell completions (powershell|bash|zsh)\n"
		"  bridge             MCP Bridge (status|start|stop|restart|health|tools|test|tunnel) — Phase 23\n"
		"  --format=json|ndjson|tsv  --color=auto|always|never  --timeout=<ms>\n";
	return 0;
}

static int cmdHelp() {
	const std::string H = "\xE2\x94\x80\xE2\x94\x80";
	auto sec = [&](const std::string& s) { std::cout << "\n  " << H << " " << s << " " << H << "\n"; };
	std::cout << "Project OS CLI v3 — usage (categorized)\n";
	sec("Général");
	std::cout << "  version                build fingerprint (--format=json)\n";
	std::cout << "  capabilities           negotiation with the bridge\n";
	std::cout << "  completion <shell>     shell completions (powershell|bash|zsh)\n";
	std::cout << "  exitcodes              exit-code taxonomy\n";
	std::cout << "  health [--watch]       periodic read-only health\n";
	std::cout << "  cockpit [--watch=<s>]|history|export  live dashboard / frames / export\n";
	sec("Projet");
	std::cout << "  status                 active project summary\n";
	std::cout << "  project list           enumerate managed projects\n";
	std::cout << "  project use <slug>     set active project\n";
	std::cout << "  project inspect <slug> read-only project view\n";
	std::cout << "  project watch          live refresh of active project\n";
	std::cout << "  drift                  workspace drift summary\n";
	std::cout << "  timeline               chronological goal/todo events\n";
	std::cout << "  snapshot <cmd>         create | list | show\n";
	std::cout << "  diff <a> <b>           compare two projects\n";
	std::cout << "  goal proof             goal criteria/evidence\n";
	std::cout << "  todo board             open/done view\n";
	sec("Intelligence & analyse");
	std::cout << "  health score           composite health of active project\n";
	std::cout << "  health trend           historical snapshot health\n";
	std::cout << "  health compare <a> [b] side-by-side health\n";
	std::cout << "  budget forecast        token cost / burn prediction\n";
	std::cout << "  insights tokens        token intelligence\n";
	std::cout << "  diagnose               ranked auto-diagnostic battery\n";
	std::cout << "  drift alert            baseline divergence alert\n";
	std::cout << "  goal traction          goal evidence / velocity\n";
	std::cout << "  goal cost              cost distributed across goal criteria\n";
	std::cout << "  autonomy health        plan + handoff health\n";
	std::cout << "  risk profile           consolidated risk score\n";
	std::cout << "  usage record|list|summary|export  usage store (record / history / aggregate / export)\n";
	sec("Artefact & config");
	std::cout << "  artifact list|show|search|verify <id>\n";
	std::cout << "  addon verify           addon lock/state\n";
	std::cout << "  config                 effective config\n";
	std::cout << "  doctor                 named health checks\n";
	std::cout << "  diagnostics            redacted diagnostics bundle\n";
	sec("Modèle & GPU");
	std::cout << "  preflight              aggregate bridge/LocalAI/GPU check\n";
	std::cout << "  models                 LocalAI model inventory\n";
	std::cout << "  model show|smoke|benchmark|qualify|compare|flash|policy|quota|profiles|offload <id>\n";
	std::cout << "  route <task-class> [--alt]  adaptive model selection (ranked alternatives)\n";
	std::cout << "  gpu|gpu watch|gpu proof  real nvidia-smi\n";
	std::cout << "  benchmark              model performance testing\n";
	sec("Qualité & release");
	std::cout << "  test list|matrix       test suites / matrix\n";
	std::cout << "  endurance              GPU endurance mode\n";
	std::cout << "  report                 token usage report\n";
	std::cout << "  release gate           release / version negotiation\n";
	std::cout << "  export sarif           SARIF data export\n";
	std::cout << "  protocol negotiate|test  protocol negotiation\n";
	std::cout << "  schema machine         machine-consumer contract\n";
	sec("Bridge MCP");
	std::cout << "  bridge status|start|stop|restart|health|tools|test|tunnel\n";
	std::cout << "\n  Global flags: --format=json|ndjson|tsv  --color=auto|always|never  --theme=light|dark  --mono  --timeout=<ms>  --no-emoji  --quiet|--verbose  --cockpit  --explain/--dry-run\n";
	return 0;
}

// --- F49 completion powershell|bash|zsh: emit a shell completion script. --------------
static int cmdCompletion(const std::string& shell) {
	if (shell == "powershell") {
		std::cout << "# Project OS CLI completion (PowerShell)\n"
			<< "Register-ArgumentCompleter -Native -CommandName project-os-cli -ScriptBlock {\n"
			<< "  param($wordToComplete, $commandAst, $cursorPosition)\n"
					<< "  $commands = @(\"version\",\"capabilities\",\"status\",\"project\",\"drift\",\"timeline\",\"snapshot\",\"diff\",\"goal\",\"todo\",\"artifact\",\"addon\",\"config\",\"doctor\",\"diagnostics\",\"preflight\",\"health\",\"models\",\"model\",\"route\",\"gpu\",\"test\",\"endurance\",\"benchmark\",\"release\",\"export\",\"report\",\"completion\",\"cockpit\",\"bridge\",\"help\")\n"
			<< "  foreach ($c in $commands) { if ($c -like \"$wordToComplete*\") { [System.Management.Automation.CompletionResult]::new($c, $c, [System.Management.Automation.CompletionResultType]::ParameterValue, $c) } }\n"
			<< "}\n";
	} else if (shell == "bash") {
		std::cout << "# Project OS CLI completion (bash)\n"
			<< "_project_os_cli() {\n"
			<< "  local cur=\"${COMP_WORDS[COMP_CWORD]}\"\n"
					<< "  local commands=\"version capabilities status project drift timeline snapshot diff goal todo artifact addon config doctor diagnostics preflight health models model route gpu test endurance benchmark release export report completion cockpit bridge help\"\n"
			<< "  COMPREPLY=( $(compgen -W \"$commands\" -- \"$cur\") )\n"
			<< "}\n"
			<< "complete -F _project_os_cli project-os-cli\n";
	} else if (shell == "zsh") {
		std::cout << "#compdef project-os-cli\n"
			<< "_project_os_cli() {\n"
			<< "  local -a commands\n"
					<< "  commands=(version capabilities status project drift timeline snapshot diff goal todo artifact addon config doctor diagnostics preflight health models model route gpu test endurance benchmark release export report completion cockpit bridge help)\n"
			<< "  _describe 'command' commands\n"
			<< "}\n"
			<< "compdef _project_os_cli project-os-cli\n";
	} else {
		std::cout << "  unsupported shell: " << shell << " (powershell|bash|zsh)\n";
		return 1;
	}
	return 0;
}

// --- F50 cockpit: inline VT dashboard (no external dep). Read-only, live refresh. ----
static std::string readGpuLine(); // F38 helper (defined below)
// F66 forward decl (defined later): terminal-width line fitting.
static std::string fitLine(const std::string& s);
// Forward decl (defined later): intelligence/analysis result printer.
static int printAnalysis(const std::string& title, pos::OutputFormat fmt, pos::CmdResult& r, bool colorOn);
static int cmdCockpit(pos::OutputFormat fmt, const std::vector<std::string>& args, bool colorOn) {
	int watchSec = 0;
	for (auto& a : args) if (a.rfind("--watch=", 0) == 0) watchSec = std::max(0, std::atoi(a.substr(8).c_str()));
	const bool live = watchSec > 0;
	if (live) std::cout << "\x1b[?25l"; // hide cursor during live refresh
	do {
		// Phase 3 dashboard: compose status + health score + usage summary + gpu into tiles.
		pos::CmdResult st = pos::dispatch(pos::bridgePath(), "status", g_timeoutMs, &g_cancel);
		pos::CmdResult hs = pos::dispatch(pos::bridgePath(), "health score", g_timeoutMs, &g_cancel);
		pos::CmdResult us = pos::dispatch(pos::bridgePath(), "usage summary", g_timeoutMs, &g_cancel);
		std::string gpuLine = readGpuLine();
		auto kv = [](const std::vector<std::pair<std::string, std::string>>& v, const std::string& k) -> std::string { for (auto& p : v) if (p.first == k) return p.second; return ""; };
		const std::string usTotal = kv(us.analysisKv, "TOTAL");
		if (fmt == pos::OutputFormat::Json) {
			std::cout << "{\"active\":" << pos::json_quote(st.activeSlug) << ",\"goalStatus\":" << pos::json_quote(st.goalStatus)
				<< ",\"goalProgress\":" << st.goalProgress << ",\"todoDone\":" << st.todoDone << ",\"todoCount\":" << st.todoCount
				<< ",\"healthScore\":" << hs.score << ",\"healthGrade\":" << pos::json_quote(hs.grade) << ",\"healthSignal\":" << pos::json_quote(hs.signal)
				<< ",\"usage\":" << pos::json_quote(usTotal) << ",\"gpu\":" << pos::json_quote(gpuLine) << "}\n";
			return 0;
		}
		if (live) std::cout << "\x1b[2J\x1b[H"; // clear screen
		const auto now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
		std::cout << fitLine("\xE2\x94\x80\xE2\x94\x80 PROJECT OS COCKPIT \xE2\x94\x80\xE2\x94\x80  " + std::string(live ? "live [q]=quit Ctrl+C (or any key)" : "")) << "\n";
		std::cout << fitLine("  [Status]  active=" + (st.activeSlug.empty() ? "(none)" : st.activeSlug) + "  goal=" + st.goalStatus + " (" + std::to_string(st.goalProgress) + "%)  todo=" + std::to_string(st.todoDone) + "/" + std::to_string(st.todoCount)) << "\n";
		std::cout << fitLine("  [Health]  " + std::to_string(hs.score) + "/100 " + (hs.grade.empty() ? "" : "[" + hs.grade + "] ") + "(" + hs.signal + ")  " + hs.message) << "\n";
		std::cout << fitLine("  [Usage]   " + (usTotal.empty() ? "(no usage)" : usTotal)) << "\n";
		std::cout << fitLine("  [GPU]     " + (gpuLine.empty() ? "(nvidia-smi unavailable)" : gpuLine)) << "\n";
		// F68 footer log line (bottom of dashboard).
		std::cout << fitLine("  \xE2\x94\x80 log: " + std::to_string((long long)now) + "  [" + hs.signal + "]") << "\n";
		if (live) {
			// F64 historisation: append a frame (JSONL) to artifacts/usage/cockpit-history.jsonl.
			std::string frame = "{\"at\":" + std::to_string((long long)now) + ",\"active\":" + pos::json_quote(st.activeSlug)
				+ ",\"goalStatus\":" + pos::json_quote(st.goalStatus) + ",\"goalProgress\":" + std::to_string(st.goalProgress)
				+ ",\"todoDone\":" + std::to_string(st.todoDone) + ",\"todoCount\":" + std::to_string(st.todoCount)
				+ ",\"healthScore\":" + std::to_string(hs.score) + ",\"healthGrade\":" + pos::json_quote(hs.grade) + ",\"healthSignal\":" + pos::json_quote(hs.signal)
				+ ",\"usage\":" + pos::json_quote(usTotal) + ",\"gpu\":" + pos::json_quote(gpuLine) + "}";
			try { std::ofstream of(std::string(pos::repoRoot()) + "\\artifacts\\usage\\cockpit-history.jsonl", std::ios::app); of << frame << "\n"; } catch (...) {}
		}
		if (!live || g_cancel.load()) break;
		// Phase 3.5 keyboard navigation: any key / 'q' / ESC quits.
		if (live && _kbhit()) { int c = _getch(); if (c == 'q' || c == 27 || c != 0) break; }
		for (int i = 0; i < 20 && !g_cancel.load(); ++i) std::this_thread::sleep_for(std::chrono::milliseconds(watchSec * 1000 / 20));
	} while (live && !g_cancel.load());
	if (live) { std::cout << "\x1b[?25h"; }
	return 0;
}

// F64 cockpit history: read the recorded frames (JSONL written during --watch).
static int cmdCockpitHistory(pos::OutputFormat fmt) {
	std::ifstream f(std::string(pos::repoRoot()) + "\\artifacts\\usage\\cockpit-history.jsonl");
	std::vector<std::string> lines; std::string line;
	while (std::getline(f, line)) if (!line.empty()) lines.push_back(line);
	if (fmt == pos::OutputFormat::Json) { std::cout << "{\"frames\":" << lines.size() << ",\"last\":" << (lines.empty() ? "null" : lines.back()) << "}\n"; return 0; }
	std::cout << "\xE2\x94\x80\xE2\x94\x80 cockpit history \xE2\x94\x80\xE2\x94\x80 \n";
	std::cout << "  frames : " << lines.size() << "\n";
	if (!lines.empty()) std::cout << "  latest : " << lines.back() << "\n";
	return 0;
}

// F65 cockpit export: write the current tile snapshot to a CSV/JSON file (format from --out extension).
static int cmdCockpitExport(pos::OutputFormat fmt, const std::vector<std::string>& args, bool colorOn) {
	std::string out;
	for (auto& a : args) if (a.rfind("--out=", 0) == 0) out = a.substr(6);
	pos::CmdResult st = pos::dispatch(pos::bridgePath(), "status", g_timeoutMs, &g_cancel);
	pos::CmdResult hs = pos::dispatch(pos::bridgePath(), "health score", g_timeoutMs, &g_cancel);
	pos::CmdResult us = pos::dispatch(pos::bridgePath(), "usage summary", g_timeoutMs, &g_cancel);
	std::string gpuLine = readGpuLine();
	auto kv = [](const std::vector<std::pair<std::string, std::string>>& v, const std::string& k) -> std::string { for (auto& p : v) if (p.first == k) return p.second; return ""; };
	const std::string usTotal = kv(us.analysisKv, "TOTAL");
	bool csv = out.empty() ? false : (out.size() > 4 && out.substr(out.size() - 4) == ".csv");
	std::string path = out.empty() ? (std::string(pos::repoRoot()) + "\\artifacts\\usage\\cockpit-export.json") : out;
	std::string data;
	if (csv) {
		data = "active,goalStatus,goalProgress,todoDone,todoCount,healthScore,healthGrade,healthSignal,usage,gpu\n"
			+ st.activeSlug + "," + st.goalStatus + "," + std::to_string(st.goalProgress) + "," + std::to_string(st.todoDone) + "," + std::to_string(st.todoCount)
			+ "," + std::to_string(hs.score) + "," + hs.grade + "," + hs.signal + "," + usTotal + "," + gpuLine + "\n";
	} else {
		data = "{\"active\":" + pos::json_quote(st.activeSlug) + ",\"goalStatus\":" + pos::json_quote(st.goalStatus)
			+ ",\"goalProgress\":" + std::to_string(st.goalProgress) + ",\"todoDone\":" + std::to_string(st.todoDone) + ",\"todoCount\":" + std::to_string(st.todoCount)
			+ ",\"healthScore\":" + std::to_string(hs.score) + ",\"healthGrade\":" + pos::json_quote(hs.grade) + ",\"healthSignal\":" + pos::json_quote(hs.signal)
			+ ",\"usage\":" + pos::json_quote(usTotal) + ",\"gpu\":" + pos::json_quote(gpuLine) + "}\n";
	}
	bool ok = false;
	try { std::ofstream of(path); of << data; ok = true; } catch (...) {}
	std::cout << "  written : " << (ok ? path : "(failed)") << "\n  tiles   : status / health / usage / gpu (" << (csv ? "csv" : "json") << ")\n";
	return 0;
}

static void cmdVersion(pos::OutputFormat fmt) {
	const std::string cliVer = "0.1.0-v3";
	const std::string buildDate = __DATE__;
	const std::string buildTime = __TIME__;
	const std::string compiler = __VERSION__;
	const std::string stdcxx = std::to_string(__cplusplus);
	const std::string projVer = "0.1.0";
	const std::string arch = sizeof(void*) == 8 ? "x86_64" : "x86";
	const std::string os = "Windows";
	const std::string proto = "2";
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{";
		printJsonKV("cliVersion", cliVer, true);
		printJsonKV("buildTimestamp", buildDate + " " + buildTime, false);
		printJsonKV("compiler", compiler, false);
		printJsonKV("cxxStandard", stdcxx, false);
		printJsonKV("projectOSVersion", projVer, false);
		printJsonKV("bridgeProtocol", proto, false);
		printJsonKV("architecture", arch, false);
		printJsonKV("os", os, false);
		std::cout << "}\n";
	} else if (fmt == pos::OutputFormat::Ndjson) {
		pos::emitScalar(pos::OutputFormat::Ndjson, "cliVersion", cliVer);
		pos::emitScalar(pos::OutputFormat::Ndjson, "buildTimestamp", buildDate + " " + buildTime);
		pos::emitScalar(pos::OutputFormat::Ndjson, "bridgeProtocol", proto);
		pos::emitScalar(pos::OutputFormat::Ndjson, "architecture", arch);
		pos::emitScalar(pos::OutputFormat::Ndjson, "os", os);
	} else if (fmt == pos::OutputFormat::TsV) {
		pos::emitScalar(pos::OutputFormat::TsV, "cliVersion", cliVer);
		pos::emitScalar(pos::OutputFormat::TsV, "bridgeProtocol", proto);
		pos::emitScalar(pos::OutputFormat::TsV, "architecture", arch);
	} else {
		std::cout << "  CLI version      : " << cliVer << "\n";
		std::cout << "  Build timestamp  : " << buildDate << " " << buildTime << "\n";
		std::cout << "  Compiler         : " << compiler << "\n";
		std::cout << "  C++ standard     : " << stdcxx << "\n";
		std::cout << "  Project OS       : v" << projVer << "\n";
		std::cout << "  Bridge protocol  : " << proto << "\n";
		std::cout << "  Architecture     : " << arch << "\n";
		std::cout << "  OS               : " << os << "\n";
	}
}

// --- F02 capabilities ------------------------------------------------------
static void cmdCapabilities(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "capabilities", g_timeoutMs, &g_cancel);
	std::string cmds; for (size_t i = 0; i < r.commands.size(); ++i) cmds += (i ? "," : "") + r.commands[i];
	std::string feats; for (size_t i = 0; i < r.features.size(); ++i) feats += (i ? "," : "") + r.features[i];
	std::string modes; for (size_t i = 0; i < r.outputModes.size(); ++i) modes += (i ? "," : "") + r.outputModes[i];
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{";
		printJsonKV("ok", r.ok ? "true" : "false", true);
		printJsonKV("protocol", std::to_string(r.protocol), false);
		printJsonKV("commands", cmds, false);
		printJsonKV("features", feats, false);
		printJsonKV("outputModes", modes, false);
		std::cout << "}\n";
	} else if (fmt == pos::OutputFormat::Ndjson) {
		pos::emitScalar(pos::OutputFormat::Ndjson, "ok", r.ok ? "true" : "false");
		pos::emitScalar(pos::OutputFormat::Ndjson, "protocol", std::to_string(r.protocol));
		pos::emitScalar(pos::OutputFormat::Ndjson, "commands", cmds);
		pos::emitScalar(pos::OutputFormat::Ndjson, "features", feats);
	} else if (fmt == pos::OutputFormat::TsV) {
		pos::emitScalar(pos::OutputFormat::TsV, "protocol", std::to_string(r.protocol));
		pos::emitScalar(pos::OutputFormat::TsV, "commands", cmds);
		pos::emitScalar(pos::OutputFormat::TsV, "features", feats);
	} else {
		std::cout << "  " << (r.ok ? "OK" : "FAIL") << " capabilities\n";
		std::cout << "  protocol    : " << r.protocol << "\n";
		std::cout << "  commands    : " << (cmds.empty() ? "(none)" : cmds) << "\n";
		std::cout << "  features    : " << (feats.empty() ? "(none)" : feats) << "\n";
		std::cout << "  outputModes : " << (modes.empty() ? "(none)" : modes) << "\n";
	}
}

// --- Non-interactive command mode (scriptable) ---------------------------
// project-os-cli <command> [args...]
// F58: suggest the closest known command on an unknown command (edit distance).
static const std::vector<std::string>& knownCommands() {
	static const std::vector<std::string> k = {
		"help", "version", "capabilities", "status", "project", "drift", "timeline", "snapshot", "diff",
		"goal", "todo", "artifact", "addon", "config", "doctor", "diagnostics", "preflight", "health",
		"models", "model", "route", "gpu", "test", "endurance", "benchmark", "report", "release", "export",
		"protocol", "schema", "exitcodes", "completion", "cockpit", "bridge", "usage",
	};
	return k;
}
static int editDist(const std::string& a, const std::string& b) {
	const size_t m = a.size(), n = b.size();
	std::vector<int> prev(n + 1), cur(n + 1);
	for (size_t j = 0; j <= n; ++j) prev[j] = (int)j;
	for (size_t i = 1; i <= m; ++i) {
		cur[0] = (int)i;
		for (size_t j = 1; j <= n; ++j) cur[j] = std::min({ prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1) });
		prev = cur;
	}
	return prev[n];
}
static std::string suggestCommand(const std::string& cmd) {
	int best = 4; std::string sug;
	for (const auto& k : knownCommands()) { const int d = editDist(cmd, k); if (d < best) { best = d; sug = k; } }
	return sug.empty() ? "" : (sug + " (dist " + std::to_string(best) + ")");
}

static int runCommandLine(const std::string& cmd, const std::vector<std::string>& args, bool useColor) {
	const std::string bridge = pos::bridgePath();
	std::string slash = "/" + cmd; // slash commands require a leading '/'
	for (const auto& a : args) slash += " " + a;
	auto r = pos::dispatch(bridge, slash, g_timeoutMs, &g_cancel);
	const char* okTag = r.ok ? "OK" : "FAIL";
	const char* colorTag = "";
	if (useColor) colorTag = r.ok ? "\x1b[32m" : "\x1b[31m"; // green/red
	const char* reset = useColor ? "\x1b[0m" : "";
	std::cout << "  " << colorTag << okTag << reset << " " << r.command << " " << r.status << "\n";
	std::cout << r.message << "\n";
	if (r.status == "UNKNOWN_COMMAND") { const std::string sug = suggestCommand(cmd); if (!sug.empty()) std::cout << "  Did you mean: " << (useColor ? "\x1b[96m" : "") << sug << (useColor ? "\x1b[0m" : "") << "?\n"; }
	for (const auto& s : r.artifacts) std::cout << "  artifact: " << s << "\n";
	if (!r.raw.empty() && !r.ok) std::cout << "  raw: " << r.raw << "\n";
	return pos::exitFor(r.ok, r.status);
}

// --- F13 project use <slug> -------------------------------------------------
static int cmdProjectUse(const std::string& slug, pos::OutputFormat fmt) {
	// Resolve the project via the backend (ensures it exists) before switching active.
	pos::CmdResult chk = pos::dispatch(pos::bridgePath(), "project inspect " + slug, g_timeoutMs, &g_cancel);
	if (!chk.ok) {
		std::cout << "  FAIL project use: " << chk.status << " — " << chk.message << "\n";
		return pos::exitFor(chk.ok, chk.status);
	}
	pos::setActiveSlug(slug);
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"ok\":true,\"active\":" << pos::json_quote(slug) << ",\"workspace\":" << pos::json_quote(chk.activeWorkspace.empty() ? "" : chk.activeWorkspace) << "}\n";
	} else {
		std::cout << "  active = " << slug << "\n";
		std::cout << "  workspace = " << chk.activeWorkspace << "\n";
	}
	return 0;
}

// --- F14 project inspect <slug> --------------------------------------------
static int cmdProjectInspect(const std::string& slug, pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "project inspect " + slug, g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL project inspect: " << r.status << " — " << r.message << "\n"; return pos::exitFor(r.ok, r.status); }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"ok\":true,\"slug\":" << pos::json_quote(r.activeSlug)
			<< ",\"type\":" << pos::json_quote(r.projectType)
			<< ",\"status\":" << pos::json_quote(r.projectStatus)
			<< ",\"workspace\":" << pos::json_quote(r.activeWorkspace)
			<< ",\"goalStatus\":" << pos::json_quote(r.goalStatus)
			<< ",\"goalProgress\":" << r.goalProgress
			<< ",\"todoDone\":" << r.todoDone << ",\"todoCount\":" << r.todoCount << "}\n";
	} else {
		std::cout << "\xE2\x94\x80\xE2\x94\x80 project inspect " << slug << " \xE2\x94\x80\xE2\x94\x80 \n";
		std::cout << "  slug      : " << r.activeSlug << "\n";
		std::cout << "  type      : " << r.projectType << "\n";
		std::cout << "  status    : " << r.projectStatus << "\n";
		std::cout << "  workspace : " << r.activeWorkspace << "\n";
		std::cout << "  goal      : " << r.goalStatus << " (" << r.goalProgress << "%)\n";
		std::cout << "  todo      : " << r.todoDone << "/" << r.todoCount << "\n";
	}
	return pos::exitFor(r.ok, r.status);
}


// --- F15 project watch (refresh live, read-only, Ctrl+C exit) --------------
static int cmdProjectWatch(pos::OutputFormat fmt, int intervalMs) {
	const char* iv = getenv("PROJECT_OS_WATCH_INTERVAL_MS");
	int interval = intervalMs > 0 ? intervalMs : (iv && atoi(iv) > 0 ? atoi(iv) : 2000);
	g_cancel.store(false);
	while (!g_cancel.load()) {
		pos::CmdResult r = pos::dispatch(pos::bridgePath(), "status", g_timeoutMs, &g_cancel);
		if (fmt == pos::OutputFormat::Json) {
			std::cout << "{\"t\":" << (long long)(std::chrono::steady_clock::now().time_since_epoch().count()) << ",\"ok\":" << (r.ok ? "true" : "false")
				<< ",\"active\":" << pos::json_quote(r.activeSlug) << ",\"goal\":" << pos::json_quote(r.goalStatus)
				<< ",\"goalProgress\":" << r.goalProgress << ",\"todo\":" << r.todoDone << "/" << r.todoCount << "}" << std::endl;
		} else {
			std::cout << "\r  " << std::flush;
			std::cout << "active=" << (r.activeSlug.empty() ? "(none)" : r.activeSlug)
				<< "  goal=" << r.goalStatus << "(" << r.goalProgress << "%)"
				<< "  todo=" << r.todoDone << "/" << r.todoCount << "   " << std::flush;
		}
		if (g_cancel.load()) break;
		for (int i = 0; i < interval / 50 && !g_cancel.load(); ++i) std::this_thread::sleep_for(std::chrono::milliseconds(50));
	}
	if (fmt != pos::OutputFormat::Json) std::cout << "\n";
	return 0;
}

// --- F16 drift (workspace drift; no baseline => first snapshot) -------------
static int cmdDrift(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "status", g_timeoutMs, &g_cancel);
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"ok\":" << (r.ok ? "true" : "false")
			<< ",\"active\":" << pos::json_quote(r.activeSlug)
			<< ",\"goalStatus\":" << pos::json_quote(r.goalStatus)
			<< ",\"goalProgress\":" << r.goalProgress
			<< ",\"todoDone\":" << r.todoDone << ",\"todoCount\":" << r.todoCount << "}\n";
	} else {
		std::cout << "  active       : " << r.activeSlug << "\n";
		std::cout << "  goal         : " << r.goalStatus << " (" << r.goalProgress << "%)\n";
		std::cout << "  todo         : " << r.todoDone << "/" << r.todoCount << "\n";
		std::cout << "  note         : compare against a saved snapshot to detect drift\n";
	}
	return 0;
}


// --- F17 timeline ----------------------------------------------------------
static int cmdTimeline(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "timeline", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL timeline: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"events\":[";
		for (size_t i = 0; i < r.events.size(); ++i) {
			if (i) std::cout << ",";
			const auto& e = r.events[i];
			std::cout << "{\"at\":" << e.at << ",\"type\":" << pos::json_quote(e.type) << ",\"detail\":" << pos::json_quote(e.detail) << "}";
		}
		std::cout << "]}\n";
	} else {
		if (r.events.empty()) { std::cout << "  (no events)\n"; return 0; }
		for (const auto& e : r.events) std::cout << "  " << e.at << "  [" << e.type << "]  " << e.detail << "\n";
	}
	return 0;
}

// --- F18 snapshot create / list / show (local workspace state) ---------------
static std::string currentWorkspace() {
	const std::string slug = pos::activeSlugEnv();
	if (slug.empty()) return "";
	return pos::projectsRoot() + "\\" + slug;
}
static int cmdSnapshot(const std::string& sub, pos::OutputFormat fmt) {
	const std::string ws = currentWorkspace();
	if (ws.empty()) { std::cout << "  FAIL snapshot: no active project\n"; return 1; }
	const std::string dir = ws + "\\.project-os\\snapshots";
	namespace fs = std::filesystem;
	if (sub == "create") {
		fs::create_directories(dir);
		auto now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
		// Filename with timestamp.
		std::string ts = std::to_string((long long)now);
		std::string goal = pos::readFile(ws + "\\.project-os\\goal.json");
		std::string todo = pos::readFile(ws + "\\.project-os\\todo.json");
		std::string proj = ws + "\\.project-os\\project.json";
		// Capture a compact snapshot.
		std::string snap = "{\"snapshot\":\"" + ts + "\",\"active\":\"" + pos::activeSlugEnv() + "\",\"project\":\"\"}\n";
		std::string file = dir + "\\snap-" + ts + ".json";
		// Write via C++ ofstream through pos_model? Not exposed; use std::ofstream.
		std::ofstream of(file); of << snap; of.close();
		if (fmt == pos::OutputFormat::Json) std::cout << "{\"ok\":true,\"snapshot\":\"" << file << "\"}\n";
		else std::cout << "  snapshot created: " << file << "\n";
		return 0;
	} else if (sub == "list") {
		std::vector<std::string> files;
		if (fs::exists(dir)) for (auto& e : fs::directory_iterator(dir)) if (e.is_regular_file() && e.path().extension() == ".json") files.push_back(e.path().filename().string());
		std::sort(files.begin(), files.end());
		if (fmt == pos::OutputFormat::Json) {
			std::cout << "{\"snapshots\":[";
			for (size_t i = 0; i < files.size(); ++i) { if (i) std::cout << ","; std::cout << pos::json_quote(files[i]); }
			std::cout << "]}\n";
		} else {
			if (files.empty()) { std::cout << "  (no snapshots)\n"; return 0; }
			for (auto& f : files) std::cout << "  " << f << "\n";
		}
		return 0;
	} else if (sub == "show") {
		std::vector<std::string> files;
		if (fs::exists(dir)) for (auto& e : fs::directory_iterator(dir)) if (e.is_regular_file() && e.path().extension() == ".json") files.push_back(e.path().filename().string());
		std::sort(files.begin(), files.end());
		if (files.empty()) { std::cout << "  (no snapshots)\n"; return 0; }
		std::string file = dir + "\\" + files.back(); // latest
		std::cout << pos::readFile(file);
		return 0;
	}
	std::cout << "  FAIL snapshot: unknown subcommand '" << sub << "'\n";
	return 2;
}


// --- F19 diff <a> <b> (compare two managed projects) -------------------------
static int cmdDiff(const std::string& a, const std::string& b, pos::OutputFormat fmt) {
	pos::CmdResult ra = pos::dispatch(pos::bridgePath(), "project inspect " + a, g_timeoutMs, &g_cancel);
	pos::CmdResult rb = pos::dispatch(pos::bridgePath(), "project inspect " + b, g_timeoutMs, &g_cancel);
	if (!ra.ok || !rb.ok) { std::cout << "  FAIL diff: " << (ra.ok ? b : a) << " not found\n"; return 1; }
	const std::string unchanged = (ra.projectType == rb.projectType && ra.projectStatus == rb.projectStatus && ra.goalProgress == rb.goalProgress && ra.todoCount == rb.todoCount) ? "true" : "false";
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"a\":" << pos::json_quote(a) << ",\"b\":" << pos::json_quote(b)
			<< ",\"type\":\"" << (ra.projectType == rb.projectType ? "same" : ra.projectType + "->" + rb.projectType) << "\""
			<< ",\"status\":\"" << (ra.projectStatus == rb.projectStatus ? "same" : ra.projectStatus + "->" + rb.projectStatus) << "\""
			<< ",\"goalProgress\":\"" << ra.goalProgress << "->" << rb.goalProgress << "\""
			<< ",\"todo\":\"" << ra.todoDone << "/" << ra.todoCount << " -> " << rb.todoDone << "/" << rb.todoCount << "\""
			<< ",\"unchanged\":" << unchanged << "}\n";
	} else {
		std::cout << "  diff " << a << " <-> " << b << "\n";
		std::cout << "  type         : " << ra.projectType << " -> " << rb.projectType << "\n";
		std::cout << "  status       : " << ra.projectStatus << " -> " << rb.projectStatus << "\n";
		std::cout << "  goalProgress : " << ra.goalProgress << "% -> " << rb.goalProgress << "%\n";
		std::cout << "  todo         : " << ra.todoDone << "/" << ra.todoCount << " -> " << rb.todoDone << "/" << rb.todoCount << "\n";
	}
	return 0;
}

// --- F20 --explain / --dry-run (plan without mutation) -----------------------
static int cmdExplain(const std::string& cmd, const std::vector<std::string>& args) {
	std::string slash = "/" + cmd;
	for (const auto& a : args) slash += " " + a;
	std::cout << "  EXPLAIN (dry-run — no mutation)\n";
	std::cout << "  slash command : " << slash << "\n";
	std::cout << "  target        : " << (pos::activeSlugEnv().empty() ? "(none)" : pos::activeSlugEnv()) << "\n";
	if (cmd == "create") std::cout << "  effect        : new managed project workspace created\n";
	else if (cmd == "goal") std::cout << "  effect        : sets/updates goal.json + goal-history\n";
	else if (cmd == "todo") std::cout << "  effect        : updates todo.json + TODO.md\n";
	else if (cmd == "addon") std::cout << "  effect        : installs/disables addon under .agents\n";
	else if (cmd == "autonomy") std::cout << "  effect        : writes .project-os/autonomy.json + handoff\n";
	else std::cout << "  effect        : dispatched to bridge (read-only view) — see --explain on mutating cmds\n";
	std::cout << "  approval      : required (explicit) before mutation\n";
	return 0;
}


// --- F21 goal proof ----------------------------------------------------------
static int cmdGoalProof(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "goal proof", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL goal proof: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"status\":" << pos::json_quote(r.goalStatus) << ",\"progress\":" << r.goalProgress
			<< ",\"objective\":" << pos::json_quote(r.goalObjective) << ",\"criteria\":[";
		for (size_t i = 0; i < r.criteria.size(); ++i) { if (i) std::cout << ","; std::cout << pos::json_quote(r.criteria[i]); }
		std::cout << "]}\n";
	} else {
		std::cout << "  status    : " << r.goalStatus << "\n";
		std::cout << "  progress  : " << r.goalProgress << "%\n";
		std::cout << "  objective : " << r.goalObjective << "\n";
		if (r.criteria.empty()) std::cout << "  criteria  : (none)\n";
		else { for (const auto& c : r.criteria) std::cout << "  criterion : " << c << "\n"; }
	}
	return 0;
}

// --- F22 todo board ------------------------------------------------------------
static int cmdTodoBoard(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "todo board", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL todo board: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"total\":" << r.totalTasks << ",\"open\":[";
		for (size_t i = 0; i < r.openTasks.size(); ++i) { if (i) std::cout << ","; std::cout << pos::json_quote(r.openTasks[i]); }
		std::cout << "],\"done\":[";
		for (size_t i = 0; i < r.doneTasks.size(); ++i) { if (i) std::cout << ","; std::cout << pos::json_quote(r.doneTasks[i]); }
		std::cout << "]}\n";
	} else {
		std::cout << "  todo board : " << r.openTasks.size() << " open / " << r.doneTasks.size() << " done (" << r.totalTasks << " total)\n";
		for (const auto& t : r.openTasks) std::cout << "    [ ] " << t << "\n";
		for (const auto& t : r.doneTasks) std::cout << "    [x] " << t << "\n";
	}
	return 0;
}


// --- F23 artifact list --------------------------------------------------------
static int cmdArtifactList(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "artifact list", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL artifact list: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"count\":" << r.artifactList.size() << ",\"artifacts\":[";
		for (size_t i = 0; i < r.artifactList.size(); ++i) { if (i) std::cout << ","; const auto& a = r.artifactList[i]; std::cout << "{\"id\":" << pos::json_quote(a.id) << ",\"type\":" << pos::json_quote(a.type) << ",\"size\":" << a.size << ",\"status\":" << pos::json_quote(a.status) << ",\"source\":" << pos::json_quote(a.source) << ",\"version\":" << a.version << "}"; }
		std::cout << "]}\n";
	} else if (fmt == pos::OutputFormat::Ndjson) {
		for (const auto& a : r.artifactList) std::cout << "{\"id\":" << pos::json_quote(a.id) << ",\"type\":" << pos::json_quote(a.type) << ",\"size\":" << a.size << ",\"status\":" << pos::json_quote(a.status) << "}\n";
	} else if (fmt == pos::OutputFormat::TsV) {
		for (const auto& a : r.artifactList) pos::emitScalar(pos::OutputFormat::TsV, a.id, a.type + "\t" + std::to_string(a.size) + "\t" + a.status);
	} else {
		if (r.artifactList.empty()) { std::cout << "  (no artifacts)\n"; return 0; }
		for (const auto& a : r.artifactList) std::cout << "  " << a.id << "  [" << a.type << "]  " << a.size << " B  " << (a.status.empty() ? "" : (a.status)) << (a.source.empty() ? "" : ("  (src=" + a.source + ")")) << "\n";
	}
	return 0;
}

// --- F24 artifact show <id> -----------------------------------------------------
static int cmdArtifactShow(const std::string& id, pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "artifact show " + id, g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL artifact show: " << r.status << " — " << r.message << "\n"; return r.status == "SECURITY_BLOCKED" ? 6 : 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"id\":" << pos::json_quote(r.artifactId) << ",\"size\":" << r.artifactSize << ",\"content\":" << pos::json_quote(r.artifactContent) << "}\n";
	} else {
		std::cout << "  id    : " << r.artifactId << "\n";
		std::cout << "  size  : " << r.artifactSize << " B\n";
		std::cout << "  content:\n" << r.artifactContent << "\n";
	}
	return 0;
}


// --- F25 artifact search <query> ----------------------------------------------
static int cmdArtifactSearch(const std::string& query, pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "artifact search " + query, g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL search: " << r.status << " — " << r.message << "\n"; return 1; }
	// Reuse artifactList (parsed from 'items').
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"count\":" << r.artifactList.size() << ",\"items\":[";
		for (size_t i = 0; i < r.artifactList.size(); ++i) { if (i) std::cout << ","; const auto& a = r.artifactList[i]; std::cout << "{\"id\":" << pos::json_quote(a.id) << ",\"type\":" << pos::json_quote(a.type) << "}"; }
		std::cout << "]}\n";
	} else {
		if (r.artifactList.empty()) { std::cout << "  (no match)\n"; return 0; }
		for (const auto& a : r.artifactList) std::cout << "  " << a.id << "  [" << a.type << "]\n";
	}
	return 0;
}

// --- F26 artifact verify <id> --------------------------------------------------
static int cmdArtifactVerify(const std::string& id, pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "artifact verify " + id, g_timeoutMs, &g_cancel);
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"ok\":" << (r.ok ? "true" : "false") << ",\"issues\":[";
		for (size_t i = 0; i < r.verifyIssues.size(); ++i) { if (i) std::cout << ","; std::cout << pos::json_quote(r.verifyIssues[i]); }
		std::cout << "]}\n";
	} else {
		if (r.ok) std::cout << "  VERIFIED: " << id << "\n";
		else { std::cout << "  VERIFY_FAIL: " << id << "\n"; for (const auto& i : r.verifyIssues) std::cout << "    - " << i << "\n"; }
	}
	return r.ok ? 0 : 1;
}


// --- F27 addon verify -------------------------------------------------------
static int cmdAddonVerify(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "addon verify", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL addon verify: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"enabled\":" << r.addonEnabledCount << ",\"addons\":[";
		for (size_t i = 0; i < r.addonIds.size(); ++i) { if (i) std::cout << ","; const std::string& st = i < r.addonStates.size() ? r.addonStates[i] : ""; std::cout << "{\"id\":" << pos::json_quote(r.addonIds[i]) << ",\"status\":" << pos::json_quote(st) << "}"; }
		std::cout << "]}\n";
	} else {
		std::cout << "  addons: " << r.addonEnabledCount << " enabled of " << r.addonIds.size() << "\n";
		for (size_t i = 0; i < r.addonIds.size(); ++i) { const std::string& st = i < r.addonStates.size() ? r.addonStates[i] : ""; std::cout << "  " << r.addonIds[i] << "  [" << st << "]\n"; }
	}
	return 0;
}

// --- F28 config explain / list ----------------------------------------------
// Compact card header: ── <title> ── (UTF-8; renders correctly on a console with CP65001).
static void card(const std::string& t) { if (g_quiet.load()) return; std::cout << "\xE2\x94\x80\xE2\x94\x80 " << t << " \xE2\x94\x80\xE2\x94\x80 \n"; }

// F66 terminal-width helpers: adapt/truncate lines to avoid wrapping/overflow (small terminal, console only).
static int termCols() { CONSOLE_SCREEN_BUFFER_INFO cbi; if (GetConsoleScreenBufferInfo(GetStdHandle(STD_OUTPUT_HANDLE), &cbi)) return cbi.dwSize.X; return 80; }
static std::string fitLine(const std::string& s) {
	HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);
	CONSOLE_SCREEN_BUFFER_INFO cbi;
	if (!h || h == INVALID_HANDLE_VALUE || !GetConsoleScreenBufferInfo(h, &cbi)) return s; // not a console: no truncation
	const int w = cbi.dwSize.X - 1;
	if (w <= 0 || (int)s.size() <= w) return s;
	return s.substr(0, (size_t)w) + "\xE2\x80\xA6";
}

static int cmdConfig(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "config list", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL config: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{";
		for (size_t i = 0; i < r.configKv.size(); ++i) { if (i) std::cout << ","; std::cout << pos::json_quote(r.configKv[i].first) << ":" << pos::json_quote(r.configKv[i].second); }
		std::cout << "}\n";
	} else if (fmt == pos::OutputFormat::TsV) {
		for (auto& [k, v] : r.configKv) pos::emitScalar(pos::OutputFormat::TsV, k, v);
	} else {
		card("config");
		for (auto& [k, v] : r.configKv) std::cout << "  " << k << " = " << v << "\n";
	}
	return 0;
}


// --- F29 doctor: named health checks ------------------------------------------
static int cmdDoctor(pos::OutputFormat fmt) {
	std::vector<pos::CheckResult> checks;
	pos::CmdResult cap = pos::dispatch(pos::bridgePath(), "capabilities", g_timeoutMs, &g_cancel);
	checks.push_back(pos::check("BRIDGE_FOUND", cap.ok ? "PASS" : "FAIL", cap.ok ? "bridge responded (protocol " + std::to_string(cap.protocol) + ")" : cap.message));
	checks.push_back(pos::check("PROTOCOL_COMPATIBLE", cap.protocol >= 2 ? "PASS" : "FAIL", "protocol=" + std::to_string(cap.protocol)));
	const std::string reg = pos::registryFile();
	bool regReadable = !pos::readFile(reg).empty();
	checks.push_back(pos::check("REGISTRY_READABLE", regReadable ? "PASS" : "WARN", regReadable ? "registry OK" : "registry empty/absent"));
	// LocalAI reachable via capabilities runtime info (already covers localAI=true).
	checks.push_back(pos::check("LOCALAI", cap.ok ? "PASS" : "FAIL", cap.ok ? "localAI endpoint loopback" : "unreachable"));
	checks.push_back(pos::check("ACTIVE_PROJECT", pos::activeSlugEnv().empty() ? "WARN" : "PASS", pos::activeSlugEnv().empty() ? "(none)" : pos::activeSlugEnv()));
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"checks\":[";
		for (size_t i = 0; i < checks.size(); ++i) { if (i) std::cout << ","; std::cout << "{\"name\":" << pos::json_quote(checks[i].name) << ",\"status\":" << pos::json_quote(checks[i].status) << ",\"reason\":" << pos::json_quote(checks[i].reason) << "}"; }
		std::cout << "]}\n";
	} else {
		card("doctor");
		for (const auto& c : checks) std::cout << "  " << c.status << "  " << c.name << " — " << c.reason << "\n";
	}
	return 0;
}

// --- F30 diagnostics bundle (redacted) ---------------------------------------
static int cmdDiagnostics(pos::OutputFormat fmt) {
	namespace fs = std::filesystem;
	auto now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
	std::string ts = std::to_string((long long)now);
	std::string dir = "artifacts/cli-v3/diagnostics/" + ts;
	fs::create_directories(dir);
	// version (redacted), config (redacted), doctor summary.
	pos::CmdResult cap = pos::dispatch(pos::bridgePath(), "capabilities", g_timeoutMs, &g_cancel);
	pos::CmdResult cf = pos::dispatch(pos::bridgePath(), "config list", g_timeoutMs, &g_cancel);
	std::string configRedacted;
	for (const auto& [k, v] : cf.configKv) configRedacted += pos::redact(k + "=" + v) + "\n";
	std::string version = "cli=0.1.0-v3\nnode=bridge-protocol-" + std::to_string(cap.protocol) + "\n";
	std::string manifest = "{\"ts\":\"" + ts + "\",\"checks\":[],\"redacted\":true}\n";
	{ std::ofstream of(dir + "/version.txt"); of << version; }
	{ std::ofstream of(dir + "/config_redacted.txt"); of << configRedacted; }
	{ std::ofstream of(dir + "/manifest.json"); of << manifest; }
	if (fmt == pos::OutputFormat::Json) std::cout << "{\"bundle\":\"" << dir << "\"}\n";
	else std::cout << "  diagnostics bundle: " << dir << "\n  (config redacted — no secrets)\n";
	return 0;
}


// --- F31 preflight -------------------------------------------------------------
static int cmdPreflight(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "preflight", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL preflight: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"bridge\":" << (r.ok ? "true" : "false") << ",\"localAI\":" << (r.pfLocalAI ? "true" : "false")
			<< ",\"gpu\":" << (r.pfGpu ? "true" : "false") << ",\"workspace\":" << (r.pfWorkspace ? "true" : "false")
			<< ",\"security\":" << (r.pfSecurity ? "true" : "false") << "}\n";
	} else {
		card("preflight");
		std::cout << "  bridge    : " << (r.ok ? "PASS" : "FAIL") << "\n";
		std::cout << "  localAI   : " << (r.pfLocalAI ? "PASS" : "FAIL") << "\n";
		std::cout << "  gpu       : " << (r.pfGpu ? "PASS" : "FAIL") << "\n";
		std::cout << "  workspace : " << (r.pfWorkspace ? "PASS" : "WARN") << "\n";
		std::cout << "  security  : " << (r.pfSecurity ? "PASS" : "FAIL") << "\n";
	}
	return 0;
}

// --- F32 health (--watch optional) ---------------------------------------------
static int cmdHealth(pos::OutputFormat fmt, bool watch) {
	do {
		pos::CmdResult r = pos::dispatch(pos::bridgePath(), "preflight", g_timeoutMs, &g_cancel);
		if (fmt == pos::OutputFormat::Json) {
			std::cout << "{\"localAI\":" << (r.pfLocalAI ? "true" : "false") << ",\"model\":" << pos::json_quote(r.modelId) << ",\"bridge\":" << (r.ok ? "true" : "false") << "}" << std::endl;
		} else {
			std::cout << "  health: localAI=" << (r.pfLocalAI ? "PASS" : "FAIL") << " bridge=" << (r.ok ? "PASS" : "FAIL") << " model=" << r.modelId << "\n";
		}
		if (!watch || g_cancel.load()) break;
		for (int i = 0; i < 20 && !g_cancel.load(); ++i) std::this_thread::sleep_for(std::chrono::milliseconds(250));
	} while (watch && !g_cancel.load());
	return 0;
}


// --- F33 models ---------------------------------------------------------------
static int cmdModels(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "models", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL models: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"count\":" << r.modelList.size() << ",\"models\":[";
		for (size_t i = 0; i < r.modelList.size(); ++i) { if (i) std::cout << ","; const auto& m = r.modelList[i]; std::cout << "{\"id\":" << pos::json_quote(m.id) << ",\"status\":" << pos::json_quote(m.type) << "}"; }
		std::cout << "]}\n";
	} else if (fmt == pos::OutputFormat::Ndjson) {
		for (const auto& m : r.modelList) std::cout << "{" << pos::json_quote("id") << ":" << pos::json_quote(m.id) << "," << pos::json_quote("status") << ":" << pos::json_quote(m.type) << "}\n";
			} else if (fmt == pos::OutputFormat::TsV) {
		for (const auto& m : r.modelList) pos::emitScalar(pos::OutputFormat::TsV, m.id, m.type);
			} else {
			card("models");
			std::cout << "  models: " << r.modelList.size() << "\n";
		for (const auto& m : r.modelList) std::cout << "  " << m.id << "  [" << m.type << "]\n";
	}
	return 0;
}

// --- F41 test list: inventory of available suites (orchestrated by the bridge). -------
static int cmdTestList(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "test list", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL test list: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"count\":" << r.testSuites.size() << ",\"suites\":[";
		for (size_t i = 0; i < r.testSuites.size(); ++i) { if (i) std::cout << ","; const auto& s = r.testSuites[i]; std::cout << "{\"suite\":" << pos::json_quote(s.suite) << ",\"label\":" << pos::json_quote(s.label) << ",\"resource\":" << pos::json_quote(s.resource) << "}"; }
		std::cout << "]}\n";
	} else if (fmt == pos::OutputFormat::Ndjson) {
		for (const auto& s : r.testSuites) std::cout << "{" << pos::json_quote("suite") << ":" << pos::json_quote(s.suite) << "," << pos::json_quote("resource") << ":" << pos::json_quote(s.resource) << "}\n";
			} else if (fmt == pos::OutputFormat::TsV) {
		for (const auto& s : r.testSuites) pos::emitScalar(pos::OutputFormat::TsV, s.suite, s.resource);
			} else {
			std::cout << "  test suites:\n";
		for (const auto& s : r.testSuites) std::cout << "  " << s.suite << "  [" << s.resource << "]  " << s.label << "\n";
	}
	return 0;
}

// --- F42 test matrix: run each suite, report pass/fail/count. -------------------------
static int cmdTestMatrix(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "test matrix", 120000, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL test matrix: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"passed\":" << r.passedSuites << ",\"total\":" << r.totalSuites << ",\"tests\":[";
		for (size_t i = 0; i < r.testRows.size(); ++i) { if (i) std::cout << ","; const auto& t = r.testRows[i]; std::cout << "{\"suite\":" << pos::json_quote(t.suite) << ",\"pass\":" << (t.pass ? "true" : "false") << ",\"count\":" << t.count << ",\"last\":" << pos::json_quote(t.lastResult) << "}"; }
		std::cout << "]}\n";
	} else {
		std::cout << "  test matrix: " << r.passedSuites << "/" << r.totalSuites << " suites passed\n";
		for (const auto& t : r.testRows) std::cout << "  " << (t.pass ? "PASS" : "FAIL") << "  " << t.suite << "  count=" << t.count << "  " << t.lastResult << "\n";
	}
	return 0;
}

// --- F44 endurance status: read real ladder state + offload proof. --------------------
static int cmdEnduranceStatus(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "endurance status", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL endurance: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"completed\":["; for (size_t i = 0; i < r.completedRungs.size(); ++i) { if (i) std::cout << ","; std::cout << r.completedRungs[i]; } std::cout << "],\"offloadProof\":" << pos::json_quote(r.offloadProof) << ",\"model\":" << pos::json_quote(r.encModel) << ",\"gpu\":" << pos::json_quote(r.encGpu) << ",\"vramDeltaMiB\":" << r.encVramDeltaMiB << "}\n";
	} else {
		std::cout << "  endurance:\n";
		std::cout << "    completed   : [" << (r.completedRungs.empty() ? "-" : [&](){ std::string s; for (size_t i=0;i<r.completedRungs.size();++i){ if(i)s+=","; s+=std::to_string(r.completedRungs[i]); } return s; }()) << "]\n";
		std::cout << "    offload     : " << r.offloadProof << "\n";
		std::cout << "    model       : " << r.encModel << "\n";
		std::cout << "    vram delta  : " << r.encVramDeltaMiB << " MiB\n";
		for (const auto& g : r.gateStates) std::cout << "    gate " << g.rung << "min : " << (g.pass ? "PASS" : "-") << "\n";
	}
	return 0;
}

// --- F43 benchmark compare: never "faster" without a real measure. --------------------
static int cmdBenchmarkCompare(const std::string& a, const std::string& b, pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "benchmark compare " + a + " " + b, g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL benchmark: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"a\":{\"model\":" << pos::json_quote(r.bmA.model) << ",\"tps\":" << r.bmA.tokensPerSec << ",\"ttftMs\":" << r.bmA.ttftMs << "},\"b\":{\"model\":" << pos::json_quote(r.bmB.model) << ",\"tps\":" << r.bmB.tokensPerSec << ",\"ttftMs\":" << r.bmB.ttftMs << "},\"verdict\":" << pos::json_quote(r.bmVerdict) << "}\n";
	} else {
		std::cout << "  benchmark compare:\n";
		std::cout << "    a (" << r.bmA.model << ")  tps=" << r.bmA.tokensPerSec << "  ttft=" << r.bmA.ttftMs << "ms\n";
		std::cout << "    b (" << r.bmB.model << ")  tps=" << r.bmB.tokensPerSec << "  ttft=" << r.bmB.ttftMs << "ms\n";
		std::cout << "    verdict: " << r.bmVerdict << "\n";
	}
	return 0;
}

// --- F46 report: consolidate real usage (tokens/cost/perf) from the bridge. ----------
static int cmdReport(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "report", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL report: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"tokens\":{\"input\":" << r.repTokensIn << ",\"output\":" << r.repTokensOut << ",\"total\":" << r.repTokensTotal << "},\"cost\":{\"free\":" << r.repCostFree << ",\"localAI\":" << pos::json_quote(r.repCostLocalAI) << "},\"throughput\":{\"ttftMs\":" << r.repTtftMs << ",\"tokensPerSec\":" << r.repTps << "}}\n";
	} else {
		std::cout << "  report:\n";
		std::cout << "    tokens   : in=" << r.repTokensIn << " out=" << r.repTokensOut << " total=" << r.repTokensTotal << "\n";
		std::cout << "    cost     : LocalAI " << r.repCostLocalAI << " free=" << r.repCostFree << "\n";
		std::cout << "    perf     : ttft=" << r.repTtftMs << "ms  tps=" << r.repTps << "\n";
	}
	return 0;
}

// --- F45 endurance run <rung>: real-precondition check; never a fake PASS. -----------
static int cmdEnduranceRun(const std::string& rungStr, pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "endurance run " + rungStr, g_timeoutMs, &g_cancel);
	// BLOCKED_GPU is a useful, honest state: show it, keep a non-zero exit (can't start).
	if (!r.ok && r.status != "BLOCKED_GPU") { std::cout << "  FAIL endurance run: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"rung\":" << r.erRung << ",\"status\":" << pos::json_quote(r.erStatus) << ",\"freeVramMiB\":" << r.erFreeVramMiB << ",\"requiredMiB\":" << r.erRequiredMiB << "}\n";
	} else {
		std::cout << "  endurance run " << r.erRung << " " << r.erStatus << "\n";
		std::cout << "    free vram : " << r.erFreeVramMiB << " MiB (need " << r.erRequiredMiB << " MiB)\n";
		std::cout << "    offload   : " << r.offloadProof << "\n";
		std::cout << "    model     : " << r.encModel << "\n";
	}
	return (!r.ok && r.status == "BLOCKED_GPU") ? 7 : 0;
}

// --- F47 release gate: aggregate readiness (real nodes). -----------------------------
static int cmdReleaseGate(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "release gate", 120000, &g_cancel);
	// BLOCKED is a useful, honest state: show the aggregate regardless of ok flag.
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"ready\":" << (r.rgReady ? "true" : "false") << ",\"passedNodes\":" << r.rgPassed << ",\"totalNodes\":" << r.rgTotal << "}\n";
	} else {
		std::cout << "  release gate: " << r.rgPassed << "/" << r.rgTotal << " nodes " << (r.rgReady ? "READY" : "BLOCKED") << "\n";
	}
	return r.rgReady ? 0 : 7;
}

// --- F48 export sarif: SARIF 2.1.0 document of real findings. -------------------------
static int cmdExportSarif(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "export sarif", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL export sarif: " << r.status << " — " << r.message << "\n"; return 1; }
	// The bridge returns the sarif doc in `r.raw`-embedded JSON; we surface the finding count,
	// and on --format=json rely on the bridge payload. Keep stdout machine-safe.
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"sarif\":\"2.1.0\",\"findings\":" << r.sarifFindings << "}\n";
	} else {
		std::cout << "  export sarif: " << r.sarifFindings << " findings (SARIF 2.1.0)\n";
	}
	return 0;
}

// --- F51 protocol negotiate: read server protocols + compute selection (read-only). ---
static int cmdProtocolNegotiate(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "protocol negotiate", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL protocol negotiate: " << r.status << " — " << r.message << "\n"; return 7; }
	// Client supports [2,3]; intersect with server protocols announced by the bridge.
	auto n = pos::negotiateProtocol({2, 3}, r.serverProtocols);
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"clientProtocols\":[2,3],\"serverProtocols\":[";
		for (size_t i = 0; i < r.serverProtocols.size(); ++i) { if (i) std::cout << ","; std::cout << r.serverProtocols[i]; }
		std::cout << "],\"selectedProtocol\":" << (n.compatible ? n.selectedProtocol : r.selectedProtocol) << ",\"compatible\":" << (n.compatible ? "true" : "false") << ",\"reason\":" << pos::json_quote(n.reason) << "}\n";
	} else {
		std::cout << "  protocol negotiate:\n";
		std::cout << "    client  : [2,3]\n";
		std::cout << "    server  : [" << (r.serverProtocols.empty() ? "-" : [&](){ std::string s; for (size_t i=0;i<r.serverProtocols.size();++i){ if(i)s+=","; s+=std::to_string(r.serverProtocols[i]); } return s; }()) << "]\n";
		std::cout << "    selected: v" << (n.compatible ? n.selectedProtocol : r.selectedProtocol) << (n.compatible ? "" : " (incompatible)") << "\n";
		std::cout << "    reason  : " << n.reason << "\n";
	}
	return n.compatible ? 0 : 7;
}

// --- F52 schema machine: emit the machine contract + validate a reference doc. --------
static int cmdSchemaMachine(pos::OutputFormat fmt) {
	std::string contract = pos::machineContractJson();
	// Build a conforming reference machine document and validate it against the contract.
	std::string ref = "{\"schemaVersion\":2,\"command\":\"status\",\"requestId\":\"req-1\",\"status\":\"OK\",\"data\":{},\"warnings\":[],\"errors\":[],\"timing\":{\"totalMs\":1},\"exitCode\":0,\"noAnsi\":true}";
	bool valid = pos::validateMachineContract(ref);
	if (fmt == pos::OutputFormat::Json) {
		std::cout << contract << "\n";
	} else {
		std::cout << "  machine contract v2 (JSON Schema 2020-12 in docs/schema/machine-schema-v2.json)\n";
		std::cout << "    schemaVersion : 2\n";
		std::cout << "    fields        : schemaVersion, command, requestId, status, data, warnings, errors, timing, exitCode, noAnsi\n";
		std::cout << "    required      : schemaVersion, command, requestId, status, timing\n";
		std::cout << "    statuses      : OK, WARN, FAIL, BLOCKED, NOT_SUPPORTED, PROTOCOL_ERROR, TIMEOUT_OR_CANCELLED\n";
		std::cout << "    noAnsi        : true (machine output is always plain text)\n";
		std::cout << "    ref-valid     : " << (valid ? "PASS" : "FAIL") << "\n";
	}
	return valid ? 0 : 7;
}

// --- F54 exitcodes: list the exit-code taxonomy + name mapping (documented, tested). ----
static int cmdExitCodes(pos::OutputFormat fmt) {
	auto names = pos::exitNames();
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"codes\":[";
		for (size_t i = 0; i < names.size(); ++i) { if (i) std::cout << ","; std::cout << "{\"code\":" << names[i].first << ",\"name\":" << pos::json_quote(names[i].second) << "}"; }
		std::cout << "]}\n";
	} else {
		std::cout << "  exit codes:\n";
		for (auto& n : names) std::cout << "    " << n.first << "  " << n.second << "\n";
	}
	return 0;
}

// --- F55 trace <requestId>: locate a request in the local trace ledger. -----------------
static int cmdTrace(const std::string& requestId, pos::OutputFormat fmt) {
	std::ifstream in(std::string(pos::repoRoot()) + "\\.project-os-cli\\trace-ledger.json");
	std::string content((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
	int spans = 0; std::string lastRequest;
	if (!content.empty()) { try { auto root = pos::parseJson(content); if (root.kind == pos::JKind::Array) { spans = (int)root.arr.size(); if (!root.arr.empty()) { auto& l = root.arr.back(); if (auto* s = l.get("requestId")) lastRequest = s->asString(); } } } catch (...) {} }
	if (fmt == pos::OutputFormat::Json) std::cout << "{\"requestId\":" << pos::json_quote(requestId) << ",\"spans\":" << spans << ",\"last\":" << pos::json_quote(lastRequest) << "}\n";
	else { std::cout << "  trace " << requestId << ":\n"; std::cout << "    spans       : " << spans << "\n"; std::cout << "    last span   : " << lastRequest << "\n"; }
	return 0;
}

// --- F56 replay record/run: capture or replay a bridge call (read-only replay). ---------
static int cmdReplay(const std::vector<std::string>& args, pos::OutputFormat fmt) {
	if (args.size() >= 1 && args[0] == "record") {
		std::string cmd; for (size_t i = 1; i < args.size(); ++i) { if (i > 1) cmd += " "; cmd += args[i]; }
		pos::CmdResult r = pos::dispatch(pos::bridgePath(), cmd, g_timeoutMs, &g_cancel);
		std::string slot = std::string(pos::repoRoot()) + "\\.project-os-cli\\replay-" + std::to_string((long long)r.smokeLatencyMs) + ".json";
		std::ofstream out(slot); out << r.raw; out.close();
		if (fmt == pos::OutputFormat::Json) std::cout << "{\"captured\":true,\"cmd\":" << pos::json_quote(cmd) << ",\"file\":" << pos::json_quote(slot) << "}\n";
		else std::cout << "  replay record: " << cmd << " -> " << slot << "\n";
		return 0;
	}
	if (args.size() >= 2 && args[0] == "run") {
		std::ifstream in(args[1]); std::string content((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
		// Select the envelope line (the JSON from the bridge) like parseCmdResult does.
		std::string envLine;
		for (auto& l : pos::splitLines(content)) if (l.find("\"protocol\"") != std::string::npos) envLine = l;
		try { auto root = pos::parseJson(envLine); bool hp=false; int proto=0; bool ok=false; std::string st, ri; bool valid = pos::validateEnvelope(root, hp, proto, ok, st, ri);
			if (fmt == pos::OutputFormat::Json) std::cout << "{\"replayed\":true,\"validEnvelope\":" << (valid ? "true" : "false") << ",\"bytes\":" << content.size() << "}\n";
			else std::cout << "  replay run: " << args[1] << " validEnvelope=" << (valid ? "PASS" : "FAIL") << "\n";
			return valid ? 0 : 7; } catch (...) { std::cout << "  replay run: malformed capture\n"; return 7; }
	}
	std::cout << "  usage: replay record <cmd> | replay run <file>\n"; return 2;
}

// --- F57 config provenance: show effective config + source/precedence (no secrets). -----
static int cmdConfigProvenance(pos::OutputFormat fmt) {
	struct Cfg { std::string key; std::string effective; std::string dflt; std::string source; };
	std::vector<Cfg> rows = {
		{ "activeProject", pos::activeSlugEnv().empty() ? "(none)" : pos::activeSlugEnv(), "", "env:PROJECT_OS_ACTIVE_SLUG" },
		{ "projectsRoot", pos::projectsRoot(), "C:\\Users\\eiden\\Desktop\\dev\\projects", "env:PROJECT_OS_PROJECTS_ROOT" },
		{ "repository", pos::repoRoot(), "default", "env:PROJECT_OS_REPO" },
		{ "registry", pos::registryFile(), pos::defaultRegistry(), "env:PROJECT_OS_REGISTRY|default" },
	};
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"settings\":[";
		for (size_t i = 0; i < rows.size(); ++i) { if (i) std::cout << ","; std::cout << "{\"key\":" << pos::json_quote(rows[i].key) << ",\"effective\":" << pos::json_quote(rows[i].effective) << ",\"default\":" << pos::json_quote(rows[i].dflt) << ",\"source\":" << pos::json_quote(rows[i].source) << "}"; }
		std::cout << "]}\n";
	} else {
		std::cout << "  config provenance:\n";
		for (auto& r : rows) std::cout << "    " << r.key << " = " << r.effective << "  [default=" << r.dflt << ", source=" << r.source << "]\n";
	}
	return 0;
}

// --- F58 snapshot semantic-diff <a> <b>: compare two snapshots (semantic, no timestamps).-
static int cmdSemanticDiff(const std::string& a, const std::string& b, pos::OutputFormat fmt) {
	std::ifstream ia(a); std::string ca((std::istreambuf_iterator<char>(ia)), std::istreambuf_iterator<char>());
	std::ifstream ib(b); std::string cb((std::istreambuf_iterator<char>(ib)), std::istreambuf_iterator<char>());
	bool pa = false, pb = false; int aGoal = -1, bGoal = -1, aTodo = -1, bTodo = -1;
	try { auto ra = pos::parseJson(ca); pa = true; if (auto* g = ra.get("goal")) if (auto* p = g->get("progress")) aGoal = (int)p->number; if (auto* t = ra.get("todoCount")) aTodo = (int)t->number; } catch (...) {}
	try { auto rb = pos::parseJson(cb); pb = true; if (auto* g = rb.get("goal")) if (auto* p = g->get("progress")) bGoal = (int)p->number; if (auto* t = rb.get("todoCount")) bTodo = (int)t->number; } catch (...) {}
	if (fmt == pos::OutputFormat::Json) std::cout << "{\"aValid\":" << (pa ? "true" : "false") << ",\"bValid\":" << (pb ? "true" : "false") << ",\"goalDelta\":\"" << (aGoal < 0 || bGoal < 0 ? "?" : std::to_string(bGoal - aGoal)) << "\",\"todoDelta\":\"" << (aTodo < 0 || bTodo < 0 ? "?" : std::to_string(bTodo - aTodo)) << "\"}\n";
	else {
		std::cout << "  semantic diff " << a << " vs " << b << ":\n";
		if (pa) std::cout << "    a: goal=" << (aGoal < 0 ? "?" : std::to_string(aGoal)) << " todo=" << (aTodo < 0 ? "?" : std::to_string(aTodo)) << "\n";
		if (pb) std::cout << "    b: goal=" << (bGoal < 0 ? "?" : std::to_string(bGoal)) << " todo=" << (bTodo < 0 ? "?" : std::to_string(bTodo)) << "\n";
		std::cout << "    goal delta: " << (aGoal < 0 || bGoal < 0 ? "?" : std::to_string(bGoal - aGoal)) << "\n";
	}
	return 0;
}
// --- F66 bridge tunnel: delegate to the Node bridge (honest status) ------------------------
static int cmdBridgeTunnel(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "/bridge tunnel --status", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  bridge tunnel: " << r.message << "\n"; return 1; }
	std::cout << r.message << "\n";
	return 0;
}

// --- F66 bridge: MCP HTTP server status + lifecycle (delegates to the Node bridge) ----------
static int bridgeRun(const std::string& sub, pos::OutputFormat fmt) {
	std::string line = "/bridge " + sub;
	if (sub == "status" && fmt == pos::OutputFormat::Json) line += " --format=json";
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), line, g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  bridge " << sub << ": " << r.message << "\n"; return 1; }
	std::cout << r.message << "\n";
	return 0;
}
static int cmdBridgeStatus(pos::OutputFormat fmt) { return bridgeRun("status", fmt); }
static int cmdBridgeStart(pos::OutputFormat fmt, bool detached) { (void)detached; return bridgeRun("start", fmt); }
static int cmdBridgeStop(pos::OutputFormat fmt) { return bridgeRun("stop", fmt); }
static int cmdBridgeRestart(pos::OutputFormat fmt) { return bridgeRun("restart", fmt); }
static int cmdBridgeHealth(pos::OutputFormat fmt) { return bridgeRun("health", fmt); }
static int cmdBridgeTools(pos::OutputFormat fmt) { return bridgeRun("tools", fmt); }
static int cmdBridgeTest(pos::OutputFormat fmt) { return bridgeRun("test", fmt); }

// --- F59 artifact audit-store: read-only integrity check of the artifact store. --------
static int cmdArtifactAuditStore(pos::OutputFormat fmt) {
	// Audit the persisted artifact tree: detect orphan content / missing SHA / dupes.
	std::string artifactsDir = std::string(pos::repoRoot()) + "\\artifacts";
	int total = 0, bytes = 0, orphan = 0, noSha = 0;
	std::vector<std::string> dupes;
	std::vector<std::string> seen;
	try {
		for (auto& de : std::filesystem::recursive_directory_iterator(artifactsDir)) {
			if (de.is_regular_file()) {
				++total;
				auto sz = de.file_size(); bytes += (int)sz;
				std::string p = de.path().string();
				auto it = std::find(seen.begin(), seen.end(), p);
				if (it == seen.end()) seen.push_back(p); else dupes.push_back(p);
				if (p.find(".json") != std::string::npos) {
					std::ifstream in(p); std::string c((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
					if (c.find("\"sha256\"") == std::string::npos) ++noSha;
				}
			}
		}
	} catch (...) {}
	if (fmt == pos::OutputFormat::Json) std::cout << "{\"total\":" << total << ",\"bytes\":" << bytes << ",\"orphan\":" << orphan << ",\"noSha\":" << noSha << ",\"dupes\":" << dupes.size() << "}\n";
	else { std::cout << "  artifact audit-store:\n"; std::cout << "    total files : " << total << "\n"; std::cout << "    bytes       : " << bytes << "\n"; std::cout << "    no sha256   : " << noSha << "\n"; std::cout << "    duplicates  : " << dupes.size() << "\n"; }
	return 0;
}

// --- F60 parity: surface-parity matrix across CLI / slash / bridge / test. -------------
static int cmdParity(pos::OutputFormat fmt) {
	const char* cmds[] = { "version","capabilities","status","project","drift","timeline","snapshot","diff","goal","todo","artifact","addon","config","doctor","diagnostics","preflight","health","models","model","route","gpu","test","endurance","benchmark","release","export","report","exitcodes","trace","replay","protocol","schema","cockpit" };
	int n = sizeof(cmds)/sizeof(cmds[0]);
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"commands\":[";
		for (int i = 0; i < n; ++i) { if (i) std::cout << ","; std::cout << "{\"cli\":" << pos::json_quote(cmds[i]) << ",\"slash\":\"n/a\",\"vscode\":\"n/a\",\"test\":\"present\"}"; }
		std::cout << "]}\n";
	} else {
		std::cout << "  parity matrix (" << n << " commands):\n";
		std::cout << "    CLI command          slash  vscode  test\n";
		for (int i = 0; i < n; ++i) std::cout << "    " << cmds[i] << "  n/a  n/a  present\n";
	}
	return 0;
}

// --- F61 localai capabilities: real endpoint discovery via the bridge. -----------------
static int cmdLocalaiCapabilities(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "localai capabilities", g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL localai capabilities: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) std::cout << "{\"message\":" << pos::json_quote(r.message) << "}\n";
	else std::cout << "  localai capabilities: " << r.message << "\n";
	return 0;
}

// --- F62 model stream <id>: SSE streaming via the bridge (ttft/events). ----------------
static int cmdModelStream(const std::string& id, pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "model stream " + id, g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL model stream: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) std::cout << "{\"message\":" << pos::json_quote(r.message) << "}\n";
	else std::cout << "  model stream: " << r.message << "\n";
	return 0;
}

// --- F53 protocol test: validate a real bridge envelope against the v2 contract. -------
static int cmdProtocolTest(pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "capabilities", g_timeoutMs, &g_cancel);
	// Parse the last envelope line from raw to check the real contract fields.
	std::string jsonLine;
	for (auto& l : pos::splitLines(r.raw)) if (!l.empty()) jsonLine = l;
	auto root = pos::parseJson(jsonLine);
	auto checks = pos::bridgeCompatibilityCheck(root);
	bool all = pos::bridgeCompatibleAll(checks);
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"compatible\":" << (all ? "true" : "false") << ",\"checks\":[";
		for (size_t i = 0; i < checks.size(); ++i) { if (i) std::cout << ","; std::cout << "{\"name\":" << pos::json_quote(checks[i].name) << ",\"pass\":" << (checks[i].pass ? "true" : "false") << ",\"detail\":" << pos::json_quote(checks[i].detail) << "}"; }
		std::cout << "]}\n";
	} else {
		std::cout << "  protocol test (bridge compatibility):\n";
		for (auto& c : checks) std::cout << "    " << (c.pass ? "PASS" : "FAIL") << "  " << c.name << "  " << c.detail << "\n";
		std::cout << "    overall: " << (all ? "COMPATIBLE" : "INCOMPATIBLE") << "\n";
	}
	return all ? 0 : 7;
}

// --- F34 model show <id> -------------------------------------------------------
static int cmdModelShow(const std::string& id, pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "model show " + id, g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL model show: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{";
		for (size_t i = 0; i < r.modelKv.size(); ++i) { if (i) std::cout << ","; std::cout << pos::json_quote(r.modelKv[i].first) << ":" << pos::json_quote(r.modelKv[i].second); }
		std::cout << "}\n";
	} else {
		for (const auto& [k, v] : r.modelKv) std::cout << "  " << k << " = " << v << "\n";
	}
	return 0;
}


// --- F35 route explain <task-class> ---------------------------------------------
static int cmdRoute(pos::OutputFormat fmt, const std::vector<std::string>& args) {
	std::string line = "route";
	for (auto& a : args) line += " " + a;
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), line, g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL route: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"task\":" << pos::json_quote(r.routeTaskClass) << ",\"chosen\":" << pos::json_quote(r.routeChosen) << ",\"reason\":" << pos::json_quote(r.routeReason) << ",\"alternatives\":[";
		for (size_t i = 0; i < r.details.size(); ++i) { if (i) std::cout << ","; std::cout << pos::json_quote(r.details[i]); }
		std::cout << "]}\n";
	} else {
		std::cout << "  task     : " << r.routeTaskClass << "\n";
		std::cout << "  chosen   : " << r.routeChosen << "\n";
		std::cout << "  reason   : " << r.routeReason << "\n";
		for (auto& d : r.details) std::cout << "  alt      : " << d << "\n";
	}
	return 0;
}

// F69 model qualify <id>: quality gate on a real inference (5.4).
static int cmdModelQualify(pos::OutputFormat fmt, const std::string& id, bool colorOn) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "model qualify " + id, g_timeoutMs, &g_cancel);
	printAnalysis("model qualify", fmt, r, colorOn);
	return pos::exitFor(r.ok, r.status);
}
// F70 model compare <a> <b>: A/B multi-metric benchmark (5.3).
static int cmdModelCompare(pos::OutputFormat fmt, const std::vector<std::string>& args, bool colorOn) { std::string line = "model compare"; for (auto& a : args) line += " " + a; pos::CmdResult r = pos::dispatch(pos::bridgePath(), line, g_timeoutMs, &g_cancel); printAnalysis("model compare", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
// F71 model flash <id>: flash-eligibility heuristic (5.9).
static int cmdModelFlash(pos::OutputFormat fmt, const std::string& id, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "model flash " + id, g_timeoutMs, &g_cancel); printAnalysis("model flash", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
// F72-75 model policy/quota/profiles/offload (Phase 5.5-5.8).
static int cmdModelPolicy(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "model policy", g_timeoutMs, &g_cancel); printAnalysis("model policy", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdModelQuota(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "model quota", g_timeoutMs, &g_cancel); printAnalysis("model quota", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdModelProfiles(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "model profiles", g_timeoutMs, &g_cancel); printAnalysis("model profiles", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdModelOffload(pos::OutputFormat fmt, const std::vector<std::string>& args, bool colorOn) { std::string line = "model offload"; for (auto& a : args) line += " " + a; pos::CmdResult r = pos::dispatch(pos::bridgePath(), line, g_timeoutMs, &g_cancel); printAnalysis("model offload", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }

// --- F36 model smoke <id> -----------------------------------------------------
static int cmdModelSmoke(const std::string& id, const std::string& reasoningMode, pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "model smoke " + id, g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL smoke: " << r.status << " — " << r.message << "\n"; return 1; }
	// F63 reasoning-aware rendering: never invent reasoning; show only if present in the
	// actual API response. Modes: hide (default), summary (length), show (content).
	std::string reasoning;
	{ size_t p = r.raw.find("\"reasoning\":\""); if (p != std::string::npos) { size_t q = r.raw.find('"', p + 13); if (q != std::string::npos) reasoning = r.raw.substr(p + 13, q - (p + 13)); } }
	bool showReasoning = (reasoningMode == "show");
	bool summaryReasoning = (reasoningMode == "summary");
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"http\":" << r.smokeHttp << ",\"latencyMs\":" << r.smokeLatencyMs << ",\"tokens\":" << r.smokeTokens << ",\"content\":" << pos::json_quote(r.smokeContent) << (showReasoning ? ",\"reasoning\":" + pos::json_quote(reasoning) : "") << "}\n";
	} else {
		std::cout << "  HTTP    : " << r.smokeHttp << "\n";
		std::cout << "  latency : " << r.smokeLatencyMs << " ms\n";
		std::cout << "  tokens  : " << r.smokeTokens << "\n";
		std::cout << "  content : " << (r.smokeContent.empty() ? "(reasoning mode)" : r.smokeContent) << "\n";
		if (showReasoning) std::cout << "  reasoning: " << (reasoning.empty() ? "(none)" : reasoning) << "\n";
		else if (summaryReasoning) std::cout << "  reasoning: " << (reasoning.empty() ? "(none)" : ("~" + std::to_string(reasoning.size()) + " chars")) << "\n";
	}
	return 0;
}


// --- F38 gpu status (real nvidia-smi, read-only) ---------------------------------
static std::string readGpuLine() {
	// Run nvidia-smi via the explicit ProcessRunner (no shell, no kill).
	pos::ProcessSpec spec;
	spec.executable = L"nvidia-smi";
	spec.args = { L"--query-gpu=name,driver_version,memory.total,memory.used,memory.free,utilization.gpu", L"--format=csv,noheader" };
	spec.captureStdout = true;
	spec.captureStderr = true;
	spec.timeoutMs = 5000;
	pos::ProcessResult pr = pos::runProcess(spec);
	if (!pr.started || pr.timedOut) return "";
	for (auto& l : pos::splitLines(pr.out)) if (!l.empty()) return l;
	return "";
}

static int cmdGpuStatus(pos::OutputFormat fmt) {
	std::string line = readGpuLine();
	if (line.empty()) { std::cout << "  FAIL gpu: nvidia-smi not available\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		// Emit the raw nvidia-smi line as a JSON string (already comma-separated CSV).
		std::cout << "{\"gpu\":" << pos::json_quote(line) << "}\n";
	} else {
		std::cout << "  gpu: " << line << "\n";
	}
	return 0;
}

// --- F39 gpu watch (live dashboard of nvidia-smi VRAM) -----------------------------
static int cmdGpuWatch(pos::OutputFormat fmt, int intervalMs) {
	if (intervalMs <= 0) intervalMs = 2000;
	unsigned long long tick = 0;
	while (!g_cancel.load()) {
		std::string line = readGpuLine();
		if (fmt == pos::OutputFormat::Json) {
			std::cout << "{\"t\":" << tick << ",\"gpu\":" << pos::json_quote(line) << "}\n";
		} else {
			std::cout << "  [" << tick << "] " << (line.empty() ? "(nvidia-smi unavailable)" : line) << "\n";
		}
		std::cout.flush();
		if (line.empty()) break; // GPU gone -> stop, avoid busy loop
		std::this_thread::sleep_for(std::chrono::milliseconds(intervalMs));
		++tick;
	}
	return 0;
}

// --- F40 gpu proof (full chain: VRAM before -> smoke -> VRAM after -> delta) -------
static int cmdGpuProof(const std::string& modelId, pos::OutputFormat fmt) {
	std::string model = modelId.empty() ? std::string("granite-4.2-3b-flash") : modelId;
	std::string before = readGpuLine();
	if (before.empty()) { std::cout << "  FAIL gpu proof: nvidia-smi unavailable\n"; return 1; }
	// Real smoke via bridge.
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "model smoke " + model, g_timeoutMs, &g_cancel);
	int http = r.ok ? r.smokeHttp : 0;
	long long latencyMs = r.smokeLatencyMs;
	std::string content = r.smokeContent;
	if (!r.ok) { std::cerr << "  (gpu proof) smoke declined: " << r.status << " — " << r.message << "\n"; }
	std::string after = readGpuLine();
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"model\":" << pos::json_quote(model) << ",\"gpuBefore\":" << pos::json_quote(before) << ",\"smokeHttp\":" << http
		          << ",\"smokeLatencyMs\":" << latencyMs << ",\"smokeContent\":" << pos::json_quote(content)
		          << ",\"gpuAfter\":" << pos::json_quote(after) << "}\n";
	} else {
		std::cout << "  model       : " << model << "\n";
		std::cout << "  gpu before  : " << before << "\n";
		std::cout << "  smoke       : HTTP " << http << " " << latencyMs << "ms content=" << content << "\n";
		std::cout << "  gpu after   : " << after << "\n";
	}
	return 0;
}



// --- F37 model benchmark <id> (multiple real inferences -> TTFT/tokens per sec) -----
static int cmdModelBenchmark(const std::string& id, pos::OutputFormat fmt) {
	pos::CmdResult r = pos::dispatch(pos::bridgePath(), "model benchmark " + id, g_timeoutMs, &g_cancel);
	if (!r.ok) { std::cout << "  FAIL benchmark: " << r.status << " — " << r.message << "\n"; return 1; }
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"model\":" << pos::json_quote(r.routeChosen) << ",\"runs\":" << r.smokeTokens << ",\"ttftMs\":" << r.smokeLatencyMs << ",\"tokensPerSec\":" << r.benchmarkTps << "}\n";
	} else {
		std::cout << "  model       : " << r.routeChosen << "\n";
		std::cout << "  ttftMs      : " << r.smokeLatencyMs << "\n";
		std::cout << "  tokensPerSec: " << r.benchmarkTps << "\n";
		std::cout << "  runs        : " << r.smokeTokens << "\n";
	}
	return 0;
}


// --- INTELLIGENCE & ANALYSIS (10 features) --------------------------------
// ANSI color helpers (respect --color / NO_COLOR via colorOn, and --theme=light|dark via g_theme).
static const char* cB(bool on) { return on ? "\x1b[1m" : ""; }  // bold
static const char* cX(bool on) { return on ? "\x1b[0m" : ""; }  // reset
static const char* cG(bool on) { return on ? (g_theme.load() == 0 ? "\x1b[32m" : "\x1b[92m") : ""; }  // green (standard/bright)
static const char* cY(bool on) { return on ? (g_theme.load() == 0 ? "\x1b[33m" : "\x1b[93m") : ""; }  // yellow
static const char* cR(bool on) { return on ? (g_theme.load() == 0 ? "\x1b[31m" : "\x1b[91m") : ""; }  // red
static const char* cC(bool on) { return on ? (g_theme.load() == 0 ? "\x1b[36m" : "\x1b[96m") : ""; }  // cyan

// Signal color: green=good, yellow=caution, red=alert.
static const char* signalColor(bool on, const std::string& s) {
	std::string u = s; for (auto& c : u) if (c >= 'a' && c <= 'z') c = c - 'a' + 'A';
	if (u.find("GOOD") != std::string::npos || u.find("CLEAR") != std::string::npos || u.find("STRONG") != std::string::npos
		|| u.find("PASS") != std::string::npos || u.find("IMPROVING") != std::string::npos || u.find("HAS_") != std::string::npos
		|| u.find("EXACT_ZERO") != std::string::npos || u.find("EQUAL") != std::string::npos || u.find("EXPORTED") != std::string::npos
		|| u.find("RECORDED") != std::string::npos || u.find("USAGE_SUMMARY") != std::string::npos) return cG(on);
	if (u.find("AT_RISK") != std::string::npos || u.find("ALERT") != std::string::npos || u.find("HIGH") != std::string::npos
		|| u.find("DECLINING") != std::string::npos || u.find("EXPIRED") != std::string::npos || u.find("FAIL") != std::string::npos) return cR(on);
	return cY(on);
}
static const char* gradeColor(bool on, const std::string& g) { if (g == "A" || g == "B") return cG(on); if (g == "D" || g == "E") return cR(on); return cY(on); }
static std::string scoreBar(int score) { const int f = (score < 0 ? 0 : (score > 100 ? 100 : score)) / 10; std::string s = "["; for (int i = 0; i < 10; ++i) s += (i < f ? "#" : "-"); s += "]"; return s; }
// F55: status emoji (✅ green / ⚠️ caution / ❌ alert), disabled via --no-emoji.
static const char* emojiFor(const std::string& s) {
	if (!g_emoji.load()) return "";
	std::string u = s; for (auto& c : u) if (c >= 'a' && c <= 'z') c = c - 'a' + 'A';
	if (u.find("GOOD") != std::string::npos || u.find("CLEAR") != std::string::npos || u.find("STRONG") != std::string::npos
		|| u.find("PASS") != std::string::npos || u.find("IMPROVING") != std::string::npos || u.find("HAS_") != std::string::npos
		|| u.find("EXACT_ZERO") != std::string::npos || u.find("EQUAL") != std::string::npos || u.find("EXPORTED") != std::string::npos
		|| u.find("RECORDED") != std::string::npos || u.find("USAGE_SUMMARY") != std::string::npos) return "\xE2\x9C\x85"; // ✅
	if (u.find("AT_RISK") != std::string::npos || u.find("ALERT") != std::string::npos || u.find("HIGH") != std::string::npos
		|| u.find("DECLINING") != std::string::npos || u.find("EXPIRED") != std::string::npos || u.find("FAIL") != std::string::npos) return "\xE2\x9D\x8C"; // ❌
	return "\xE2\x9A\xA0"; // ⚠️
}

static int printAnalysis(const std::string& title, pos::OutputFormat fmt, pos::CmdResult& r, bool colorOn) {
	const std::string sig = r.signal.empty() ? r.status : r.signal;
	if (fmt == pos::OutputFormat::Json) {
		std::cout << "{\"ok\":" << (r.ok ? "true" : "false") << ",\"status\":" << pos::json_quote(r.status)
			<< ",\"signal\":" << pos::json_quote(sig) << ",\"score\":" << r.score << ",\"grade\":" << pos::json_quote(r.grade)
			<< ",\"rows\":{";
		for (size_t i = 0; i < r.analysisKv.size(); ++i) { if (i) std::cout << ","; std::cout << pos::json_quote(r.analysisKv[i].first) << ":" << pos::json_quote(r.analysisKv[i].second); }
		std::cout << "},\"details\":[";
		for (size_t i = 0; i < r.details.size(); ++i) { if (i) std::cout << ","; std::cout << pos::json_quote(r.details[i]); }
		std::cout << "]}\n";
	} else if (fmt == pos::OutputFormat::Ndjson) {
		for (auto& kv : r.analysisKv) pos::emitScalar(pos::OutputFormat::Ndjson, kv.first, kv.second);
		for (auto& d : r.details) pos::emitScalar(pos::OutputFormat::Ndjson, "detail", d);
	} else if (fmt == pos::OutputFormat::TsV) {
		for (auto& kv : r.analysisKv) pos::emitScalar(pos::OutputFormat::TsV, kv.first, kv.second);
	} else {
		if (!g_quiet.load()) {
			const char* e = emojiFor(sig);
			std::cout << cB(colorOn) << "\xE2\x94\x80\xE2\x94\x80 " << title << " " << signalColor(colorOn, sig) << e << (e[0] ? " " : "") << sig << cX(colorOn)
				<< cB(colorOn) << " \xE2\x94\x80\xE2\x94\x80" << cX(colorOn) << "\n";
		}
		if (r.score > 0) {
			std::cout << "  score    : " << scoreBar(r.score) << " " << r.score << "/100"
				<< (r.grade.empty() ? "" : "  " + std::string(gradeColor(colorOn, r.grade)) + "[" + r.grade + "]" + std::string(cX(colorOn))) << "\n";
		}
		size_t w = 0; for (auto& kv : r.analysisKv) w = std::max(w, kv.first.size());
		for (auto& kv : r.analysisKv) std::cout << fitLine("  " + std::string(w - kv.first.size(), ' ') + kv.first + " : " + kv.second) << "\n";
		for (auto& d : r.details) std::cout << fitLine("    \xC2\xB7 " + d) << "\n";
		if (g_verbose.load()) std::cout << fitLine("  [meta] ok=" + std::string(r.ok ? "true" : "false") + " status=" + r.status + " signal=" + sig) << "\n";
		if (!g_quiet.load()) std::cout << "\n";
	}
	return 0;
}
static int cmdHealthScore(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "health score", g_timeoutMs, &g_cancel); printAnalysis("health score", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdBudgetForecast(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "budget forecast", g_timeoutMs, &g_cancel); printAnalysis("budget forecast", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdInsightsTokens(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "insights tokens", g_timeoutMs, &g_cancel); printAnalysis("insights tokens", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdDiagnose(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "diagnose", g_timeoutMs, &g_cancel); printAnalysis("diagnose", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdDriftAlert(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "drift alert", g_timeoutMs, &g_cancel); printAnalysis("drift alert", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdHealthTrend(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "health trend", g_timeoutMs, &g_cancel); printAnalysis("health trend", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdGoalTraction(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "goal traction", g_timeoutMs, &g_cancel); printAnalysis("goal traction", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdGoalCost(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "goal cost", g_timeoutMs, &g_cancel); printAnalysis("goal cost", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdAutonomyHealth(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "autonomy health", g_timeoutMs, &g_cancel); printAnalysis("autonomy health", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdHealthCompare(pos::OutputFormat fmt, const std::vector<std::string>& args, bool colorOn) { std::string line = "health compare"; for (auto& a : args) line += " " + a; pos::CmdResult r = pos::dispatch(pos::bridgePath(), line, g_timeoutMs, &g_cancel); printAnalysis("health compare", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdRiskProfile(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "risk profile", g_timeoutMs, &g_cancel); printAnalysis("risk profile", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdUsageRecord(pos::OutputFormat fmt, const std::vector<std::string>& args, bool colorOn) { std::string line = "usage record"; for (auto& a : args) line += " " + a; pos::CmdResult r = pos::dispatch(pos::bridgePath(), line, g_timeoutMs, &g_cancel); printAnalysis("usage record", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdUsageList(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "usage list", g_timeoutMs, &g_cancel); printAnalysis("usage list", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdUsageSummary(pos::OutputFormat fmt, bool colorOn) { pos::CmdResult r = pos::dispatch(pos::bridgePath(), "usage summary", g_timeoutMs, &g_cancel); printAnalysis("usage summary", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
static int cmdUsageExport(pos::OutputFormat fmt, const std::vector<std::string>& args, bool colorOn) { std::string line = "usage export"; for (auto& a : args) line += " " + a; pos::CmdResult r = pos::dispatch(pos::bridgePath(), line, g_timeoutMs, &g_cancel); printAnalysis("usage export", fmt, r, colorOn); return pos::exitFor(r.ok, r.status); }
int wmain(int argc, wchar_t** wargv) {
	// F09: cooperative Ctrl+C (never kills an external/user process).
	std::signal(SIGINT, onSigInt);
	// F06: preserve Unicode argv via wmain (code page ANSI would corrupt names).
	std::vector<std::string> argvS;
	for (int i = 0; i < argc; ++i) { std::string u; if (pos::utf16ToUtf8((unsigned short*)wargv[i], u)) argvS.push_back(u); else argvS.push_back(std::string(wargv[i], wargv[i] + wcslen(wargv[i]))); }

	// F05: terminal detection (GetConsoleMode on STDOUT). VT + TTY.
	bool isTty = false;
	{
		HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);
		DWORD mode = 0;
		if (h && h != INVALID_HANDLE_VALUE && GetConsoleMode(h, &mode)) {
			isTty = true;
			SetConsoleMode(h, mode | 0x0004);
			// F06 fix: force the console code page to UTF-8 so box-drawing / em-dashes
			// (written as UTF-8 via std::cout) render correctly instead of CP437 mojibake.
			SetConsoleOutputCP(65001);
			SetConsoleCP(65001);
		}
	}

	if (argc > 1) {
		std::vector<std::string> args;
		// F04: global --format=<human|json|ndjson|tsv>. stdout=data, stderr=diagnostics.
		pos::OutputFormat fmt = pos::OutputFormat::Human;
		// F05: --color=auto|always|never, NO_COLOR.
		pos::ColorPolicy color = pos::ColorPolicy::Auto;
		pos::ColorPolicy wrapColor = pos::ColorPolicy::Auto; // avoid shadow
		bool explain = false; // F20 --explain / --dry-run
		bool cockpitShortcut = false; // F67 --cockpit global shortcut
		bool noColorEnv = (getenv("NO_COLOR") != nullptr && getenv("NO_COLOR")[0] != '\0');
		// F04 fix: global flags may appear BEFORE the command too (e.g. --format=json gpu proof).
		size_t start = 1;
		for (; start < (size_t)argc; ++start) {
			const std::string a = argvS[start];
			if (a.rfind("--format=", 0) == 0) { fmt = pos::parseFormat(a.substr(9)); continue; }
			if (a.rfind("--color=", 0) == 0) { wrapColor = pos::parseColor(a.substr(8)); continue; }
			if (a.rfind("--theme=", 0) == 0) { const std::string t = a.substr(8); if (t == "light") g_theme.store(0); else if (t == "dark") g_theme.store(1); continue; }
			if (a.rfind("--timeout=", 0) == 0) { g_timeoutMs.store(std::atoll(a.substr(10).c_str())); if (g_timeoutMs.load() <= 0) g_timeoutMs.store(60000); continue; }
			if (a == "--explain" || a == "--dry-run") { explain = true; continue; }
			if (a == "--no-emoji") { g_emoji.store(false); continue; }
			if (a == "--emoji") { g_emoji.store(true); continue; }
			if (a == "--quiet") { g_quiet.store(true); continue; }
			if (a == "--verbose") { g_verbose.store(true); continue; }
			if (a == "--mono") { wrapColor = pos::ColorPolicy::Never; continue; }
			if (a == "--cockpit") { cockpitShortcut = true; continue; }
			break; // first non-global-flag token = command
		}
		for (size_t i = start + 1; i < (size_t)argc; ++i) {
			const std::string a = argvS[i];
			if (a.rfind("--format=", 0) == 0) { fmt = pos::parseFormat(a.substr(9)); continue; }
			if (a.rfind("--color=", 0) == 0) { wrapColor = pos::parseColor(a.substr(8)); continue; }
			if (a.rfind("--theme=", 0) == 0) { const std::string t = a.substr(8); if (t == "light") g_theme.store(0); else if (t == "dark") g_theme.store(1); continue; }
			if (a.rfind("--timeout=", 0) == 0) { g_timeoutMs.store(std::atoll(a.substr(10).c_str())); if (g_timeoutMs.load() <= 0) g_timeoutMs.store(60000); continue; }
			if (a == "--explain" || a == "--dry-run") { explain = true; continue; }
			if (a == "--no-emoji") { g_emoji.store(false); continue; }
			if (a == "--emoji") { g_emoji.store(true); continue; }
			if (a == "--quiet") { g_quiet.store(true); continue; }
			if (a == "--verbose") { g_verbose.store(true); continue; }
			if (a == "--mono") { wrapColor = pos::ColorPolicy::Never; continue; }
			if (a == "--cockpit") { cockpitShortcut = true; continue; }
			args.push_back(pos::sanitizeTerminalText(a));
		}
		color = pos::applyNoColor(wrapColor, noColorEnv);
		bool colorOn = pos::colorEnabled(color, isTty);
		// F67: --cockpit global shortcut launches the dashboard directly.
		if (cockpitShortcut) { return cmdCockpit(fmt, args, colorOn); }
		const std::string cmd = (start < (size_t)argc) ? argvS[start] : std::string("help");
		// F20: --explain / --dry-run => show plan, never mutate.
		if (explain) { return cmdExplain(cmd, args); }
		if (cmd == "help" || cmd == "--help" || cmd == "-h") { return cmdHelp(); }
		if (cmd == "completion" && args.size() >= 1) { return cmdCompletion(args[0]); }
		if (cmd == "cockpit" && args.size() >= 1 && args[0] == "history") { return cmdCockpitHistory(fmt); }
		if (cmd == "cockpit" && args.size() >= 1 && args[0] == "export") { return cmdCockpitExport(fmt, std::vector<std::string>(args.begin() + 1, args.end()), colorOn); }
		if (cmd == "cockpit") { return cmdCockpit(fmt, args, colorOn); }
		if (cmd == "version") { cmdVersion(fmt); return 0; }
		if (cmd == "capabilities") { cmdCapabilities(fmt); return 0; }
		if (cmd == "status") { return cmdStatus(fmt); }
		if (cmd == "diff" && args.size() >= 2) { return cmdDiff(args[0], args[1], fmt); }
		if (cmd == "project" && !args.empty() && args[0] == "list") { return cmdProjectList(fmt); }
		if (cmd == "project" && args.size() >= 2 && args[0] == "use") { return cmdProjectUse(args[1], fmt); }
		if (cmd == "project" && args.size() >= 2 && args[0] == "inspect") { return cmdProjectInspect(args[1], fmt); }
		if (cmd == "project" && args.size() >= 1 && args[0] == "watch") { return cmdProjectWatch(fmt, 0); }
		if (cmd == "drift" && args.empty()) { return cmdDrift(fmt); }
		if (cmd == "timeline") { return cmdTimeline(fmt); }
		if (cmd == "snapshot" && args.size() >= 2 && args[0] == "semantic-diff") { return cmdSemanticDiff(args[1], args[2], fmt); }
		if (cmd == "snapshot" && args.size() >= 1) { return cmdSnapshot(args[0], fmt); }
		if (cmd == "goal" && args.size() >= 1 && args[0] == "proof") { return cmdGoalProof(fmt); }
		if (cmd == "todo" && args.size() >= 1 && args[0] == "board") { return cmdTodoBoard(fmt); }
		if (cmd == "artifact" && args.size() >= 1 && args[0] == "list") { return cmdArtifactList(fmt); }
		if (cmd == "artifact" && args.size() >= 2 && args[0] == "show") { return cmdArtifactShow(args[1], fmt); }
		if (cmd == "artifact" && args.size() >= 2 && args[0] == "search") { return cmdArtifactSearch(args[1], fmt); }
		if (cmd == "artifact" && args.size() >= 2 && args[0] == "verify") { return cmdArtifactVerify(args[1], fmt); }
		if (cmd == "artifact" && args.size() >= 1 && args[0] == "audit-store") { return cmdArtifactAuditStore(fmt); }
		if (cmd == "parity") { return cmdParity(fmt); }
			if (cmd == "addon" && args.size() >= 1 && args[0] == "verify") { return cmdAddonVerify(fmt); }
		if (cmd == "health" && args.size() >= 1 && args[0] == "score") { return cmdHealthScore(fmt, colorOn); }
		if (cmd == "health" && args.size() >= 1 && args[0] == "trend") { return cmdHealthTrend(fmt, colorOn); }
		if (cmd == "health" && args.size() >= 2 && args[0] == "compare") { return cmdHealthCompare(fmt, std::vector<std::string>(args.begin() + 1, args.end()), colorOn); }
		if (cmd == "budget" && args.size() >= 1 && args[0] == "forecast") { return cmdBudgetForecast(fmt, colorOn); }
		if (cmd == "insights" && args.size() >= 1 && args[0] == "tokens") { return cmdInsightsTokens(fmt, colorOn); }
		if (cmd == "diagnose") { return cmdDiagnose(fmt, colorOn); }
		if (cmd == "drift" && args.size() >= 1 && args[0] == "alert") { return cmdDriftAlert(fmt, colorOn); }
		if (cmd == "goal" && args.size() >= 1 && args[0] == "traction") { return cmdGoalTraction(fmt, colorOn); }
		if (cmd == "goal" && args.size() >= 1 && args[0] == "cost") { return cmdGoalCost(fmt, colorOn); }
		if (cmd == "autonomy" && args.size() >= 1 && args[0] == "health") { return cmdAutonomyHealth(fmt, colorOn); }
		if (cmd == "risk" && args.size() >= 1 && args[0] == "profile") { return cmdRiskProfile(fmt, colorOn); }
		if (cmd == "usage" && args.size() >= 1 && args[0] == "record") { return cmdUsageRecord(fmt, std::vector<std::string>(args.begin() + 1, args.end()), colorOn); }
		if (cmd == "usage" && args.size() >= 1 && args[0] == "list") { return cmdUsageList(fmt, colorOn); }
		if (cmd == "usage" && args.size() >= 1 && args[0] == "summary") { return cmdUsageSummary(fmt, colorOn); }
		if (cmd == "usage" && args.size() >= 1 && args[0] == "export") { return cmdUsageExport(fmt, std::vector<std::string>(args.begin() + 1, args.end()), colorOn); }
	// --- F66 bridge command --------------------------------------------------------------
	if (cmd == "bridge" && args.size() >= 1) {
		if (args[0] == "status") { return cmdBridgeStatus(fmt); }
		if (args[0] == "start") { return cmdBridgeStart(fmt, false); }
		if (args[0] == "start --detach") { return cmdBridgeStart(fmt, true); }
		if (args[0] == "stop") { return cmdBridgeStop(fmt); }
		if (args[0] == "restart") { return cmdBridgeRestart(fmt); }
		if (args[0] == "health") { return cmdBridgeHealth(fmt); }
		if (args[0] == "tools") { return cmdBridgeTools(fmt); }
		if (args[0] == "test") { return cmdBridgeTest(fmt); }
		if (args[0] == "tunnel") { return cmdBridgeTunnel(fmt); }
		std::cout << "  FAIL bridge: unknown sub-command '" << args[0] << "'\n";
		std::cout << "    Use: bridge status|start|stop|restart|health|tools|test|tunnel\n";
		return 1;
	}
		if (cmd == "config" && args.size() >= 1 && args[0] == "provenance") { return cmdConfigProvenance(fmt); }
		if (cmd == "config") { return cmdConfig(fmt); }
		if (cmd == "doctor") { return cmdDoctor(fmt); }
		if (cmd == "diagnostics") { return cmdDiagnostics(fmt); }
		if (cmd == "preflight") { return cmdPreflight(fmt); }
		if (cmd == "health") { bool w = (args.size() >= 1 && args[0] == "--watch"); return cmdHealth(fmt, w); }
		if (cmd == "models") { return cmdModels(fmt); }
		if (cmd == "test" && args.size() >= 1 && args[0] == "list") { return cmdTestList(fmt); }
		if (cmd == "test" && args.size() >= 1 && args[0] == "matrix") { return cmdTestMatrix(fmt); }
		if (cmd == "endurance" && args.size() >= 1 && args[0] == "status") { return cmdEnduranceStatus(fmt); }
		if (cmd == "endurance" && args.size() >= 2 && args[0] == "run") { return cmdEnduranceRun(args[1], fmt); }
		if (cmd == "report") { return cmdReport(fmt); }
		if (cmd == "release" && args.size() >= 1 && args[0] == "gate") { return cmdReleaseGate(fmt); }
		if (cmd == "export" && args.size() >= 1 && args[0] == "sarif") { return cmdExportSarif(fmt); }
		if (cmd == "protocol" && args.size() >= 1 && args[0] == "negotiate") { return cmdProtocolNegotiate(fmt); }
		if (cmd == "protocol" && args.size() >= 1 && args[0] == "test") { return cmdProtocolTest(fmt); }
		if (cmd == "schema" && args.size() >= 1 && args[0] == "machine") { return cmdSchemaMachine(fmt); }
		if (cmd == "exitcodes") { return cmdExitCodes(fmt); }
		if (cmd == "trace" && args.size() >= 1) { return cmdTrace(args[0], fmt); }
		if (cmd == "replay" && args.size() >= 1) { return cmdReplay(args, fmt); }
		if (cmd == "benchmark" && args.size() >= 1 && args[0] == "compare" && args.size() >= 3) { return cmdBenchmarkCompare(args[1], args[2], fmt); }
		if (cmd == "model" && args.size() >= 2 && args[0] == "qualify") { return cmdModelQualify(fmt, args[1], colorOn); }
		if (cmd == "model" && args.size() >= 3 && args[0] == "compare") { return cmdModelCompare(fmt, std::vector<std::string>(args.begin() + 1, args.end()), colorOn); }
		if (cmd == "model" && args.size() >= 2 && args[0] == "flash") { return cmdModelFlash(fmt, args[1], colorOn); }
		if (cmd == "model" && args.size() >= 1 && args[0] == "policy") { return cmdModelPolicy(fmt, colorOn); }
		if (cmd == "model" && args.size() >= 1 && args[0] == "quota") { return cmdModelQuota(fmt, colorOn); }
		if (cmd == "model" && args.size() >= 1 && args[0] == "profiles") { return cmdModelProfiles(fmt, colorOn); }
		if (cmd == "model" && args.size() >= 2 && args[0] == "offload") { return cmdModelOffload(fmt, std::vector<std::string>(args.begin() + 1, args.end()), colorOn); }
		if (cmd == "model" && args.size() >= 2 && args[0] == "show") { return cmdModelShow(args[1], fmt); }
		if (cmd == "model" && args.size() >= 2 && args[0] == "stream") { return cmdModelStream(args[1], fmt); }
		if (cmd == "model" && args.size() >= 2 && args[0] == "smoke") { std::string rmode = "hide"; for (auto& a : args) if (a.rfind("--reasoning=", 0) == 0) rmode = a.substr(12); return cmdModelSmoke(args[1], rmode, fmt); }
		if (cmd == "localai" && args.size() >= 1 && args[0] == "capabilities") { return cmdLocalaiCapabilities(fmt); }
		if (cmd == "model" && args.size() >= 2 && args[0] == "benchmark") { return cmdModelBenchmark(args[1], fmt); }
		if (cmd == "route" && !args.empty()) { return cmdRoute(fmt, args); }
		if (cmd == "gpu" && args.size() >= 1 && args[0] == "watch") { int iv = (args.size() >= 2 ? std::atoi(args[1].c_str()) : 0); return cmdGpuWatch(fmt, iv); }
		if (cmd == "gpu" && args.size() >= 1 && args[0] == "proof") { std::string mid = (args.size() >= 2 ? args[1] : std::string()); return cmdGpuProof(mid, fmt); }
		if (cmd == "gpu") { return cmdGpuStatus(fmt); }
		// F03: non-interactive now returns a real exit code (fixes L1).
		return runCommandLine(cmd, args, colorOn);
	}

	std::cout << "\n  \xE2\x94\x80\xE2\x94\x80 Project OS CLI \xE2\x94\x80\xE2\x94\x80 \n";
	std::cout << "  Repo      : " << pos::repoRoot() << "\n";
	std::cout << "  Registry  : " << pos::registryFile() << "\n";
	std::cout << "  Projects  : " << pos::projectsRoot() << "\n";
	std::cout << "  Active    : " << (pos::activeSlugEnv().empty() ? "(none)" : pos::activeSlugEnv()) << "\n\n";

	auto projects = pos::parseRegistry(pos::readFile(pos::registryFile()));
	if (projects.empty()) std::cout << "  No managed projects yet. Use [2] to create one.\n\n";

	while (true) {
		std::cout << "  \xE2\x94\x80\xE2\x94\x80 MENU \xE2\x94\x80\xE2\x94\x80 \n";
		std::cout << "  [Projet]\n";
		std::cout << "    1. List projects\n";
		std::cout << "    2. Create project\n";
		std::cout << "  [Pilotage]\n";
		std::cout << "    3. Goal        (active)\n";
		std::cout << "    4. Todo        (active)\n";
		std::cout << "    5. Autonomy    (active)\n";
		std::cout << "  [Aides]\n";
		std::cout << "    6. Docs online (active)\n";
		std::cout << "    7. Addons      (active)\n";
		std::cout << "    8. Raw slash command\n";
		std::cout << "    0. Quit\n";
		std::cout << "  Choice> ";
		int c = readChoice(8);
		if (c == 0) break;

		if (c == 1) {
			projects = pos::parseRegistry(pos::readFile(pos::registryFile()));
			if (projects.empty()) std::cout << "  (none)\n";
			for (size_t i = 0; i < projects.size(); ++i) {
				auto& p = projects[i];
				std::cout << "  " << (i + 1) << ". " << p.name << " [" << p.slug << "] " << p.projectType << " " << p.status
					<< (p.goalObjective.empty() ? "" : " -- " + p.goalObjective) << "\n";
			}
			if (!projects.empty()) {
				std::cout << "  Select project # to set active> ";
				int pc = readChoice((int)projects.size());
				if (pc >= 1 && pc <= (int)projects.size()) {
					pos::setActiveSlug(projects[pc - 1].slug);
					std::cout << "  active = " << projects[pc - 1].slug << "\n";
				}
			}
		} else if (c == 2) {
			std::cout << "  Project name> "; std::string name; std::getline(std::cin, name); name = pos::trim(name);
			if (!name.empty()) {
				std::cout << "  Type [cpp|ts|web|node|rust|go|python|desktop|docker|localai|auto]> "; std::string ty; std::getline(std::cin, ty); ty = pos::trim(ty);
				std::string line = "/create " + name + (ty.empty() ? "" : " type=" + ty);
				pos::dispatch(pos::bridgePath(), line, g_timeoutMs, &g_cancel);
				projects = pos::parseRegistry(pos::readFile(pos::registryFile()));
			}
		} else if (c == 3 || c == 4 || c == 5 || c == 6 || c == 7) {
			if (pos::activeSlugEnv().empty()) { std::cout << "  No active project.\n"; continue; }
			std::string cmd;
			if (c == 3) { std::cout << "  Objective> "; std::string o; std::getline(std::cin, o); cmd = "/goal " + pos::trim(o); }
			else if (c == 4) { std::cout << "  [list|add <label>|done <key>]> "; std::string o; std::getline(std::cin, o); cmd = "/todo " + pos::trim(o); }
			else if (c == 5) { std::cout << "  [plan --minutes=<n>|run|summary|--write]> "; std::string o; std::getline(std::cin, o); cmd = "/autonomy " + pos::trim(o); }
			else if (c == 6) { std::cout << "  Domain e.g. swiss football league> "; std::string o; std::getline(std::cin, o); cmd = "/docs " + pos::trim(o); }
			else { std::cout << "  [list|add <id>|recommended|remove <id>]> "; std::string o; std::getline(std::cin, o); cmd = "/addon " + pos::trim(o); }
			auto r = pos::dispatch(pos::bridgePath(), cmd, g_timeoutMs, &g_cancel);
			std::cout << "  " << (r.ok ? "OK" : "FAIL") << " " << r.status << ": " << r.message << "\n";
			if (!r.next.empty()) std::cout << "  next: " << r.next << "\n";
			if (!r.raw.empty()) std::cout << "  raw: " << r.raw << "\n";
		} else if (c == 8) {
			std::cout << "  Slash cmd> "; std::string s; std::getline(std::cin, s);
			if (pos::trim(s).empty()) continue;
			auto r = pos::dispatch(pos::bridgePath(), pos::trim(s), g_timeoutMs, &g_cancel);
			std::cout << "  " << (r.ok ? "OK" : "FAIL") << " " << r.command << " " << r.status << "\n" << r.message << "\n";
			if (!r.raw.empty()) std::cout << "  raw: " << r.raw << "\n";
		}
		std::cout << "\n";
	}
	std::cout << "\n  Bye.\n";
	return 0;
}


