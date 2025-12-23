#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cert_dir="$root_dir/infra/traefik/certs"
cert_pem="$cert_dir/prometheus.dev+prometheus.prod.pem"
cert_key="$cert_dir/prometheus.dev+prometheus.prod.key"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert is not installed. Install it from https://github.com/FiloSottile/mkcert and rerun."
  exit 1
fi

mkdir -p "$cert_dir"

mkcert -install
mkcert -cert-file "$cert_pem" -key-file "$cert_key" prometheus.dev prometheus.prod

echo "mkcert certs ready:"
echo "- $cert_pem"
echo "- $cert_key"
