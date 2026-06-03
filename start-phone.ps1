$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $PSScriptRoot

$ipconfig = & "$env:SystemRoot\System32\ipconfig.exe"
$address = $ipconfig |
  Select-String -Pattern "IPv4.*: ([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)" |
  ForEach-Object { $_.Matches[0].Groups[1].Value } |
  Where-Object { $_ -notlike "127.*" -and $_ -notlike "169.254.*" -and $_ -notlike "192.168.112.*" -and $_ -notlike "192.168.42.*" } |
  Select-Object -First 1

Write-Host ""
Write-Host "PC URL: http://localhost:3000" -ForegroundColor Cyan
if ($address) {
  Write-Host "Phone URL: http://$address`:3000" -ForegroundColor Green
} else {
  Write-Host "Could not detect LAN IP. Check the npm start output." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "If Windows Firewall asks about Node.js, allow Private networks." -ForegroundColor Yellow
Write-Host "Keep this window open. Closing it stops the phone URL." -ForegroundColor Yellow
Write-Host ""

npm start
