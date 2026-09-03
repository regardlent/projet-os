// test_pos.cpp — unit tests for the Project OS CLI JSON parser + model helpers.
#include <cassert>
#include <chrono>
#include <iostream>
#include <string>
#include "pos_model.hpp"
#include "pos_json.hpp"
#include "pos_exitcodes.hpp"
#include "pos_output.hpp"
#include "pos_terminal.hpp"
#include "pos_process.hpp"
#include "pos_protocol.hpp"
#include "pos_runner.hpp"

using pos::JKind;
using pos::parseJson;

static int failures = 0;
#define CHECK(cond) do { if (!(cond)) { std::cerr << "FAIL: " << #cond << " @ " << __LINE__ << "\n"; ++failures; } else { std::cout << "ok  : " << #cond << "\n"; } } while (0)

static void testJsonBasics() {
	auto v = parseJson(R"({"a":1,"b":"txt","c":[1,2,3],"d":{"x":true},"e":null,"f":-2.5})");
	CHECK(v.kind == JKind::Object);
	CHECK(v.get("a")->number == 1);
	CHECK(v.get("b")->asString() == "txt");
	CHECK(v.get("c")->kind == JKind::Array);
	CHECK(v.get("c")->arr.size() == 3);
	CHECK(v.get("d")->get("x")->boolean);
	CHECK(v.get("e")->kind == JKind::Null);
	CHECK(v.get("f")->number == -2.5);
}

static void testJsonStringEscapes() {
	auto v = parseJson(R"({"s":"a\nb\"c\td"})");
	CHECK(v.get("s")->asString() == "a\nb\"c\td");
}

static void testParseRegistry() {
	std::string json = R"({"projects":[{"slug":"demo","name":"Demo","projectId":"p1","projectType":"cpp","status":"READY","workspaceRoot":"C:\\ws","goal":{"objective":"Observe","status":"ACTIVE","progress":90}}]})";
	auto list = pos::parseRegistry(json);
	CHECK(list.size() == 1);
	CHECK(list[0].slug == "demo");
	CHECK(list[0].projectType == "cpp");
	CHECK(list[0].goalProgress == 90);
	CHECK(list[0].goalObjective == "Observe");
}

static void testParseGoalAndTodo() {
	auto g = pos::parseGoal(R"({"status":"ACTIVE","objective":"Thing","progress":50})");
	CHECK(g.status == "ACTIVE");
	CHECK(g.progress == 50);
	auto t = pos::parseTodo(R"({"items":[{"key":"a","label":"A","state":"done"},{"key":"b","label":"B","state":"pending"}]})");
	CHECK(t.size() == 2);
	CHECK(t[0].done());
	CHECK(!t[1].done());
}

static void testShellQuote() {
	CHECK(pos::shellQuote("abc def") == "\"abc def\"");
	CHECK(pos::shellQuote("a\"b") == "\"a\\\"b\"");
}

// F02: parses a v2 capabilities envelope (commands array + features object).
static void testCapabilitiesParse() {
	std::string json = R"({"protocol":2,"ok":true,"status":"CAPABILITIES","result":{"command":"capabilities","ok":true,"protocol":2,"protocolsSupported":[2,3],"commands":["goal","create","todo"],"features":{"gpu":true,"budget":false,"endurance":true},"outputModes":["human","json"],"message":"capabilities: protocol=2"}})";
	auto root = pos::parseJson(json);
	CHECK(root.get("protocol")->number == 2);
	auto* res = root.get("result");
	CHECK(res != nullptr && res->kind == pos::JKind::Object);
	// commands array
	auto* cmds = res->get("commands");
	CHECK(cmds != nullptr && cmds->kind == pos::JKind::Array && cmds->arr.size() == 3);
	CHECK(cmds->arr[0].asString() == "goal");
	// features object: only boolean-true keys are surfaced as enabled
	auto* feats = res->get("features");
	CHECK(feats != nullptr && feats->kind == pos::JKind::Object);
	CHECK(feats->get("gpu")->boolean == true);
	CHECK(feats->get("budget")->boolean == false);
	CHECK(feats->get("endurance")->boolean == true);
	// protocolsSupported array of ints
	auto* ps = res->get("protocolsSupported");
	CHECK(ps != nullptr && ps->kind == pos::JKind::Array && ps->arr.size() == 2);
	CHECK(static_cast<int>(ps->arr[1].number) == 3);
}

// F03: exit code taxonomy mapping (no error ever maps to 0).
static void testExitCodes() {
	CHECK(pos::exitFor(true, "READY") == 0);
	CHECK(pos::exitFor(false, "UNKNOWN_COMMAND") == 2);
	CHECK(pos::exitFor(false, "NAME_REQUIRED") == 2);
	CHECK(pos::exitFor(false, "BRIDGE_ERROR") == 3);
	CHECK(pos::exitFor(false, "PROTOCOL_ERROR") == 7);
	CHECK(pos::exitFor(false, "SECURITY_BLOCKED") == 6);
	CHECK(pos::exitFor(false, "NOT_FOUND") == 1);
	CHECK(pos::exitFor(false, "ANYTHING_ELSE") == 1);
	// F54 extended taxonomy.
	CHECK(pos::exitFor(false, "BLOCKED_GPU") == 9);
	CHECK(pos::exitFor(false, "GPU_BLOCKED") == 9);
	CHECK(pos::exitFor(false, "LOCALAI_UNAVAILABLE") == 8);
	CHECK(pos::exitFor(false, "TEST_FAILURE") == 10);
	CHECK(pos::exitFor(false, "RELEASE_BLOCKED") == 11);
	CHECK(pos::exitFor(false, "CANCELLED") == 4);
	// exitNames has 13 entries covering 0..12.
	auto names = pos::exitNames();
	CHECK(names.size() == 13);
	CHECK(names[0].first == 0 && names[0].second == "SUCCESS");
	CHECK(names[12].first == 12 && names[12].second == "INTERNAL_ERROR");
}

// F04: output format parsing.
static void testOutputFormat() {
	CHECK(pos::parseFormat("json") == pos::OutputFormat::Json);
	CHECK(pos::parseFormat("ndjson") == pos::OutputFormat::Ndjson);
	CHECK(pos::parseFormat("tsv") == pos::OutputFormat::TsV);
	CHECK(pos::parseFormat("human") == pos::OutputFormat::Human);
	CHECK(pos::parseFormat("unknown") == pos::OutputFormat::Human);
	CHECK(pos::json_quote("a\"b") == "\"a\\\"b\"");
	CHECK(pos::json_quote("line\n") == "\"line\\n\"");
}

// F05: color + terminal policy + sanitization.
static void testTerminal() {
	CHECK(pos::parseColor("always") == pos::ColorPolicy::Always);
	CHECK(pos::parseColor("never") == pos::ColorPolicy::Never);
	CHECK(pos::parseColor("auto") == pos::ColorPolicy::Auto);
	CHECK(pos::parseColor("junk") == pos::ColorPolicy::Auto);
	CHECK(pos::applyNoColor(pos::ColorPolicy::Auto, true) == pos::ColorPolicy::Never);
	CHECK(pos::applyNoColor(pos::ColorPolicy::Always, true) == pos::ColorPolicy::Always);
	CHECK(pos::colorEnabled(pos::ColorPolicy::Always, false) == true);
	CHECK(pos::colorEnabled(pos::ColorPolicy::Never, true) == false);
	CHECK(pos::colorEnabled(pos::ColorPolicy::Auto, true) == true);
	CHECK(pos::colorEnabled(pos::ColorPolicy::Auto, false) == false);
	// sanitize removes ESC/BEL/C0 but keeps printable + tab/newline
	CHECK(pos::sanitizeTerminalText("a\x1b[31mb") == "a[31mb");
	CHECK(pos::sanitizeTerminalText(std::string("a\x07") + "b") == "ab"); // BEL (0x07) removed
	CHECK(pos::sanitizeTerminalText("a\nb\tc\rd") == "a\nb\tc\rd");
	CHECK(pos::sanitizeTerminalText("plain") == "plain");
}

// F06: UTF-16 <-> UTF-8 incl. emoji surrogates.
static void testUnicode() {
	std::string u8;
	// "Aé中🚀" encoded; verify round-trip and surrogate handling.
	const unsigned short u16[] = { 0x0041, 0x00E9, 0x4E2D, 0xD83D, 0xDE80, 0 }; // A é 中 🚀
	CHECK(pos::utf16ToUtf8(u16, u8));
	CHECK(u8.size() == 1 + 2 + 3 + 4); // A(1) é(2) 中(3) 🚀(4) = 10 bytes
	std::wstring back;
	CHECK(pos::utf8ToUtf16(u8, back));
	CHECK(back.size() == 5);
	CHECK(back[0] == 0x0041 && back[3] == 0xD83D && back[4] == 0xDE80);
	// invalid lone surrogate rejected
	const unsigned short bad[] = { 0xD800, 0x0041, 0 };
	CHECK(!pos::utf16ToUtf8(bad, u8));
}

// F07/F08: ProcessRunner (CreateProcessW, no shell) + timeout.
static void testProcess() {
	// quoteArg MSVCRT: no-op for simple args; escapes spaces/quotes.
	CHECK(pos::quoteArg(L"abc") == L"abc");
	CHECK(pos::quoteArg(L"a b") == L"\"a b\"");
	CHECK(pos::quoteArg(L"a\"b") == L"\"a\\\"b\"" );
	// buildCommandLine quotes the exe + each arg.
	CHECK(pos::buildCommandLine(L"node", { L"a b" }) == L"node \"a b\"");
	// Timeout: run "node -e" that sleeps 5s with a 500ms timeout => times out.
	pos::ProcessSpec spec;
	spec.executable = L"node";
	spec.args = { L"-e", L"setTimeout(()=>{}, 5000)" };
	spec.timeoutMs = 500;
	spec.captureStdout = true;
	spec.captureStderr = true;
	pos::ProcessResult pr = pos::runProcess(spec);
	CHECK(pr.timedOut == true);
	// No timeout: a fast "node -e" completes and exits 0.
	pos::ProcessSpec fast;
	fast.executable = L"node";
	fast.args = { L"-e", L"console.log('hi')" };
	fast.timeoutMs = 5000;
	fast.captureStdout = true;
	fast.captureStderr = true;
	pos::ProcessResult fr = pos::runProcess(fast);
	CHECK(fr.timedOut == false);
	CHECK(fr.exitCode == 0);
	// Non-zero exit is reported as the actual code.
	pos::ProcessSpec fail;
	fail.executable = L"node";
	fail.args = { L"-e", L"process.exit(7)" };
	fail.timeoutMs = 5000;
	fail.captureStdout = true;
	fail.captureStderr = true;
	pos::ProcessResult f = pos::runProcess(fail);
	CHECK(f.timedOut == false && f.exitCode == 7);
	// Missing/unresolvable executable => started=false (no crash, honest signal).
	pos::ProcessSpec missing;
	missing.executable = L"no_such_exe_xyz";
	missing.timeoutMs = 2000;
	missing.captureStdout = true;
	pos::ProcessResult m = pos::runProcess(missing);
	CHECK(m.started == false);
	// Bounded output: a large stream completes without hanging.
	pos::ProcessSpec big;
	big.executable = L"node";
	big.args = { L"-e", L"let s=''; for(let i=0;i<200000;i++){s+='x';} console.log(s);" };
	big.timeoutMs = 8000;
	big.captureStdout = true;
	big.captureStderr = true;
	pos::ProcessResult bg = pos::runProcess(big);
	CHECK(bg.timedOut == false);
	CHECK(bg.out.size() == 200000 + 1); // 200k chars + newline
}

// F10: bridge protocol v2 schema validation.
static void testProtocol() {
	// Valid envelope.
	std::string good = R"({"protocol":2,"requestId":"r","ok":true,"status":"READY","result":{"command":"docs","ok":true,"status":"NAV","message":"m"},"timingMs":3,"errors":[]})";
	auto g = pos::parseJson(good);
	bool hp=false; int proto=0; bool ok=false; std::string st, reason;
	CHECK(pos::validateEnvelope(g, hp, proto, ok, st, reason) == true);
	CHECK(proto == 2 && ok == true && st == "READY");
	// Missing protocol.
	std::string noproto = R"({"ok":true,"status":"READY","result":{}})";
	auto a = pos::parseJson(noproto);
	CHECK(pos::validateEnvelope(a, hp, proto, ok, st, reason) == false);
	CHECK(reason.find("protocol") != std::string::npos);
	// ok not a boolean.
	std::string badok = R"({"protocol":2,"ok":"yes","status":"READY","result":{}})";
	auto b = pos::parseJson(badok);
	CHECK(pos::validateEnvelope(b, hp, proto, ok, st, reason) == false);
	// result must be an object.
	std::string nores = R"({"protocol":2,"ok":true,"status":"READY"})";
	auto c = pos::parseJson(nores);
	CHECK(pos::validateEnvelope(c, hp, proto, ok, st, reason) == false);
	CHECK(reason.find("result") != std::string::npos);
}

// F51: protocol negotiation — computes the selected protocol from client/server sets.
static void testNegotiate() {
	// Both [2,3] -> select 3.
	{ auto n = pos::negotiateProtocol({2,3}, {2,3}); CHECK(n.compatible && n.selectedProtocol == 3); }
	// Server v2 only -> select 2 (explicit, compatible).
	{ auto n = pos::negotiateProtocol({2,3}, {2}); CHECK(n.compatible && n.selectedProtocol == 2); }
	// Server v3 only -> select 3.
	{ auto n = pos::negotiateProtocol({2,3}, {3}); CHECK(n.compatible && n.selectedProtocol == 3); }
	// No common -> incompatible (no silent downgrade).
	{ auto n = pos::negotiateProtocol({2}, {3}); CHECK(!n.compatible && n.selectedProtocol == 0); }
	// Client offers v3 only, server v2 -> incompatible.
	{ auto n = pos::negotiateProtocol({3}, {2}); CHECK(!n.compatible); }
}

// F52: machine contract v2 — contract JSON + validation of required fields.
static void testMachineContract() {
	std::string c = pos::machineContractJson();
	// Contract JSON is parseable and has the required shape.
	auto root = pos::parseJson(c);
	CHECK(root.get("schemaVersion")->number == 2);
	CHECK(root.get("version")->asString() == "v2");
	// Valid reference machine doc passes validation.
	std::string okDoc = "{\"schemaVersion\":2,\"command\":\"status\",\"requestId\":\"r\",\"status\":\"OK\",\"data\":{},\"warnings\":[],\"errors\":[],\"timing\":{\"totalMs\":1},\"exitCode\":0,\"noAnsi\":true}";
	CHECK(pos::validateMachineContract(okDoc));
	// Missing required field -> invalid.
	std::string missCmd = "{\"schemaVersion\":2,\"requestId\":\"r\",\"status\":\"OK\",\"timing\":{}}";
	CHECK(!pos::validateMachineContract(missCmd));
	// noAnsi false -> invalid (machine output must be plain text).
	std::string ansi = "{\"schemaVersion\":2,\"command\":\"x\",\"requestId\":\"r\",\"status\":\"OK\",\"timing\":{},\"noAnsi\":false}";
	CHECK(!pos::validateMachineContract(ansi));
	// Malformed JSON -> invalid.
	CHECK(!pos::validateMachineContract("not-json"));
}

// F53: bridge compatibility self-test — field-level validation of a v2 envelope.
static void testBridgeCompat() {
	// Valid real envelope -> all checks pass.
	std::string good = R"({"protocol":2,"requestId":"r1","ok":true,"status":"CAPABILITIES","result":{},"timingMs":3,"errors":[]})";
	auto root = pos::parseJson(good);
	auto checks = pos::bridgeCompatibilityCheck(root);
	CHECK(pos::bridgeCompatibleAll(checks));
	CHECK(checks.size() >= 7); // protocol/ok/status/result/requestId/timingMs/errors
	// Missing status -> fail.
	std::string nost = R"({"protocol":2,"requestId":"r","ok":true,"result":{},"timingMs":3,"errors":[]})";
	auto r2 = pos::parseJson(nost);
	auto ch2 = pos::bridgeCompatibilityCheck(r2);
	CHECK(!pos::bridgeCompatibleAll(ch2));
	// protocol < 2 -> fail (version-check).
	std::string old = R"({"protocol":1,"ok":true,"status":"X","result":{},"timingMs":1,"errors":[]})";
	auto r3 = pos::parseJson(old);
	auto ch3 = pos::bridgeCompatibilityCheck(r3);
	CHECK(!pos::bridgeCompatibleAll(ch3));
}

// F23..F38: pure decode of bridge JSON through parseCmdResult (refactored from dispatch).
static void testParseDecodes() {
	using pos::parseCmdResult;
	// F23 artifact list.
	{
		std::string j = R"({"protocol":2,"requestId":"r","ok":true,"status":"LIST","result":{"items":[{"id":"a1","type":"test","size":123}]},"timingMs":1,"errors":[]})";
		auto r = parseCmdResult(j);
		CHECK(r.ok && r.artifactId.empty());
		CHECK(r.artifactList.size() == 1);
		CHECK(r.artifactList[0].id == "a1" && r.artifactList[0].type == "test" && r.artifactList[0].size == 123);
	}
	// F27 addon verify.
	{
		std::string j = R"({"protocol":2,"ok":true,"status":"ADDON","result":{"addons":[{"id":"core","status":"ENABLED"},{"id":"web","status":"DISABLED"}],"enabledCount":1},"timingMs":1,"errors":[]})";
		auto r = parseCmdResult(j);
		CHECK(r.addonIds.size() == 2 && r.addonStates.size() == 2);
		CHECK(r.addonIds[0] == "core" && r.addonStates[0] == "ENABLED");
		CHECK(r.addonEnabledCount == 1);
	}
	// F28 config kv (std::map -> keys are sorted alphabetically, so look up by key).
	{
		std::string j = R"({"protocol":2,"ok":true,"status":"CONFIG","result":{"config":{"providerBaseUrl":"http://127.0.0.1:8080/v1","protocol":2,"enabled":true}},"timingMs":1,"errors":[]})";
		auto r = parseCmdResult(j);
		CHECK(r.configKv.size() == 3);
		auto find = [&](const std::string& k) -> const std::string* { for (auto& kv : r.configKv) if (kv.first == k) return &kv.second; return nullptr; };
		CHECK(find("providerBaseUrl") != nullptr && *find("providerBaseUrl") == "http://127.0.0.1:8080/v1");
		CHECK(find("enabled") != nullptr && *find("enabled") == "true");
		CHECK(find("protocol") != nullptr && (std::stod(*find("protocol")) == 2.0));
	}
	// F31 preflight nested booleans + model id.
	{
		std::string j = R"({"protocol":2,"ok":true,"status":"PREFLIGHT","result":{"localAI":{"reachable":true},"workspace":{"ok":false},"gpu":{"available":true},"security":{"loopback":true},"model":"granite-4.2-3b-flash"},"timingMs":1,"errors":[]})";
		auto r = parseCmdResult(j);
		CHECK(r.pfLocalAI && !r.pfWorkspace && r.pfGpu && r.pfSecurity);
		CHECK(r.modelId == "granite-4.2-3b-flash");
	}
	// F33 models, F34 model show (kv with number/string/bool; keys already sorted).
	{
		std::string j = R"({"protocol":2,"ok":true,"status":"MODELS","result":{"items":[{"id":"m1","status":"UNKNOWN"}],"model":{"backend":"llama-cpp","context":8192,"flashReady":false}},"timingMs":1,"errors":[]})";
		auto r = parseCmdResult(j);
		CHECK(r.modelList.size() == 1 && r.modelList[0].id == "m1");
		CHECK(r.modelKv.size() == 3);
		auto find = [&](const std::string& k) -> const std::string* { for (auto& kv : r.modelKv) if (kv.first == k) return &kv.second; return nullptr; };
		CHECK(find("context") != nullptr && (std::stod(*find("context")) == 8192.0));
		CHECK(find("flashReady") != nullptr && *find("flashReady") == "false");
	}
	// F35 route + F36 smoke + F37 benchmark.
	{
		std::string j = R"({"protocol":2,"ok":true,"status":"SMOKE","result":{"chosen":"granite-4.2-3b-flash","reason":"best","taskClass":"CODING","http":200,"latencyMs":1300,"tokens":55,"content":"7","ttftMs":1317,"tokensPerSec":61,"runs":3},"timingMs":1,"errors":[]})";
		auto r = parseCmdResult(j);
		CHECK(r.routeChosen == "granite-4.2-3b-flash" && r.routeTaskClass == "CODING");
		CHECK(r.smokeHttp == 200 && r.smokeContent == "7");
		CHECK(r.smokeLatencyMs == 1317 && r.benchmarkTps == 61 && r.smokeTokens == 3);
	}
	// PROTOCOL_ERROR on malformed envelope (no result object).
	{
		std::string j = R"({"protocol":2,"ok":true,"status":"X"})";
		auto r = parseCmdResult(j);
		CHECK(!r.ok && r.status == "PROTOCOL_ERROR");
	}
	// Empty/garbage input => no crash, ok=false.
	{
		auto r = parseCmdResult("not json at all");
		CHECK(!r.ok);
	}
	// F41/F42 test matrix parse.
	{
		std::string j = R"({"protocol":2,"ok":true,"status":"TEST_MATRIX","result":{"tests":[{"suite":"cpp","pass":true,"count":1,"lastResult":"ALL PASS"},{"suite":"node","pass":true,"count":293,"lastResult":"293 tests passing"}],"passedSuites":2,"totalSuites":2},"timingMs":1,"errors":[]})";
		auto r = parseCmdResult(j);
		CHECK(r.testRows.size() == 2);
		CHECK(r.testRows[0].suite == "cpp" && r.testRows[0].pass && r.testRows[0].count == 1);
		CHECK(r.testRows[1].suite == "node" && r.testRows[1].pass && r.testRows[1].count == 293);
		CHECK(r.passedSuites == 2 && r.totalSuites == 2);
	}
	// F43/F44 endurance + benchmark decode.
	{
		std::string j = R"({"protocol":2,"ok":true,"status":"ENDURANCE","result":{"completedRungs":[5,10,20],"offloadProof":"PASS","model":"granite-4.2-3b-flash","gpu":"NVIDIA RTX 5060","vramDeltaFreeMiB":-3043,"verdict":"equal","a":{"source":"GPU_BENCHMARK","model":"granite-4.2-3b-flash","tokensPerSec":63,"ttftMs":379},"b":{"source":"GPU_OFFLOAD_PROOF","model":"granite-4.2-3b-flash","tokensPerSec":63,"ttftMs":379}},"timingMs":1,"errors":[]})";
		auto r = parseCmdResult(j);
		CHECK(r.completedRungs.size() == 3 && r.completedRungs[0] == 5 && r.completedRungs[2] == 20);
		CHECK(r.offloadProof == "PASS" && r.encModel == "granite-4.2-3b-flash");
		CHECK(r.encVramDeltaMiB == -3043);
		CHECK(r.bmVerdict == "equal" && r.bmA.tokensPerSec == 63 && r.bmB.ttftMs == 379);
	}
	// F45/F46 report + endurance run decode.
	{
		std::string j = R"({"protocol":2,"ok":false,"status":"BLOCKED_GPU","result":{"rung":30,"status":"BLOCKED_GPU","freeVramMiB":480,"requiredMiB":3100,"offloadProof":"PASS","model":"granite-4.2-3b-flash","tokens":{"input":19328,"output":55404,"total":74732},"cost":{"free":3,"localAI":"EXACT_ZERO"},"throughput":{"ttftMs":339,"tokensPerSec":70}},"timingMs":1,"errors":[]})";
		auto r = parseCmdResult(j);
		CHECK(!r.ok && r.status == "BLOCKED_GPU");
		CHECK(r.erRung == 30 && r.erStatus == "BLOCKED_GPU" && r.erFreeVramMiB == 480 && r.erRequiredMiB == 3100);
		CHECK(r.repTokensTotal == 74732 && r.repCostLocalAI == "EXACT_ZERO" && r.repTtftMs == 339 && r.repTps == 70);
	}
	// F47/F48 release gate + sarif decode.
	{
		std::string j = R"({"protocol":2,"ok":false,"status":"BLOCKED","result":{"ready":false,"passedNodes":8,"totalNodes":9,"findings":2},"timingMs":1,"errors":[]})";
		auto r = parseCmdResult(j);
		CHECK(!r.rgReady && r.rgPassed == 8 && r.rgTotal == 9);
		CHECK(r.sarifFindings == 2);
	}
}

// Regression: goal proof + project inspect field mapping (top-level goal*, todo array).
static void testParseInspectGoalProof() {
	// project inspect: result.todo array (no todoCount/todoDone) => derive counts.
	{
		std::string j = R"({"protocol":2,"ok":true,"status":"INSPECT","result":{"slug":"demo","goal":{"status":"ACTIVE","progress":40},"todo":[{"key":"a","state":"done"},{"key":"b","state":"pending"},{"key":"c","state":"done"}]},"timingMs":1,"errors":[]})";
		auto r = pos::parseCmdResult(j);
		CHECK(r.todoCount == 3 && r.todoDone == 2);
		CHECK(r.goalStatus == "ACTIVE" && r.goalProgress == 40);
	}
	// goal proof: top-level goalStatus/goalProgress/goalObjective (not nested) + criteria.
	{
		std::string j = R"({"protocol":2,"ok":true,"status":"GOAL_PROOF","result":{"goalStatus":"ACTIVE","goalProgress":55,"goalObjective":"Build a tool","criteria":["compiles","tests"]},"timingMs":1,"errors":[]})";
		auto r = pos::parseCmdResult(j);
		CHECK(r.goalStatus == "ACTIVE" && r.goalProgress == 55 && r.goalObjective == "Build a tool");
		CHECK(r.criteria.size() == 2 && r.criteria[0] == "compiles");
	}
}

// F04: json_quote must produce re-parseable JSON (escaping exact), and emitScalar
// JSON/NDJSON must not leak raw human text into stdout.
static void testFuzzProperty() {
	// 8.1 Property harness (portable, no external libFuzzer): feed many malformed/mutated
	// inputs to parseJson. Property: never crashes — either throws JsonParseError or returns.
	unsigned rng = 12345u;
	auto rnd = [&](unsigned n) { rng = rng * 1103515245u + 12345u; return (rng >> 16) % n; };
	const std::string alphabet = "{}[]:,\"'\\0123456789.abcdefghijklmnopqrstuvwxyz \t\n\r-+eE";
	const std::vector<std::string> seeds = { "{\"a\":1}", "[1,2,3]", "\"hi\"", "{}", "[]", "{\"k\":\"v\"}", "123", "null", "true", "{\"a\":{\"b\":[1,2,{\"c\":\"d\"}]}}" };
	bool crashed = false;
	for (int iter = 0; iter < 2000 && !crashed; ++iter) {
		std::string input = seeds[rnd(seeds.size())];
		int n = rnd(6);
		for (int i = 0; i < n; ++i) { size_t pos = rnd(input.size() + 1); char ch = alphabet[rnd(alphabet.size())]; if (pos < input.size()) input.insert(pos, 1, ch); else input.push_back(ch); }
		try { auto v = pos::parseJson(input); (void)v; } catch (const pos::JsonParseError&) {} catch (...) { crashed = true; }
	}
	CHECK(!crashed);
}

static void testJsonQuoteEmit() {
	// Regression: intelligence & analysis fields (score/grade/signal/rows/details).
	{
		std::string j = R"({"protocol":2,"ok":true,"status":"HEALTH","result":{"command":"health","score":87,"grade":"B","signal":"GOOD","rows":[{"k":"goal","v":"defined"},{"k":"todo","v":"1/2"}],"details":["note1","note2"]},"timingMs":1,"errors":[]})";
		auto r = pos::parseCmdResult(j);
		CHECK(r.score == 87 && r.grade == "B" && r.signal == "GOOD");
		CHECK(r.analysisKv.size() == 2 && r.analysisKv[0].first == "goal" && r.analysisKv[0].second == "defined");
		CHECK(r.details.size() == 2 && r.details[1] == "note2");
	}
	// json_quote escapes double quote, backslash, control chars; round-trip parse.
	std::string q = pos::json_quote("he said \"hi\"\n\t\\");
	CHECK(q == "\"he said \\\"hi\\\"\\n\\t\\\\\"");
	auto back = pos::parseJson(q);
	CHECK(back.kind == JKind::String && back.asString() == "he said \"hi\"\n\t\\");
	// Control char < 0x20 becomes \u00xx.
	std::string ctl = pos::json_quote(std::string("\x01", 1));
	CHECK(ctl == "\"\\u0001\"");
	// Negative: _popen-style shell metacharacters are NOT interpreted by json_quote.
	std::string inj = pos::json_quote("a&b|c;d$e(f)");
	CHECK(inj == "\"a&b|c;d$e(f)\"");
	// Negative: control char BEL (0x07) is escaped, so no terminal injection.
	std::string bel = pos::json_quote(std::string("\x07", 1));
	CHECK(bel == "\"\\u0007\"");
}

// Phase 28: fuzz/security/stress — the parser must never crash on hostile input.
static void testConfigPrecedence() {
	// flag > env > default.
	CHECK(pos::prefer("flag", "env", "dflt") == "flag");
	CHECK(pos::prefer("", "env", "dflt") == "env");
	CHECK(pos::prefer("", "", "dflt") == "dflt");
	CHECK(pos::prefer("x", "", "dflt") == "x");
	CHECK(pos::prefer("", "y", "dflt") == "y");
}

static void testRedaction() {
	// Bearer token redacted, prefix preserved.
	std::string a = "Authorization: Bearer abc123def456";
	std::string ra = pos::redactSecret(a);
	CHECK(ra.find("abc123def456") == std::string::npos);
	CHECK(ra.find("Bearer ***") != std::string::npos);
	// sk- style key keeps first 4 chars + ***.
	std::string b = "key=sk-abcdefgh1234";
	std::string rb = pos::redactSecret(b);
	CHECK(rb.find("1234") == std::string::npos);
	CHECK(rb.find("abcd***") != std::string::npos);
	// Plain text untouched.
	std::string c = "hello world";
	CHECK(pos::redactSecret(c) == c);
}

static void testGoldenUnicode() {
	// Golden UTF-8 for box-drawing and status emojis used by the CLI cards.
	const unsigned short dash[] = { 0x2500, 0 }; // ─
	std::string d8; CHECK(pos::utf16ToUtf8(dash, d8)); CHECK(d8 == "\xE2\x94\x80");
	const unsigned short warn[] = { 0x26A0, 0 }; // ⚠
	std::string w8; CHECK(pos::utf16ToUtf8(warn, w8)); CHECK(w8 == "\xE2\x9A\xA0");
	const unsigned short okE[] = { 0x2705, 0 }; // ✅
	std::string o8; CHECK(pos::utf16ToUtf8(okE, o8)); CHECK(o8 == "\xE2\x9C\x85");
	const unsigned short xE[] = { 0x274C, 0 }; // ❌
	std::string x8; CHECK(pos::utf16ToUtf8(xE, x8)); CHECK(x8 == "\xE2\x9D\x8C");
	// Round-trip back.
	std::wstring back; CHECK(pos::utf8ToUtf16(o8, back)); CHECK(back.size() == 1 && back[0] == 0x2705);
}

static void testGoldenBudget() {
	// Deterministic golden thresholds of the budget model.
	CHECK(pos::budgetVerdict(0, 1000) == "FREE");
	CHECK(pos::budgetVerdict(0, 0) == "EXACT_ZERO");
	CHECK(pos::budgetVerdict(100, 0) == "EXACT_ZERO");
	CHECK(pos::budgetVerdict(100, 1000) == "OK");        // 0.10 < 0.5
	CHECK(pos::budgetVerdict(499, 1000) == "OK");        // 0.499 < 0.5
	CHECK(pos::budgetVerdict(500, 1000) == "WARN");      // 0.50 -> WARN
	CHECK(pos::budgetVerdict(899, 1000) == "WARN");      // 0.899 < 0.9
	CHECK(pos::budgetVerdict(900, 1000) == "BLOWN");     // 0.90 -> BLOWN
	CHECK(pos::budgetVerdict(1000, 1000) == "BLOWN");
}

static void testPerfBudget() {
	// Golden perf budget: big-array JSON parse completes fast and correctly (no OOM).
	std::string big = "[";
	for (int i = 0; i < 50000; ++i) { if (i) big += ","; big += std::to_string(i); }
	big += "]";
	const auto t0 = std::chrono::steady_clock::now();
	auto v = pos::parseJson(big);
	const auto t1 = std::chrono::steady_clock::now();
	double ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
	CHECK(v.kind == JKind::Array && v.arr.size() == 50000);
	CHECK(ms < 2000.0);                    // generous wall-budget (avoid CI flake)
	std::cout << "  perf  : 50k-array parse in " << (long long)ms << " ms\n";
}

static void testCmdResultExtended() {
	// Phase 43 regression: create multi-step chronogram + timing, snapshot diff rows.
	{
		std::string j = R"({"protocol":2,"ok":true,"status":"CREATE_READY","result":{"command":"create","status":"READY","project":"demo","steps":[{"label":"scaffold","ms":3},{"label":"addons","ms":7},{"label":"git","ms":82},{"label":"todo","ms":1}],"artifacts":["/demo"]},"timingMs":95,"errors":[]})";
		auto r = pos::parseCmdResult(j);
		CHECK(r.status == "READY" && r.timingMs == 95);
		CHECK(r.createSteps.size() == 4);
		CHECK(r.createSteps[0].first == "scaffold" && r.createSteps[0].second == 3);
		CHECK(r.createSteps[2].first == "git" && r.createSteps[2].second == 82);
	}
	{
		std::string j = R"({"protocol":2,"ok":true,"status":"SNAPSHOT_DIFF","result":{"command":"snapshot","rows":[{"k":"goal","v":"same"},{"k":"todo","v":"6/6 -> 6/6"},{"k":"progress","v":"0% -> 0%"}]},"errors":[]})";
		auto r = pos::parseCmdResult(j);
		CHECK(r.analysisKv.size() == 3);
		CHECK(r.analysisKv[0].first == "goal" && r.analysisKv[0].second == "same");
	}
	// requestId trace (10.8) flows through the envelope.
	{
		std::string j = R"({"protocol":2,"ok":true,"status":"OK","requestId":"req-123","result":{},"errors":[]})";
		auto r = pos::parseCmdResult(j);
		CHECK(r.requestId == "req-123");
	}
}

static void testFormatting() {
	// 2.8 duration
	CHECK(pos::fmtDuration(500) == "500ms");
	CHECK(pos::fmtDuration(1500) == "1.5s");
	CHECK(pos::fmtDuration(90000) == "1m30s");
	CHECK(pos::fmtDuration(3660000) == "1h01m");
	// 2.9 bytes
	CHECK(pos::fmtBytes(0) == "0 B");
	CHECK(pos::fmtBytes(512) == "512 B");
	CHECK(pos::fmtBytes(1024) == "1.0K");
	CHECK(pos::fmtBytes(1048576) == "1.0M");
	CHECK(pos::fmtBytes(5 * 1024 * 1024 * 1024LL) == "5.0G");
	// 2.6 sparkline
	CHECK(pos::sparkline({}) == "");
	CHECK(pos::sparkline({5, 5, 5}) == "\xE2\x96\x85\xE2\x96\x85\xE2\x96\x85"); // all mid
	CHECK(pos::sparkline({0, 100}).size() == 6); // 2 blocks x 3 bytes
	CHECK(pos::sparkline({0}).size() == 3);
}

static void testTable() {
	// 2.7 padRight
	CHECK(pos::padRight("a", 3) == "a  ");
	CHECK(pos::padRight("abc", 3) == "abc");
	// 2.7 renderTable: columns aligned to max width, rows padded.
	auto tbl = pos::renderTable({ {"alpha","cpp","READY"}, {"bta","ts","READY"} });
	CHECK(tbl.find("alpha") != std::string::npos);
	CHECK(tbl.find("cpp") != std::string::npos);
	// Truncation to maxColWidth.
	auto trunc = pos::renderTable({ {"averyveryverylongslug", "x", "y"} }, 6);
	CHECK(trunc.size() > 0);
	CHECK(trunc.find("\xE2\x80\xA6") != std::string::npos); // '…' present
	CHECK(pos::renderTable({}) == "");
}

static void testFuzzSecurity() {
	// Uses escaped std::string for every hostile input to avoid any raw-delimiter ambiguity.
	const std::string plusN = "{\"x\":+}";
	const std::string minusN = "{\"x\":-}";
	const std::string hugeN = "{\"x\":1e999999}";
	const std::string badU = "{\"s\":\"\\uZZ\"}";
	const std::string truncS = "{\"s\":\"ab";
	const std::string uncl = "{\"a\":";
	const std::string trail = "{\"a\":1})x";
	const std::string dup = "{\"k\":1,\"k\":2}";
	// Deep nesting beyond the guard must throw cleanly, not run away.
	{
		std::string deep;
		for (int i = 0; i < 200; ++i) deep += "[";
		for (int i = 0; i < 200; ++i) deep += "]";
		bool threw = false;
		try { pos::parseJson(deep); } catch (const pos::JsonParseError&) { threw = true; }
		CHECK(threw);
	}
	// Malformed number "+" / "-" / "1e999999" must throw cleanly (no stod crash).
	{
		bool a = false, b = false, c = false;
		try { pos::parseJson(plusN); } catch (const pos::JsonParseError&) { a = true; }
		try { pos::parseJson(minusN); } catch (const pos::JsonParseError&) { b = true; }
		try { pos::parseJson(hugeN); } catch (const pos::JsonParseError&) { c = true; }
		CHECK(a && b && c);
	}
	// Bad unicode escape / truncated string / unclosed object must throw.
	{
		bool bad = false, tr = false, unc = false;
		try { pos::parseJson(badU); } catch (...) { bad = true; }
		try { pos::parseJson(truncS); } catch (...) { tr = true; }
		try { pos::parseJson(uncl); } catch (...) { unc = true; }
		CHECK(bad && tr && unc);
	}
	// Trailing data after a valid value throws.
	{
		bool t = false;
		try { pos::parseJson(trail); } catch (...) { t = true; }
		CHECK(t);
	}
	// Large stress: a big array (10k numbers) parses without issue.
	{
		std::string big = "[";
		for (int i = 0; i < 10000; ++i) { if (i) big += ","; big += std::to_string(i); }
		big += "]";
		auto v = pos::parseJson(big);
		CHECK(v.kind == JKind::Array && v.arr.size() == 10000);
	}
	// Duplicate keys: last wins (std::map overwrite), no crash.
	{
		auto v = pos::parseJson(dup);
		CHECK(v.get("k")->number == 2);
	}
}

int main() {
	testJsonBasics();
	testJsonStringEscapes();
	testParseRegistry();
	testParseGoalAndTodo();
	testShellQuote();
	testCapabilitiesParse();
	testExitCodes();
	testOutputFormat();
	testTerminal();
	testUnicode();
	testProcess();
	testProtocol();
	testNegotiate();
	testMachineContract();
	testBridgeCompat();
	testParseDecodes();
	testParseInspectGoalProof();
	testJsonQuoteEmit();
	testConfigPrecedence();
	testRedaction();
	testGoldenUnicode();
	testGoldenBudget();
	testPerfBudget();
	testFormatting();
	testTable();
	testCmdResultExtended();
	testFuzzProperty();
	testFuzzSecurity();
	std::cout << "\n" << (failures == 0 ? "ALL PASS" : "FAILURES") << " (" << failures << ")\n";
	return failures == 0 ? 0 : 1;
}
