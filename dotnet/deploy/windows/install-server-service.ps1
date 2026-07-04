<#
.SYNOPSIS
  Install the eSign MICO360 .NET server as a Windows Service (HTTP + HTTPS).
.DESCRIPTION
  Run from INSIDE the copied server-win-x64 folder, in an elevated PowerShell:
      .\install-server-service.ps1 -AdminPassword 'YourStrongPassword'
  Writes appsettings.Production.json (SQLite + JWT key + admin password + Kestrel
  HTTP/HTTPS endpoints), generates a self-signed TLS certificate for HTTPS,
  registers an auto-start Windows Service, opens the firewall for both ports,
  starts it and checks health on both.
.NOTES
  Windows PowerShell 5.1 compatible. HTTPS uses a self-signed cert (fine for a
  bare-IP pilot; clients must skip cert validation). For CA-trusted HTTPS, point
  a domain at the server and drop in a real certificate.
#>
#requires -RunAsAdministrator
param(
  [Parameter(Mandatory = $true)][string]$AdminPassword,
  [int]$HttpPort  = 5212,
  [int]$HttpsPort = 5213,
  [string]$DataDir = "C:\ProgramData\EsignMico360",
  [string]$ServiceName = "eSignMico360Server",
  [string]$CertHost = "84.247.142.2"
)
$ErrorActionPreference = "Stop"
$AppDir = $PSScriptRoot
$Exe = Join-Path $AppDir "EsignMico360.Server.exe"

Write-Host "==> Preflight"
if (-not (Test-Path $Exe)) { throw "EsignMico360.Server.exe not found next to this script. Copy the whole server-win-x64 folder, then run this from inside it." }

Write-Host "==> Data directory: $DataDir"
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

Write-Host "==> Generating self-signed TLS certificate for HTTPS (CN=$CertHost)"
$pfxPath = Join-Path $DataDir "esign-tls.pfx"
$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
$pb = New-Object 'System.Byte[]' 24; $rng.GetBytes($pb)
$pfxPw = [Convert]::ToBase64String($pb)
$cert = New-SelfSignedCertificate -DnsName $CertHost, "localhost" `
  -CertStoreLocation "Cert:\LocalMachine\My" -FriendlyName "eSign MICO360 TLS" `
  -NotAfter (Get-Date).AddYears(5) -KeyExportPolicy Exportable
Export-PfxCertificate -Cert $cert -FilePath $pfxPath `
  -Password (ConvertTo-SecureString $pfxPw -AsPlainText -Force) | Out-Null
Remove-Item ("Cert:\LocalMachine\My\" + $cert.Thumbprint) -Force -ErrorAction SilentlyContinue  # Kestrel loads the .pfx file

Write-Host "==> Generating JWT key + writing appsettings.Production.json"
$jb = New-Object 'System.Byte[]' 48; $rng.GetBytes($jb)
$jwtKey = -join ($jb | ForEach-Object { $_.ToString("x2") })

$config = [ordered]@{
  Database          = @{ Provider = "sqlite" }
  ConnectionStrings = @{ Default = "Data Source=$DataDir\server.db" }
  Jwt               = @{ Key = $jwtKey }
  Seed              = @{ AdminUsername = "admin"; AdminPassword = $AdminPassword }
  AllowedHosts      = "*"
  Kestrel           = [ordered]@{
    Endpoints = [ordered]@{
      Http  = @{ Url = "http://0.0.0.0:$HttpPort" }
      Https = @{ Url = "https://0.0.0.0:$HttpsPort" }
    }
    Certificates = @{ Default = @{ Path = $pfxPath; Password = $pfxPw } }
  }
}
$config | ConvertTo-Json -Depth 8 | Set-Content -Path (Join-Path $AppDir "appsettings.Production.json") -Encoding UTF8

Write-Host "==> (Re)creating Windows service '$ServiceName'"
if (Get-Service $ServiceName -ErrorAction SilentlyContinue) {
  Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
  & sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 2
}
New-Service -Name $ServiceName -BinaryPathName "`"$Exe`"" -DisplayName "eSign MICO360 .NET Server" `
  -StartupType Automatic -Description "eSign MICO360 company-sync server (prototype)" | Out-Null
& sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null

Write-Host "==> Firewall rules for TCP $HttpPort (HTTP) and $HttpsPort (HTTPS)"
foreach ($pt in @($HttpPort, $HttpsPort)) {
  $fw = "eSign MICO360 Server (TCP $pt)"
  Get-NetFirewallRule -DisplayName $fw -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $fw -Direction Inbound -Protocol TCP -LocalPort $pt -Action Allow | Out-Null
}

Write-Host "==> Starting service"
Start-Service $ServiceName
Start-Sleep -Seconds 5

# HTTP health is authoritative (reliable). HTTPS is confirmed best-effort with
# curl (PowerShell 5.1's Invoke-RestMethod is flaky against a self-signed GET).
function Test-Http([string]$url) {
  for ($i = 1; $i -le 8; $i++) {
    try { if ((Invoke-RestMethod $url -TimeoutSec 8).status) { return $true } } catch { Start-Sleep -Seconds 2 }
  }
  return $false
}
function Test-Https([string]$url) {
  if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { return $null }   # can't auto-verify
  for ($i = 1; $i -le 8; $i++) {
    if ((& curl.exe -k -s -o NUL -w "%{http_code}" --max-time 8 $url) -eq '200') { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

$httpOk  = Test-Http  "http://localhost:$HttpPort/api/health"
$httpsOk = Test-Https "https://localhost:$HttpsPort/api/health"

if (-not $httpOk) {
  Write-Warning "Service started but HTTP health did not respond on $HttpPort."
  Write-Warning "Inspect: Get-EventLog Application -Newest 20   or run `"$Exe`" directly."
  throw "HTTP health check failed"
}

Write-Host ""
Write-Host "OK  Service '$ServiceName' running." -ForegroundColor Green
Write-Host "    HTTP  : http://$CertHost`:$HttpPort/api/health   -> ok"
if     ($httpsOk -eq $true)  { Write-Host "    HTTPS : https://$CertHost`:$HttpsPort/api/health  -> ok  (self-signed)" }
elseif ($httpsOk -eq $false) { Write-Warning "    HTTPS : port $HttpsPort configured (self-signed) but did not answer curl - confirm in a browser" }
else                         { Write-Host   "    HTTPS : port $HttpsPort configured (self-signed) - curl not present to auto-verify" }
Write-Host "    Login : admin / (your -AdminPassword)"
Write-Host "    DB    : $DataDir\server.db   (back this up)"
