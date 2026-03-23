#!/bin/bash
# ============================================================
# STEP 05 — Start infrastructure: Postgres + Kafka + Keycloak
# Run this on the VM (172.20.100.222)
# Do NOT start backend or frontend yet — migrations come first
# ============================================================
set -e

PROJECT="/home/administrator/FRS_/FRS--Java-Verison"

echo ""
echo "=================================================="
echo " STEP 05: Starting infrastructure containers"
echo "=================================================="
echo ""

cd "$PROJECT"

# Pull images first (faster startup later)
echo "[1/3] Pulling Docker images (this takes a few minutes first time)..."
docker compose pull postgres kafka keycloak-db keycloak
echo "   ✅ Images pulled"

# Start infrastructure services only
echo ""
echo "[2/3] Starting Postgres + Kafka + Keycloak..."
docker compose up -d postgres kafka keycloak-db keycloak

echo ""
echo "[3/3] Containers started. Waiting for them to become healthy..."
echo "      (Keycloak takes 60-90 seconds on first boot to import the realm)"
echo ""

# Show live status
docker compose ps postgres kafka keycloak-db keycloak

echo ""
echo "=================================================="
echo " ✅ STEP 05 COMPLETE"
echo "=================================================="
echo ""
echo "Next: Run 06_wait_and_verify_infra.sh"
echo "      (waits until all services are healthy before proceeding)"
echo ""
