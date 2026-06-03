$ErrorActionPreference = "Stop"

$ruleName = "Draw Guess Game Port 3000"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if ($existingRule) {
  Write-Host "Firewall rule already exists: $ruleName" -ForegroundColor Green
} else {
  New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 3000 `
    -Profile Private | Out-Null

  Write-Host "Allowed TCP port 3000 on Private networks." -ForegroundColor Green
}

Write-Host ""
Write-Host "Now run start-phone.ps1 again, then open the Phone URL on iPhone Safari." -ForegroundColor Cyan
