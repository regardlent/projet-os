// pos_exitcodes.hpp â€” stable exit-code taxonomy (F03/F54). Never maps an error to 0.
#pragma once
#include <string>
#include <vector>
#include <utility>

namespace pos {

// Taxonomy (documented + tested). Stable values, do not reorder existing ones.
enum class ExitCode : int {
        SUCCESS = 0,
        DOMAIN_FAILURE = 1,          // command ran but domain returned FAIL / unknown command
        INVALID_USAGE = 2,           // bad args / missing required option
        BRIDGE_FAILURE = 3,          // bridge missing / process failed / parse failed
        TIMEOUT_OR_CANCELLED = 4,    // timeout or Ctrl+C
        DEPENDENCY_UNAVAILABLE = 5,  // required dependency unavailable
        SECURITY_BLOCKED = 6,        // security policy blocked the operation
        PROTOCOL_ERROR = 7,          // malformed envelope / protocol mismatch
        LOCALAI_UNAVAILABLE = 8,     // LocalAI endpoint unreachable
        GPU_BLOCKED = 9,             // GPU precondition not met (no CPU fallback)
        TEST_FAILURE = 10,           // a test suite reported failures
        RELEASE_BLOCKED = 11,        // release gate not satisfied
        INTERNAL_ERROR = 12,         // unexpected internal error
};

// Human-readable name for each code (used by the `exitcodes` command).
inline std::vector<std::pair<int, std::string>> exitNames() {
        return {
                { 0, "SUCCESS" }, { 1, "DOMAIN_FAILURE" }, { 2, "INVALID_USAGE" }, { 3, "BRIDGE_FAILURE" },
                { 4, "TIMEOUT_OR_CANCELLED" }, { 5, "DEPENDENCY_UNAVAILABLE" }, { 6, "SECURITY_BLOCKED" },
                { 7, "PROTOCOL_ERROR" }, { 8, "LOCALAI_UNAVAILABLE" }, { 9, "GPU_BLOCKED" },
                { 10, "TEST_FAILURE" }, { 11, "RELEASE_BLOCKED" }, { 12, "INTERNAL_ERROR" },
        };
}

// Pure mapping: given a dispatch ok flag + a status string, return the exit code.
// Never returns SUCCESS when the operation reported a failure.
inline int exitFor(bool ok, const std::string& status) {
        if (ok) return static_cast<int>(ExitCode::SUCCESS);
        if (status == "UNKNOWN_COMMAND" || status == "NAME_REQUIRED" || status == "KEY_REQUIRED" || status == "LABEL_REQUIRED" || status == "NOT_A_SLASH_COMMAND" || status == "INVALID_OPTION")
                return static_cast<int>(ExitCode::INVALID_USAGE);
        if (status == "BRIDGE_ERROR" || status == "BRIDGE_FAILURE") return static_cast<int>(ExitCode::BRIDGE_FAILURE);
        if (status == "PROTOCOL_ERROR") return static_cast<int>(ExitCode::PROTOCOL_ERROR);
        if (status == "SECURITY_BLOCKED" || status == "ADDON_SECURITY_BLOCKED") return static_cast<int>(ExitCode::SECURITY_BLOCKED);
        if (status == "BLOCKED_GPU" || status == "GPU_BLOCKED") return static_cast<int>(ExitCode::GPU_BLOCKED);
        if (status == "LOCALAI_UNAVAILABLE" || status == "LOCALAI_UNREACHABLE") return static_cast<int>(ExitCode::LOCALAI_UNAVAILABLE);
        if (status == "TEST_FAILURE") return static_cast<int>(ExitCode::TEST_FAILURE);
        if (status == "RELEASE_BLOCKED") return static_cast<int>(ExitCode::RELEASE_BLOCKED);
        if (status == "TIMEOUT_OR_CANCELLED" || status == "CANCELLED") return static_cast<int>(ExitCode::TIMEOUT_OR_CANCELLED);
        if (status == "DEPENDENCY_UNAVAILABLE") return static_cast<int>(ExitCode::DEPENDENCY_UNAVAILABLE);
        if (status == "NO_ACTIVE_PROJECT" || status == "NOT_FOUND" || status == "BLOCKED") return static_cast<int>(ExitCode::DOMAIN_FAILURE);
        return static_cast<int>(ExitCode::DOMAIN_FAILURE);
}

} // namespace pos

