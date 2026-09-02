# ANTIGRAVITY INSTALL EVIDENCE (Wave 2)

Date: 2026-09-01
Method: Official Google Winget package `Google.AntigravityCLI`
Source: `https://storage.googleapis.com/antigravity-public/antigravity-cli/1.1.23-6260551186251776/windows-x64/cli_windows_x64.exe`
Installer SHA256: `bffa9c1227a517d0dbd7ddfc71a64bf6473c52fab95369cabe09ff42bd9b3b3e`
Installed Binary Path: `C:\Users\eiden\AppData\Local\Microsoft\WinGet\Links\agy.exe`
Version: `1.1.23`
Command Alias: `agy`

## CLI Verification
```powershell
agy --version
# Output: 1.1.23

agy --help
# Output confirms flags: -p, --print, --output-format text|json|stream-json, --sandbox, --print-timeout
```

## Status
`ANTIGRAVITY_INSTALL = PASS` (Official Google package, verified hash, loopback/user-local).