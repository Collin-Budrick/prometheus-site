$ErrorActionPreference = 'Stop'

$mkcert = Get-Command mkcert -ErrorAction SilentlyContinue
if (-not $mkcert) {
  $tempDir = Join-Path $env:TEMP 'mkcert'
  New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
  $mkcertPath = Join-Path $tempDir 'mkcert.exe'
  if (-not (Test-Path $mkcertPath)) {
    Write-Host "Downloading mkcert..."
    Invoke-WebRequest -Uri "https://dl.filippo.io/mkcert/latest?for=windows/amd64" -OutFile $mkcertPath
  }
  $mkcert = $mkcertPath
}

$repoRoot = Resolve-Path "$PSScriptRoot\.."
$certDir = Join-Path $repoRoot 'infra\traefik\certs'
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

Write-Host "Installing mkcert root CA into Windows trust store..."
& $mkcert -install

$certFile = Join-Path $certDir 'prometheus.dev+prometheus.prod.pem'
$keyFile = Join-Path $certDir 'prometheus.dev+prometheus.prod.key'

Write-Host "Generating certificate for prometheus.dev and prometheus.prod..."
& $mkcert -cert-file $certFile -key-file $keyFile prometheus.dev prometheus.prod

$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$hosts = Get-Content -Path $hostsPath -ErrorAction SilentlyContinue
$missing = @('prometheus.dev', 'prometheus.prod') | Where-Object { -not ($hosts -match "(?i)\b$($_)\b") }

if ($missing.Count -gt 0) {
  $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltinRole]::Administrator
  )

  if ($isAdmin) {
    $line = "127.0.0.1 $($missing -join ' ')"
    Add-Content -Path $hostsPath -Value $line
    Write-Host "Hosts file updated: $line"
  } else {
    Write-Host "Hosts file needs update (requires admin):"
    Write-Host "  127.0.0.1 $($missing -join ' ')"
  }
}

Write-Host "Done. Restart the preview stack after running this."
