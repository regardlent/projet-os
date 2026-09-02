// pos_json.hpp — minimal JSON value parser + accessors (C++17), header-only.
// Only what the Project OS CLI needs: objects, arrays, strings, numbers, bool, null.
#pragma once
#include <cctype>
#include <cstdint>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace pos {

enum class JKind { Null, Bool, Number, String, Array, Object };

struct JValue {
	JKind kind = JKind::Null;
	bool boolean = false;
	double number = 0.0;
	std::string str;
	std::vector<JValue> arr;
	std::map<std::string, JValue> obj;

	const JValue* get(const std::string& key) const {
		if (kind != JKind::Object) return nullptr;
		auto it = obj.find(key);
		return it == obj.end() ? nullptr : &it->second;
	}
	std::string asString() const { return kind == JKind::String ? str : (kind == JKind::Number ? std::to_string(number) : ""); }
};

class JsonParseError : public std::runtime_error { using std::runtime_error::runtime_error; };

// Forward decl to keep parsing mutually recursive.
struct Parser {
	const char* p;
	const char* end;
	int depth = 0;

	void skipWs() { while (p < end && std::isspace(static_cast<unsigned char>(*p))) ++p; }
	bool eof() const { return p >= end; }

	void expect(char c) {
		if (eof() || *p != c) throw JsonParseError(std::string("expected '") + c + "' at " + std::to_string(p - (end - 1)));
		++p;
	}

	std::string parseString() {
		expect('"');
		std::string out;
		while (!eof() && *p != '"') {
			char c = *p++;
			if (c == '\\') {
				if (eof()) throw JsonParseError("bad escape");
				char e = *p++;
				switch (e) { case 'n': out += '\n'; break; case 't': out += '\t'; break; case 'r': out += '\r'; break; case 'b': out += '\b'; break; case 'f': out += '\f'; break; case 'u': { for (int i = 0; i < 4; ++i) { if (eof()) throw JsonParseError("bad \\u"); p++; } break; } default: out += e; }
			} else out += c;
		}
		expect('"');
		return out;
	}

	JValue parseValue() {
		if (depth++ > 128) throw JsonParseError("nesting too deep");
		skipWs();
		JValue v;
		if (eof()) { depth--; return v; }
		char c = *p;
		if (c == '{') { ++p; v.kind = JKind::Object; skipWs(); if (!eof() && *p == '}') { ++p; depth--; return v; } while (true) { skipWs(); auto key = parseString(); skipWs(); expect(':'); v.obj[key] = parseValue(); skipWs(); if (!eof() && *p == ',') { ++p; continue; } if (!eof() && *p == '}') { ++p; break; } throw JsonParseError("bad object"); } }
		else if (c == '[') { ++p; v.kind = JKind::Array; skipWs(); if (!eof() && *p == ']') { ++p; depth--; return v; } while (true) { v.arr.push_back(parseValue()); skipWs(); if (!eof() && *p == ',') { ++p; continue; } if (!eof() && *p == ']') { ++p; break; } throw JsonParseError("bad array"); } }
		else if (c == '"') { v.kind = JKind::String; v.str = parseString(); }
		else if (c == 't' || c == 'f') { const char* w = (c == 't') ? "true" : "false"; int n = (c == 't') ? 4 : 5; if (end - p < n) throw JsonParseError("bad literal"); for (int i = 0; i < n; ++i) if (p[i] != w[i]) throw JsonParseError("bad literal"); p += n; v.kind = JKind::Bool; v.boolean = (c == 't'); }
		else if (c == 'n') { if (end - p < 4) throw JsonParseError("bad null"); for (int i = 0; i < 4; ++i) if (p[i] != "null"[i]) throw JsonParseError("bad null"); p += 4; v.kind = JKind::Null; }
		else if (c == '-' || (c >= '0' && c <= '9')) {
			const char* start = p;
			while (p < end && (*p == '-' || *p == '+' || *p == '.' || *p == 'e' || *p == 'E' || (*p >= '0' && *p <= '9'))) ++p;
			v.kind = JKind::Number;
			// Fuzz/safety: a malformed or out-of-range number (e.g. "+", "-", "1e999999")
			// must throw a clean JsonParseError instead of an uncaught stod exception.
			std::string num(start, p);
			try { v.number = std::stod(num); }
			catch (...) { throw JsonParseError("invalid number: " + num.substr(0, 32)); }
		}
		else throw JsonParseError(std::string("unexpected char '") + c + "'");
		depth--;
		return v;
	}

	JValue parseAll() { auto v = parseValue(); skipWs(); if (!eof()) throw JsonParseError("trailing data"); return v; }
};

inline JValue parseJson(const std::string& text) { Parser p{ text.c_str(), text.c_str() + text.size(), 0 }; return p.parseAll(); }

} // namespace pos
