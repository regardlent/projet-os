// pos_terminal.hpp — F05 terminal capability + F06 Unicode helpers.
// Pure-ish: detection functions take injected handles so they are testable; NO_COLOR / color policy.
#pragma once
#include <string>

namespace pos {

// F05 — color + terminal policy. auto=color only when TTY+VT, always=force, never=plain.
enum class ColorPolicy { Auto, Always, Never };

// Parse --color=<auto|always|never>; unknown => Auto. NO_COLOR env forces Never (unless Always).
inline ColorPolicy parseColor(const std::string& v) {
	if (v == "always") return ColorPolicy::Always;
	if (v == "never") return ColorPolicy::Never;
	return ColorPolicy::Auto;
}

// Apply NO_COLOR: if env NO_COLOR is set (any non-empty), result is Never unless override=Always.
inline ColorPolicy applyNoColor(ColorPolicy p, bool noColorEnv) {
	if (noColorEnv && p != ColorPolicy::Always) return ColorPolicy::Never;
	return p;
}

// F05 — is stdout a TTY / redirected? (win32: GetConsoleMode on STDOUT handle). Injected bool for tests.
inline bool looksLikeTty(bool isConsole) { return isConsole; }

// Effective color enables when: policy Always, OR (policy Auto AND tty). Never otherwise.
inline bool colorEnabled(ColorPolicy p, bool tty) {
	if (p == ColorPolicy::Always) return true;
	if (p == ColorPolicy::Never) return false;
	return tty;
}

// F05 — sanitize untrusted text before printing to the terminal (terminal injection guard).
// Removes ESC (0x1B), BEL (0x07), and other C0 control chars except \t \n \r.
inline std::string sanitizeTerminalText(const std::string& s) {
	std::string o;
	o.reserve(s.size());
	for (unsigned char c : s) {
		if (c == 0x1B || c == 0x07) continue; // ESC, BEL
		if (c < 0x20 && c != '\t' && c != '\n' && c != '\r') continue; // other C0
		o += static_cast<char>(c);
	}
	return o;
}

// F06 — UTF-16 (Windows wchar) <-> UTF-8, plus emoji/surrogate + invalid checks.
inline bool utf16ToUtf8(const unsigned short* in, std::string& out) {
	out.clear();
	for (size_t i = 0; in[i]; ++i) {
		unsigned int cp = in[i];
		if (cp >= 0xD800 && cp <= 0xDBFF) { // high surrogate
			unsigned short lo = in[i + 1];
			if (!(lo >= 0xDC00 && lo <= 0xDFFF)) return false;
			cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
			++i;
		} else if (cp >= 0xDC00 && cp <= 0xDFFF) {
			return false; // lone low surrogate
		}
		if (cp <= 0x7F) out += static_cast<char>(cp);
		else if (cp <= 0x7FF) { out += static_cast<char>(0xC0 | (cp >> 6)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
		else if (cp <= 0xFFFF) { out += static_cast<char>(0xE0 | (cp >> 12)); out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
		else { out += static_cast<char>(0xF0 | (cp >> 18)); out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F)); out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
	}
	return true;
}

// UTF-8 -> UTF-16 (for CreateProcessW). Returns false on malformed input.
inline bool utf8ToUtf16(const std::string& s, std::wstring& out) {
	out.clear();
	for (size_t i = 0; i < s.size();) {
		unsigned char c = s[i];
		unsigned int cp = 0; size_t n = 0;
		if (c < 0x80) { cp = c; n = 1; }
		else if ((c & 0xE0) == 0xC0) { cp = c & 0x1F; n = 2; }
		else if ((c & 0xF0) == 0xE0) { cp = c & 0x0F; n = 3; }
		else if ((c & 0xF8) == 0xF0) { cp = c & 0x07; n = 4; }
		else return false;
		if (i + n > s.size()) return false;
		for (size_t k = 1; k < n; ++k) { if ((s[i + k] & 0xC0) != 0x80) return false; cp = (cp << 6) | (s[i + k] & 0x3F); }
		i += n;
		if (cp <= 0xFFFF) out += static_cast<unsigned short>(cp);
		else { cp -= 0x10000; out += static_cast<unsigned short>(0xD800 + (cp >> 10)); out += static_cast<unsigned short>(0xDC00 + (cp & 0x3FF)); }
	}
	return true;
}

} // namespace pos
