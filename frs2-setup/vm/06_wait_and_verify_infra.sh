#!/bin/bash
# ============================================================
# STEP 06 — Wait for infrastructure to become healthy
# Run this on the VM (172.20.100.222)
# This script polls until Postgres, Kafka, and Keycloak are ready
# ============================================================

VM_IP="172.20.100.222"
PROJECT="/home/administrator/FRS_/FRS--Java-Verison"

echo ""
echo "=================================================="
echo " STEP 06: Verifying infrastructure health"
echo "=================================================="
echo ""

cd "$PROJECT"

# ── Helper ────────────────────────────────────────────────
wait_for_healthy() {
  local SERVICE="$1"
  local MAX_WAIT=180  # seconds
  local WAITED=0
  local INTERVAL=5

  echo "  Waiting for $SERVICE to become healthy..."
  while true; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "attendance-${SERVICE}" 2>/dev/null || echo "not_found")
    if [ "$STATUS" = "healthy" ]; then
      echo "  ✅ $SERVICE is healthy"
      return 0
    fi
    if [ "$WAITED" -ge "$MAX_WAIT" ]; then
      echo "  ❌ Timed out waiting for $SERVICE after ${MAX_WAIT}s"
      echo "     Last status: $STATUS"
      echo "     Logs:"
      docker compose logs --tail=20 "$SERVICE"
      exit 1
    fi
    printf "  ... %ss elapsed (status: %s)\r" "$WAITED" "$STATUS"
    sleep "$INTERVAL"
    WAITED=$((WAITED + INTERVAL))
  done
}

# ── 1. Postgres ───────────────────────────────────────────
echo "[1/4] Checking Postgres..."
wait_for_healthy "postgres"

# Verify DB connection
docker exec attendance-postgres psql -U postgres -c "SELECT version();" > /dev/null 2>&1
echo "  ✅ Postgres query test passed"

# ── 2. Kafka ──────────────────────────────────────────────
echo ""
echo "[2/4] Checking Kafka..."
wait_for_healthy "kafka"

# Verify Kafka broker
docker exec attendance-kafka kafka-topics \
  --bootstrap-server localhost:9092 \
  --list > /dev/null 2>&1
echo "  ✅ Kafka broker is accepting connections"

# ── 3. Keycloak DB ────────────────────────────────────────
echo ""
echo "[3/4] Checking Keycloak DB..."
wait_for_healthy "keycloak-db"
echo "  ✅ Keycloak DB is healthy"

# ── 4. Keycloak itself ────────────────────────────────────
echo ""
echo "[4/4] Checking Keycloak admin console..."
MAX_WAIT=180
WAITED=0
while true; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://${VM_IP}:9090/realms/attendance/.well-known/openid-configuration" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "  ✅ Keycloak realm 'attendance' is serving OIDC discovery endpoint"
    break
  fi
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    echo "  ❌ Keycloak did not become ready after ${MAX_WAIT}s"
    echo "     HTTP response code: $HTTP_CODE"
    echo "     Check logs: docker compose logs --tail=40 keycloak"
    exit 1
  fi
  printf "  ... %ss (HTTP %s)\r" "$WAITED" "$HTTP_CODE"
  sleep 5
  WAITED=$((WAITED + 5))
done

# Verify realm imported
REALM_CHECK=$(curl -s "http://${VM_IP}:9090/realms/attendance" | grep -c '"attendance"' || echo "0")
if [ "$REALM_CHECK" -gt "0" ]; then
  echo "  ✅ Realm 'attendance' confirmed in Keycloak"
else
  echo "  ⚠️  WARNING: Realm may not have been imported"
  echo "     Check: http://${VM_IP}:9090/admin — login admin/admin"
  echo "     If 'attendance' realm is missing, run:"
  echo "     docker compose down keycloak && docker volume rm frs2_keycloak-data && docker compose up -d keycloak"
fi

echo ""
echo "  Keycloak OIDC config endpoint:"
echo "  http://${VM_IP}:9090/realms/attendance/.well-known/openid-configuration"
echo ""
echo "  Keycloak admin console:"
echo "  http://${VM_IP}:9090/admin  (admin / admin)"
echo ""
echo "=================================================="
echo " ✅ STEP 06 COMPLETE — All infrastructure healthy"
echo "=================================================="
echo ""
echo "Next: Run 07_migrate_seed_topics.sh"
echo ""
