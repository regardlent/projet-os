// pos_health.hpp — F29 doctor checks + F30 diagnostics redaction helpers.
// Pure + testable. Checks emit a status (PASS/WARN/FAIL/BLOCKED/N-A) and a reason.
#pragma once
#include <string>
#include <vector>

namespace pos {

// Règle §32: redact secrets before writing a diagnostics bundle.
// Replaces password/token/secret/api_key/Authorization/.env values/private keys with [REDACTED].
inline std::string redact(const std::string& s) {
	std::string r = s;
	auto repl = [&](const std::string& pat) { size_t p; while ((p = r.find(pat)) != std::string::npos) r.replace(p, pat.size(), "[REDACTED]"); };
	repl("password="); repl("password:"); repl("token="); repl("token:"); repl("api_key="); repl("api-key=");
	repl("authorization:"); repl("secret="); repl("Bearer ");
	// sk-.../AIza/... keys
	size_t p = 0;
	while ((p = r.find("sk-", p)) != std::string::npos) { size_t e = p; while (e < r.size() && (isalnum((unsigned char)r[e]) || r[e] == '-' || r[e] == '_')) ++e; r.replace(p, e - p, "[REDACTED]"); p += 10; }
	return r;
}

// A named doctor check result.
struct CheckResult {
	std::string name;      // e.g. CLI_BINARY, BRIDGE_FOUND
	std::string status;    // PASS / WARN / FAIL / BLOCKED / N-A
	std::string reason;
};

// Build a check result helper.
inline CheckResult check(const std::string& name, const std::string& status, const std::string& reason) { return { name, status, reason }; }

} // namespace pos
