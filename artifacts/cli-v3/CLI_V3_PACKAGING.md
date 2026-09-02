# CLI V3 — Phase 27: Packaging + CMakePresets + Install

Status: PASS (installable/reproducible via CMakePresets, Ninja generator).

## CMakePresets.json
- configurePresets: `debug`, `release`, `test` (all inherit `base` → Ninja, binaryDir `build/<name>`)
- buildPresets: `debug`, `release`, `test`
- testPresets: `test` (outputOnFailure)
- workflowPresets: `ci` (configure → build → test)

## CMakeLists.txt additions
- `install(TARGETS project-os-cli EXPORT project_os_cliTargets RUNTIME DESTINATION bin)`
- `install(EXPORT project_os_cliTargets FILE project_os_cliTargets.cmake NAMESPACE project_os_cli:: DESTINATION lib/cmake/project_os_cli)`
- GNUInstallDirs + CMAKE_INSTALL_BINDIR=bin

## Validation
- `cmake --preset release` configure+generate OK (Ninja)
- `cmake --build --preset test` → project-os-cli + pos_json_test linked
- `ctest --preset test` → 1/1 PASS (17.8s)
- `cmake --install build/release --prefix C:\t\pog-install` → bin/project-os-cli.exe (659 KB) + .cmake target files
- Installed exe runs: `version 0.1.0-v3` (verified)

## Notes
- CMake 4.3.3 (>= 3.21 required by presets)
- Ninja available at `C:\msys64\mingw64\bin\ninja.exe`
- `cmake-build` (existing) untouched; preset build dirs (`build/*`) are transient
