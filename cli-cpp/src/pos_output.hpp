// pos_output.hpp — multi-format output (F04): human / json / ndjson / tsv.
// stdout=data, stderr=diagnostics. Never mix human text into machine output.
#pragma once
#include <cstdio>
#include <string>
#include <vector>
#include "pos_json.hpp"

namespace pos {

enum class OutputFormat { Human, Json, Ndjson, TsV };

inline std::string json_quote(const std::string& s) {
	std::string o = "\"";
	for (char c : s) {
		switch (c) { case '"': o += "\\\""; break; case '\\': o += "\\\\"; break; case '\n': o += "\\n"; break; case '\r': o += "\\r"; break; case '\t': o += "\\t"; break; default: if ((unsigned char)c < 0x20) { char b[8]; std::snprintf(b, sizeof(b), "\\u%04x", c); o += b; } else o += c; }
	}
	o += "\"";
	return o;
}

// Parse --format=<x>; unknown => Human.
inline OutputFormat parseFormat(const std::string& v) {
	if (v == "json") return OutputFormat::Json;
	if (v == "ndjson") return OutputFormat::Ndjson;
	if (v == "tsv") return OutputFormat::TsV;
	return OutputFormat::Human;
}

// Emit one scalar key/value on stdout per the format.
inline void emitScalar(OutputFormat fmt, const std::string& label, const std::string& value) {
	switch (fmt) {
		case OutputFormat::Human: std::printf("  %-18s %s\n", label.c_str(), value.c_str()); break;
		case OutputFormat::Json: std::printf("{%s:%s}\n", json_quote(label).c_str(), json_quote(value).c_str()); break;
		case OutputFormat::Ndjson: std::printf("{\"label\":%s,\"value\":%s}\n", json_quote(label).c_str(), json_quote(value).c_str()); break;
		case OutputFormat::TsV: std::printf("%s\t%s\n", label.c_str(), value.c_str()); break;
	}
}

// F52 machine contract v2: emit the stable machine-output contract as JSON.
// Pure, no side effects. Documented in docs/schema/machine-schema-v2.json.
inline std::string machineContractJson() {
	return std::string("{")
		+ "\"schemaVersion\":2,"
		+ "\"name\":\"machine-contract\","
		+ "\"version\":\"v2\","
		+ "\"fields\":[\"schemaVersion\",\"command\",\"requestId\",\"status\",\"data\",\"warnings\",\"errors\",\"timing\",\"exitCode\",\"noAnsi\"],"
		+ "\"required\":[\"schemaVersion\",\"command\",\"requestId\",\"status\",\"timing\"],"
		+ "\"statuses\":[\"OK\",\"WARN\",\"FAIL\",\"BLOCKED\",\"NOT_SUPPORTED\",\"PROTOCOL_ERROR\",\"TIMEOUT_OR_CANCELLED\"],"
		+ "\"noAnsi\":true,"
		+ "\"note\":\"stdout=data, stderr=diagnostics; machine output is always plain text\""
		+ "}";
}

// Validate that a produced machine document has the required contract fields present.
inline bool validateMachineContract(const std::string& json) {
	try {
		auto root = parseJson(json);
		// Required top-level scalar-ish fields.
		for (const char* k : { "schemaVersion", "command", "requestId", "status", "timing" }) {
			if (!root.get(k)) return false;
		}
		// noAnsi must be truthy for machine output.
		auto* na = root.get("noAnsi");
		if (na && na->kind == JKind::Bool && !na->boolean) return false;
		return true;
	} catch (...) {
		return false;
	}
}

} // namespace pos

