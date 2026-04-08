#!/bin/bash
set -e

# Access Control System — Full Rebuild Script
# Stops, removes, and rebuilds all containers from scratch (no cache).
# Run this after pulling new code or changing .env files.
#
# Usage: bash rebuild-access-control-system.sh
# Optional: bash rebuild-access-control-system.sh backend   (rebuild one service)
#           bash rebuild-access-control-system.sh frontend
#           bash rebuild-access-control-system.sh mosquitto
#           bash rebuild-access-control-system.sh valkey

SERVICE=$1  # optional: target a single service

CONTAINERS=(acs-backend acs-frontend acs-mqtt acs-valkey)
IMAGES=(acs-backend acs-frontend acs-mqtt)   # valkey uses official image, never removed

if [ -n "$SERVICE" ]; then
  echo "Rebuilding single service: $SERVICE"
  docker compose stop "$SERVICE" 2>/dev/null || true
  docker compose rm -f "$SERVICE" 2>/dev/null || true
  docker compose build --no-cache "$SERVICE"
  docker compose up -d "$SERVICE"
  echo "Done. $SERVICE rebuilt and running."
  exit 0
fi

# ── Full rebuild ──────────────────────────────────────────────────────────────

echo "Stopping all containers..."
for c in "${CONTAINERS[@]}"; do
  docker stop "$c" 2>/dev/null || true
  docker rm   "$c" 2>/dev/null || true
done

echo "Removing built images..."
for img in "${IMAGES[@]}"; do
  docker rmi "$img" 2>/dev/null || true
done

echo "Ensuring acs-net network exists..."
docker network create acs-net 2>/dev/null || echo "   (already exists)"

echo "Building all images (no cache)..."
docker compose build --no-cache

echo "Starting all services..."
docker compose up -d

echo ""
echo "Done. All Access Control System containers rebuilt and running."
echo ""
echo "   acs-valkey    — Valkey (BullMQ queue)"
echo "   acs-mqtt      — Mosquitto MQTT broker  (port 8883 TLS)"
echo "   acs-backend   — Node.js API             (port 5001)"
echo "   acs-frontend  — Next.js dashboard       (port 3000)"
echo ""
echo "   Logs:   docker compose logs -f"
echo "   Status: docker compose ps"
