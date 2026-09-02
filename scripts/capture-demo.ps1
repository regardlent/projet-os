# capture-demo.ps1 - rend une "screenshot" PNG du CLI (sortie reelle) dans docs/screenshot.png.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$bin = "cli-cpp\cmake-build\project-os-cli.exe"
$root = (Get-Location).Path
$env:PROJECT_OS_REPO = $root
$env:PROJECT_OS_REGISTRY = "C:\Users\eiden\Desktop\dev\projects\.hub-managed.json"
$env:PROJECT_OS_ACTIVE_SLUG = "sfl-observatory"
Write-Host "genere la demo a partir de la sortie reelle du CLI..."

$lines = New-Object System.Collections.ArrayList
[void]$lines.Add("& project-os-cli welcome")
foreach ($l in (& $bin welcome)) { [void]$lines.Add($l) }
[void]$lines.Add("")
[void]$lines.Add("& project-os-cli health score")
foreach ($l in (& $bin health score)) { [void]$lines.Add($l) }
[void]$lines.Add("")
[void]$lines.Add("& project-os-cli models")
foreach ($l in (& $bin models)) { [void]$lines.Add($l) }

$fontName = "Consolas"
$titleFont = New-Object System.Drawing.Font($fontName, 12, [System.Drawing.FontStyle]::Bold)
$lineFont  = New-Object System.Drawing.Font($fontName, 10)
$green  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::LimeGreen)
$cyan   = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Cyan)
$white  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Gainsboro)
$yellow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Orange)
$titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

$wpad = 20; $lh = 22
$width = 1000
$headerH = 44
$height = $headerH + 20 + ($lines.Count * $lh) + 20

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(28, 28, 30))
$g.FillRectangle([System.Drawing.Brushes]::DarkGray, 0, 0, $width, $headerH)
$g.DrawString("project-os-cli - demo", $titleFont, $titleBrush, $wpad, 8)
$g.DrawString("Project OS CLI (C++)  LocalAI + GPU + artifacts", $lineFont, $green, 440, 12)

$y = $headerH + 14
$dash = [char]0x2500
foreach ($ln in $lines) {
	$text = [string]$ln
	$brush = $white
	if ($text -match '^\s*&') { $brush = $green; $text = $text.TrimStart() }
	elseif ($text.IndexOf($dash) -ge 0) { $brush = $cyan }
	elseif ($text -match 'OK|PASS|READY|AVAILABLE') { $brush = $green }
	elseif ($text -match 'FAIL|WARN|ALERT|RISK|BLOCKED') { $brush = $yellow }
	$g.DrawString($text, $lineFont, $brush, $wpad, $y)
	$y += $lh
}

$out = Join-Path $root "docs\screenshot.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "ecrit $out ($($lines.Count) lignes)"


