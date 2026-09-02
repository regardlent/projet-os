# install.ps1 — Project OS CLI (Phase 9.9): build + install binary + register as a command.
param(
	[string]$Prefix = "$env:USERPROFILE\.project-os\bin"
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$build = Join-Path $repo "cli-cpp\cmake-build"

Write-Host "Project OS CLI install -> $Prefix"

# 1. Ensure MSYS2/MinGW on PATH (add if present).
$mingw = "C:\msys64\mingw64\bin"
if (Test-Path $mingw) { $env:Path = "$mingw;$env:Path" }
Get-Command g++, cmake -ErrorAction SilentlyContinue | Out-Null

# 2. Configure + build (reuse existing if present).
if (-not (Test-Path (Join-Path $build "project-os-cli.exe"))) {
	Write-Host "Building CLI (cmake) ..."
	cmake -S (Join-Path $repo "cli-cpp") -B $build 2>&1 | Out-Null
	cmake --build $build --config Release 2>&1 | Out-Null
}

# 3. Install to prefix.
New-Item -ItemType Directory -Force -Path $Prefix | Out-Null
Copy-Item -Force (Join-Path $build "project-os-cli.exe") (Join-Path $Prefix "project-os-cli.exe")
Write-Host "Installed: $(Join-Path $Prefix 'project-os-cli.exe')"

# 4. Add to user PATH if not present.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$Prefix*") {
	[Environment]::SetEnvironmentVariable("Path", "$userPath;$Prefix", "User")
	Write-Host "Added $Prefix to user PATH (restart terminal)."
} else {
	Write-Host "$Prefix already in PATH."
}

# 5. Install shell completion (PowerShell) into profile.
$completion = & (Join-Path $Prefix "project-os-cli.exe") completion powershell
$profile = $PROFILE
if ($profile -and (Test-Path (Split-Path $profile))) {
	Add-Content -Path $profile -Value $completion -Force
	Write-Host "Added PowerShell completion to $profile"
}

Write-Host "Run 'project-os-cli welcome' to get started."
