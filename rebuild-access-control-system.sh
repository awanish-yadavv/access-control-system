#!/bin/bash
set -e

# NeyoFit Access Control — Full Rebuild Script
# Stops, removes, and rebuilds all containers from scratch (no cache).
# Run this after pulling new code or changing .env files.
#
# Usage: bash rebuild-akshardaan-foundation.sh
# Optional: bash rebuild-akshardaan-foundation.sh backend   (rebuild one service)
#           bash rebuild-akshardaan-foundation.sh frontend
#           bash rebuild-akshardaan-foundation.sh mosquitto
#           bash rebuild-akshardaan-foundation.sh valkey

SERVICE=$1  # optional: target a single service

CONTAINERS=(neyofit-backend neyofit-frontend neyofit-mqtt neyofit-valkey)
IMAGES=(neyofit-backend neyofit-frontend neyofit-mqtt)   # valkey uses official image, never removed

if [ -n "$SERVICE" ]; then
  echo "🔧 Rebuilding single service: $SERVICE"
  docker compose stop "$SERVICE" 2>/dev/null || true
  docker compose rm -f "$SERVICE" 2>/dev/null || true
  docker compose build --no-cache "$SERVICE"
  docker compose up -d "$SERVICE"
  echo "✅ $SERVICE rebuilt and running."
  exit 0
fi

# ── Full rebuild ──────────────────────────────────────────────────────────────

echo "⏹  Stopping all containers..."
for c in "${CONTAINERS[@]}"; do
  docker stop "$c" 2>/dev/null || true
  docker rm   "$c" 2>/dev/null || true
done

echo "🗑  Removing built images..."
for img in "${IMAGES[@]}"; do
  docker rmi "$img" 2>/dev/null || true
done

# Ensure the shared Docker network exists
echo "🌐 Ensuring neyofit-net network exists..."
docker network create neyofit-net 2>/dev/null || echo "   (already exists)"

echo "🔨 Building all images (no cache)..."
docker compose build --no-cache

echo "🚀 Starting all services..."
docker compose up -d

echo ""
echo "✅ Done! All NeyoFit containers rebuilt and running."
echo ""
echo "   neyofit-valkey    — Valkey (BullMQ queue)"
echo "   neyofit-mqtt      — Mosquitto MQTT broker  (port 8883 TLS)"
echo "   neyofit-backend   — Node.js API             (port 5001)"
echo "   neyofit-frontend  — Next.js dashboard       (port 3000)"
echo ""
echo "   Logs: docker compose logs -f"
echo "   Status: docker compose ps"
