cmake_minimum_required(VERSION 3.16)
project(project_os_cli LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(project-os-cli src/project_os_cli.cpp)
# F06: wmain requires the MinGW unicode entry-point. -municode links the wmain CRT.
target_compile_options(project-os-cli PRIVATE -municode)
target_link_options(project-os-cli PRIVATE -municode)

enable_testing()
add_executable(pos_json_test tests/test_pos.cpp)
target_include_directories(pos_json_test PRIVATE src)
add_test(NAME pos_json_test COMMAND pos_json_test)

# --- Phase 27: installable CLI ------------------------------------------------
include(GNUInstallDirs)
set(CMAKE_INSTALL_BINDIR "bin")
install(TARGETS project-os-cli EXPORT project_os_cliTargets RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
install(EXPORT project_os_cliTargets FILE project_os_cliTargets.cmake NAMESPACE project_os_cli:: DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/project_os_cli)

# --- Phase 28: CPack package (ZIP, Windows) --------------------------------
set(CPACK_GENERATOR "ZIP")
set(CPACK_PACKAGE_NAME "project-os-cli")
set(CPACK_PACKAGE_VENDOR "projet-os")
set(CPACK_PACKAGE_VERSION "0.1.0-v3")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "Project OS CLI (C++/CMake halder) — pilot Project OS without the IDE")
set(CPACK_PACKAGE_FILE_NAME "${CPACK_PACKAGE_NAME}-${CPACK_PACKAGE_VERSION}")
include(CPack)
