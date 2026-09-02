// pos_process.hpp — F07 ProcessRunner (CreateProcessW, no shell) + F08 timeout engine.
// Owned child process policy: the CLI may manage its OWN child bridge; never external user
// processes. argv[] is encoded per the MSVCRT rule (no shell), no command injection.
#pragma once
#include <windows.h>
#include <string>
#include <vector>
#include <chrono>
#include <thread>
#include <atomic>

namespace pos {

struct ProcessSpec {
	std::wstring executable;          // resolved node.exe path
	std::vector<std::wstring> args;   // argv[1..] (exact, no shell)
	std::wstring cwd;
	std::wstring environmentBlock;    // optional custom env block (null => inherit)
	int timeoutMs = 0;                // 0 = no timeout
	bool captureStdout = true;
	bool captureStderr = true;
};

struct ProcessResult {
	bool started = false;
	bool timedOut = false;
	bool cancelled = false;
	int exitCode = 0;
	std::string out;      // captured stdout
	std::string err;      // captured stderr
	long long durationMs = 0;
	std::string osError;
	bool ok() const { return started && !timedOut && osError.empty(); }
};

// MSVCRT argument quoting: backslashes before a quote vs an argument boundary.
inline std::wstring quoteArg(const std::wstring& a) {
	if (a.empty()) return L"\"\"";
	if (a.find_first_of(L" \t\n\v\"") == std::wstring::npos) return a; // no special chars
	std::wstring out;
	out += L'"';
	size_t backslashes = 0;
	for (size_t i = 0; i < a.size(); ++i) {
		wchar_t c = a[i];
		if (c == L'\\') { ++backslashes; continue; }
		if (c == L'"') {
			// 2n+1 backslashes => double them + a literal quote
			for (size_t k = 0; k < backslashes * 2 + 1; ++k) out += L'\\';
			out += L'"';
		} else {
			for (size_t k = 0; k < backslashes; ++k) out += L'\\';
			out += c;
		}
		backslashes = 0;
	}
	for (size_t k = 0; k < backslashes * 2; ++k) out += L'\\';
	out += L'"';
	return out;
}

// Build a UTF-16 command line from argv[0] + args per MSVCRT rule.
inline std::wstring buildCommandLine(const std::wstring& exe, const std::vector<std::wstring>& args) {
	std::wstring cl = quoteArg(exe);
	for (const auto& a : args) { cl += L' '; cl += quoteArg(a); }
	return cl;
}

// Timeout-aware wait: poll every 10 ms until exit or timeout. Returns final exit code,
// sets timedOut. Never kills an external process; for an owned child it only breaks wait.
inline ProcessResult waitProcess(HANDLE hProc, int timeoutMs, std::atomic<bool>& cancel, long long& elapsed) {
	ProcessResult r;
	auto t0 = std::chrono::steady_clock::now();
	DWORD code = 0;
	while (true) {
		if (cancel) { r.cancelled = true; return r; }
		if (WaitForSingleObject(hProc, 10) == WAIT_OBJECT_0) break;
		elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count();
		if (timeoutMs > 0 && elapsed >= timeoutMs) { r.timedOut = true; return r; }
	}
	GetExitCodeProcess(hProc, &code);
	r.exitCode = (int)code;
	elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count();
	r.started = true;
	return r;
}

// Run an owned child (CreateProcessW, no shell). Reads stdout+stderr via pipes.
// cancelOverride (F09): an external cooperative-cancel flag (Ctrl+C) read during wait.
inline ProcessResult runProcess(const ProcessSpec& spec, std::atomic<bool>* cancelOverride = nullptr) {
	ProcessResult r;
	SECURITY_ATTRIBUTES sa{ sizeof(SECURITY_ATTRIBUTES), nullptr, TRUE };
	HANDLE outRd, outWr, errRd, errWr;
	if (spec.captureStdout) {
		if (!CreatePipe(&outRd, &outWr, &sa, 0)) { r.osError = "CreatePipe(out)"; return r; }
		SetHandleInformation(outRd, HANDLE_FLAG_INHERIT, 0);
	}
	if (spec.captureStderr) {
		if (!CreatePipe(&errRd, &errWr, &sa, 0)) { r.osError = "CreatePipe(err)"; return r; }
		SetHandleInformation(errRd, HANDLE_FLAG_INHERIT, 0);
	}

	STARTUPINFOW si{};
	si.cb = sizeof(si);
	if (spec.captureStdout) { si.dwFlags |= STARTF_USESTDHANDLES; si.hStdOutput = outWr; }
	if (spec.captureStderr) { si.dwFlags |= STARTF_USESTDHANDLES; si.hStdError = errWr; }
	si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);

	PROCESS_INFORMATION pi{};
	std::wstring cmdline = buildCommandLine(spec.executable, spec.args);
	// Must be writable for CreateProcessW.
	std::vector<wchar_t> buf(cmdline.begin(), cmdline.end());
	buf.push_back(0);

	BOOL ok = CreateProcessW(
		nullptr,                       // lpApplicationName NULL => search PATH via command line
		buf.data(),                    // lpCommandLine (module name first)
		nullptr, nullptr, TRUE, CREATE_NO_WINDOW, nullptr,
		spec.cwd.empty() ? nullptr : spec.cwd.c_str(), &si, &pi);
	if (!ok) { r.osError = "CreateProcessW failed " + std::to_string(GetLastError()); return r; }

	CloseHandle(pi.hThread);
	std::atomic<bool> cancel(false);
	std::atomic<bool>* obs = cancelOverride;

	// Read child stdout/stderr in parallel so a large output never deadlocks the pipe.
	std::string out, err;
	auto readPipe = [](HANDLE rd, std::string& dst) { char b[4096]; DWORD n; while (true) { if (!ReadFile(rd, b, sizeof(b), &n, nullptr) || n == 0) break; dst.append(b, n); } };
	std::thread tOut, tErr;
	if (spec.captureStdout) { CloseHandle(outWr); tOut = std::thread(readPipe, outRd, std::ref(out)); }
	if (spec.captureStderr) { CloseHandle(errWr); tErr = std::thread(readPipe, errRd, std::ref(err)); }

	long long elapsed = 0;
	ProcessResult w = waitProcess(pi.hProcess, spec.timeoutMs, obs ? *obs : cancel, elapsed);
	r.started = w.started; r.timedOut = w.timedOut; r.cancelled = w.cancelled; r.exitCode = w.exitCode; r.durationMs = elapsed;

	if (tOut.joinable()) tOut.join();
	if (tErr.joinable()) tErr.join();
	if (spec.captureStdout) CloseHandle(outRd);
	if (spec.captureStderr) CloseHandle(errRd);
	r.out = out; r.err = err;
	CloseHandle(pi.hProcess);
	return r;
}

} // namespace pos

