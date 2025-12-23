$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$certDir = Join-Path $root 'infra\traefik\certs'
$certPem = Join-Path $certDir 'prometheus.localhost+prometheus.test.pem'
$certKey = Join-Path $certDir 'prometheus.localhost+prometheus.test.key'

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
  Write-Error 'mkcert is not installed. Install it from https://github.com/FiloSottile/mkcert and rerun.'
  exit 1
}

New-Item -ItemType Directory -Force -Path $certDir | Out-Null

mkcert -install
mkcert -cert-file $certPem -key-file $certKey 'prometheus.localhost' 'prometheus.test'

Write-Host "mkcert certs ready:"
Write-Host "- $certPem"
Write-Host "- $certKey"
