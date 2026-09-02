// pos_protocol.hpp — F10 bridge protocol v2 schema validation.
// A malformed envelope is a PROTOCOL_ERROR (exit 7), never a crash or a fake PASS.
#pragma once
#include <string>
#include <vector>
#include <algorithm>
#include "pos_json.hpp"

namespace pos {

// Minimal v2 envelope validation: checks presence/shape of required fields.
// Returns true if the envelope is structurally valid; fills `reason` on failure.
inline bool validateEnvelope(const JValue& root, bool& hasProtocol, int& protocol, bool& ok, std::string& status, std::string& reason) {
	hasProtocol = false; protocol = 0; ok = false; status.clear(); reason.clear();
	// protocol must be a number (>=2 for v2).
	const auto* p = root.get("protocol");
	if (!p || p->kind != JKind::Number) { reason = "missing/invalid 'protocol'"; return false; }
	protocol = static_cast<int>(p->number);
	hasProtocol = true;
	// ok boolean required.
	const auto* o = root.get("ok");
	if (!o || o->kind != JKind::Bool) { reason = "missing/invalid 'ok'"; return false; }
	ok = o->boolean;
	// status string required.
	const auto* s = root.get("status");
	if (!s || s->kind != JKind::String) { reason = "missing/invalid 'status'"; return false; }
	status = s->asString();
	// result object required (may be empty but must be an object).
	const auto* res = root.get("result");
	if (!res || res->kind != JKind::Object) { reason = "missing/invalid 'result'"; return false; }
	return true;
}



// F51 protocol negotiation: compute the selected protocol from the intersection of
// client and server supported protocols. Pure + testable. Never a silent downgrade.
struct NegotiationResult {
        bool compatible = false;
        int selectedProtocol = 0;
        int clientMax = 0;
        int serverMax = 0;
        std::string reason;
};

inline NegotiationResult negotiateProtocol(const std::vector<int>& client, const std::vector<int>& server) {
        NegotiationResult r;
        int cmax = 0, smax = 0;
        for (int v : client) cmax = std::max(cmax, v);
        for (int v : server) smax = std::max(smax, v);
        r.clientMax = cmax;
        r.serverMax = smax;
        for (int v : server) { for (int c : client) { if (c == v && v > r.selectedProtocol) { r.selectedProtocol = v; r.compatible = true; } } }
        if (r.compatible) { r.reason = "selected common protocol v" + std::to_string(r.selectedProtocol); }
        else { r.reason = "no common protocol (client=" + std::to_string(cmax) + " server=" + std::to_string(smax) + ")"; }
        return r;
}



// F53 bridge compatibility self-test: validate an envelope against the v2 contract.
// Read-only; returns detailed field-level checks. Pure + testable.
struct BridgeCheck { std::string name; bool pass; std::string detail; };

inline std::vector<BridgeCheck> bridgeCompatibilityCheck(const JValue& root) {
        std::vector<BridgeCheck> out;
        auto add = [&](const std::string& n, bool p, const std::string& d) { out.push_back({n, p, d}); };
        // Required: protocol number >= 2.
        const auto* p = root.get("protocol");
        if (p && p->kind == JKind::Number) add("protocol", p->number >= 2, "v" + std::to_string((int)p->number));
        else add("protocol", false, "missing/invalid");
        // Required: ok boolean.
        const auto* o = root.get("ok");
        add("ok", o && o->kind == JKind::Bool, o ? (o->boolean ? "true" : "false") : "missing");
        // Required: status string.
        const auto* s = root.get("status");
        add("status", s && s->kind == JKind::String, s ? s->asString() : "missing");
        // Required: result object.
        const auto* res = root.get("result");
        add("result", res && res->kind == JKind::Object, res ? (res->kind == JKind::Object ? "object" : "type") : "missing");
        // Optional: requestId string.
        const auto* rid = root.get("requestId");
        add("requestId", !rid || rid->kind == JKind::String, rid && rid->kind == JKind::String ? rid->asString() : (rid ? "type" : "optional"));
        // Optional: timingMs number.
        const auto* tm = root.get("timingMs");
        add("timingMs", !tm || tm->kind == JKind::Number, tm ? std::to_string((long long)tm->number) : "optional");
        // Optional: errors array of objects.
        const auto* errs = root.get("errors");
        add("errors", !errs || errs->kind == JKind::Array, errs ? ("array(" + std::to_string(errs->arr.size()) + ")") : "optional");
        return out;
}

// The bridge must NOT mutate anything; this just classifies an envelope.
inline bool bridgeCompatibleAll(const std::vector<BridgeCheck>& checks) {
        for (auto& c : checks) if (!c.pass) return false;
        return true;
}


} // namespace pos
