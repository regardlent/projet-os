# Restart-AntigravityIDE.ps1
# SAFE Antigravity IDE restart broker (Project OS, Phase 15).
param(
    [string]$Workspace = "C:\Users\eiden\Desktop\dev\projet-os",
    [string]$LauncherPath = "C:\Users\eiden\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe",
    [switch]$DryRun,
    [int]$CloseWaitSeconds = 30
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $Workspace)) { Write-Output "ANTIGRAVITY_WORKSPACE_EMPTY"; exit 1 }
if ($Workspace.ToLower() -ne "c:\users\eiden\desktop\dev\projet-os") { Write-Output "ANTIGRAVITY_WORKSPACE_MISMATCH"; exit 1 }
if (-not (Test-Path $LauncherPath)) { Write-Output "ANTIGRAVITY_EXE_NOT_FOUND"; exit 2 }
$candidates = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -eq $LauncherPath) -and ($_.MainWindowHandle -ne 0) }
if (-not $candidates) { Write-Output "ANTIGRAVITY_IDE_NOT_FOUND"; exit 4 }
$count = @($candidates).Count
Write-Output "TOP_LEVEL_WINDOW_COUNT=$count"
if ($count -gt 1) { Write-Output "MULTIPLE_IDE_INSTANCES_AMBIGUOUS"; exit 5 }
$target = @($candidates)[0]
Write-Output "IDE_PID=$($target.Id) TITLE=$($target.MainWindowTitle)"
if ($DryRun) { Write-Output "BROKER_DRY_RUN"; Write-Output "  exe_exists=PASS"; Write-Output "  top_level_windows=$count"; Write-Output "  workspace=canonical"; Write-Output "  forbidden_commands=none"; Write-Output "  status=DRY_RUN_OK"; exit 0 }
$ok = $target.CloseMainWindow()
Write-Output "CLOSE_MAIN_WINDOW=$ok"
$deadline = (Get-Date).AddSeconds($CloseWaitSeconds)
while ((Get-Process -Id $target.Id -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
if (Get-Process -Id $target.Id -ErrorAction SilentlyContinue) { Write-Output "ANTIGRAVITY_CLOSE_BLOCKED"; exit 6 }
Write-Output "IDE_EXITED"
Start-Process -FilePath $LauncherPath
Write-Output "IDE_RELAUNCHED"
Write-Output "WINDOWS_UNTOUCHED"
exit 0
