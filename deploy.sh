#!/bin/bash
set -e

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[deploy] Pull da GitHub..."
cd "$DEPLOY_DIR"
git pull

echo "[deploy] Rebuild immagine app e riavvio container..."
docker compose up -d --build --wait

echo "[deploy] Stato container:"
docker compose ps

echo "[deploy] Done. Sito disponibile su https://192.168.1.10:9443"
