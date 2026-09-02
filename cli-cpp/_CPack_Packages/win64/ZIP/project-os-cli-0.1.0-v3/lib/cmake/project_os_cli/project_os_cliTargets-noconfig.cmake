#----------------------------------------------------------------
# Generated CMake target import file.
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "project_os_cli::project-os-cli" for configuration ""
set_property(TARGET project_os_cli::project-os-cli APPEND PROPERTY IMPORTED_CONFIGURATIONS NOCONFIG)
set_target_properties(project_os_cli::project-os-cli PROPERTIES
  IMPORTED_LOCATION_NOCONFIG "${_IMPORT_PREFIX}/bin/project-os-cli.exe"
  )

list(APPEND _cmake_import_check_targets project_os_cli::project-os-cli )
list(APPEND _cmake_import_check_files_for_project_os_cli::project-os-cli "${_IMPORT_PREFIX}/bin/project-os-cli.exe" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)
