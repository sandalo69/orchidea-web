#!/usr/bin/env bash
# Genera certificato self-signed per sviluppo locale.
# Per produzione usa Let's Encrypt: https://certbot.eff.org/
set -e
CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)/nginx/certs"
mkdir -p "$CERT_DIR"
openssl req -x509 -newkey rsa:4096 \
  -keyout "$CERT_DIR/key.pem" \
  -out    "$CERT_DIR/cert.pem" \
  -sha256 -days 3650 -nodes \
  -subj "/C=IT/ST=Veneto/L=Rottanova/O=Orchidea/CN=localhost"
chmod 600 "$CERT_DIR/key.pem"
echo "Certificato self-signed generato in: $CERT_DIR"
echo "Avvia con: docker compose up -d --build"
