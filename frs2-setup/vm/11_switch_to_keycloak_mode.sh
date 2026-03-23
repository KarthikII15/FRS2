#!/bin/bash
# ============================================================
# STEP 11 — Switch AUTH_MODE=keycloak and restart
# Run this on the VM (172.20.100.222)
# ============================================================
set -e

VM_IP="172.20.100.222"
PROJECT="/home/administrator/FRS_/FRS--Java-Verison"

echo ""
echo "=================================================="
echo " STEP 11: Switching to Keycloak auth mode"
echo "=================================================="
echo ""

# ── Update backend .env ───────────────────────────────────
echo "[1/3] Updating backend .env: AUTH_MODE=keycloak ..."
sed -i 's/^AUTH_MODE=api/AUTH_MODE=keycloak/' "$PROJECT/backend/.env"

# Verify change
CURRENT_MODE=$(grep "^AUTH_MODE=" "$PROJECT/backend/.env")
echo "  Backend .env: $CURRENT_MODE"

if ! echo "$CURRENT_MODE" | grep -q "keycloak"; then
  echo "  ❌ sed did not change the value. Setting manually..."
  # Remove any AUTH_MODE line and append the correct one
  sed -i '/^AUTH_MODE=/d' "$PROJECT/backend/.env"
  echo "AUTH_MODE=keycloak" >> "$PROJECT/backend/.env"
  echo "  ✅ AUTH_MODE=keycloak written"
fi

# ── Update frontend .env ──────────────────────────────────
echo ""
echo "[2/3] Updating frontend .env: VITE_AUTH_MODE=keycloak ..."
sed -i 's/^VITE_AUTH_MODE=api/VITE_AUTH_MODE=keycloak/' "$PROJECT/.env"

CURRENT_VITE_MODE=$(grep "^VITE_AUTH_MODE=" "$PROJECT/.env")
echo "  Frontend .env: $CURRENT_VITE_MODE"

if ! echo "$CURRENT_VITE_MODE" | grep -q "keycloak"; then
  sed -i '/^VITE_AUTH_MODE=/d' "$PROJECT/.env"
  echo "VITE_AUTH_MODE=keycloak" >> "$PROJECT/.env"
  echo "  ✅ VITE_AUTH_MODE=keycloak written"
fi

# ── Rebuild and restart containers ────────────────────────
echo ""
echo "[3/3] Rebuilding and restarting backend + frontend..."
cd "$PROJECT"

docker compose build backend frontend
docker compose up -d backend frontend

echo ""
echo "  Waiting for backend to restart..."
MAX_WAIT=90
WAITED=0
while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://${VM_IP}:8080/api/health" 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "  ✅ Backend restarted and healthy"
    break
  fi
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    echo "  ❌ Backend did not restart in time"
    docker compose logs --tail=30 backend
    exit 1
  fi
  printf "  ... %ss\r" "$WAITED"
  sleep 5
  WAITED=$((WAITED + 5))
done

echo ""
echo "=================================================="
echo " ✅ STEP 11 COMPLETE"
echo "=================================================="
echo ""
echo "Next: Run 12_verify_keycloak_flow.sh"
echo ""
