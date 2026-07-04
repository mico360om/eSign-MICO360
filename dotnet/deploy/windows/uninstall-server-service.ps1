# Stop + remove the eSign MICO360 server Windows Service and its firewall rule.
# Invoked by the installer's uninstaller. Leaves the SQLite database in place.
$ServiceName = "eSignMico360Server"
if (Get-Service $ServiceName -ErrorAction SilentlyContinue) {
  Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
  & sc.exe delete $ServiceName | Out-Null
}
Get-NetFirewallRule -DisplayName "eSign MICO360 Server*" -ErrorAction SilentlyContinue |
  Remove-NetFirewallRule -ErrorAction SilentlyContinue
# NOTE: C:\ProgramData\EsignMico360\server.db (your data) is intentionally kept.
Write-Host "eSign MICO360 server service removed."
