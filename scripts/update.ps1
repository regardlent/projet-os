# update.ps1 — Project OS CLI (Phase 4.9): pull latest + rebuild + reinstall.
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$prefix = "$env:USERPROFILE\.project-os\bin"

Write-Host "Project OS CLI update -> pull + rebuild + reinstall"
git -C $repo pull --ff-only 2>&1 | Out-Null

$mingw = "C:\msys64\mingw64\bin"
if (Test-Path $mingw) { $env:Path = "$mingw;$env:Path" }
$build = Join-Path $repo "cli-cpp\cmake-build"
cmake -S (Join-Path $repo "cli-cpp") -B $build 2>&1 | Out-Null
cmake --build $build --config Release 2>&1 | Out-Null

New-Item -ItemType Directory -Force -Path $prefix | Out-Null
Copy-Item -Force (Join-Path $build "project-os-cli.exe") (Join-Path $prefix "project-os-cli.exe")
Write-Host "Updated: $(Join-Path $prefix 'project-os-cli.exe')"
Write-Host "Run 'project-os-cli release' to see version."
