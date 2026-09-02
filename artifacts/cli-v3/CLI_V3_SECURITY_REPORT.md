# CLI V3 — Phase 28: Fuzz + Security + Stress

Status: PASS (parser hardened against hostile input).

## Security hardening (src/pos_json.hpp)
- Number parsing wrapped in `try { std::stod } catch(...) → throw JsonParseError`.
  - Fixes uncaught `std::invalid_argument` (e.g. `+`, `-`) and `std::out_of_range` (e.g. `1e999999`) crashing the process.
- Existing depth guard (`depth > 128`) already rejects runaway nesting.

## Added tests (tests/test_pos.cpp, testFuzzSecurity)
- Deep nesting (200 levels) → throws `JsonParseError`.
- Malformed numbers `+`, `-`, `1e999999` → clean throw (no crash).
- Bad `\u` escape, truncated string, unclosed object → throw.
- Trailing data after a valid value → throw.
- Large stress: array of 10,000 numbers parses correctly (`.size()==10000`).
- Duplicate keys: last wins (std::map overwrite), no crash.

## Validation
- `pos_json_test.exe` → **ALL PASS (0)** (incl. `threw`, `a && b && c`).
- `ctest` → **1/1 PASS** (5.22s).
- Regression: `docs 'swiss football league'` → OK.
- typecheck (Node repo) → 0 errors (unchanged, C++ only).

## Notes
- No external fuzz harness added (minimal, header-only parser); unit fuzz cases cover the
  highest-risk paths (number parsing, nesting, escapes, truncation).
- No destructive commands introduced; parser is pure.
