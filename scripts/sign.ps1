# sign.ps1 — Project OS CLI (Phase 4.7): Windows code-signing pipeline (honest no-op if no cert).
param(
	[string]$CertThumbprint = $env:PROJECT_OS_SIGN_CERT,
	[string]$BinPath = "$env:USERPROFILE\.project-os\bin\project-os-cli.exe"
)
$ErrorActionPreference = "Stop"
# Requires a code-signing certificate installed in the user store (env PROJECT_OS_SIGN_CERT = thumbprint).
if (-not $CertThumbprint) {
	Write-Host "Not signed: PROJECT_OS_SIGN_CERT (cert thumbprint) not set. Provide a code-signing cert to enable signing."
	exit 0
}
if (-not (Test-Path $BinPath)) { Write-Host "Not signed: binary not found at $BinPath"; exit 1 }
$signtool = (Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
if (-not $signtool) { Write-Host "Not signed: signtool.exe not found (Windows SDK)"; exit 1 }
& $signtool sign /sha1 $CertThumbprint /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $BinPath 2>&1 | Out-Null
Write-Host "Signed: $BinPath"
