#!/bin/bash
# ============================================================
# STEP 09 — Verify backend smoke tests
# Run this on the VM (172.20.100.222)
# ============================================================

VM_IP="172.20.100.222"

echo ""
echo "=================================================="
echo " STEP 09: Backend smoke tests"
echo "=================================================="
echo ""

PASS=0
FAIL=0

check() {
  local NAME="$1"
  local RESULT="$2"
  local EXPECTED="$3"
  if echo "$RESULT" | grep -q "$EXPECTED"; then
    echo "  ✅ $NAME"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $NAME"
    echo "     Expected: $EXPECTED"
    echo "     Got:      $RESULT"
    FAIL=$((FAIL + 1))
  fi
}

# ── Test 1: Health endpoint ───────────────────────────────
echo "[1/5] Testing /api/health ..."
HEALTH=$(curl -s "http://${VM_IP}:8080/api/health")
check "health status=UP" "$HEALTH" '"status":"UP"'
check "database=UP"      "$HEALTH" '"database"'

# ── Test 2: Metrics endpoint ──────────────────────────────
echo ""
echo "[2/5] Testing /api/metrics ..."
METRICS=$(curl -s "http://${VM_IP}:8080/api/metrics")
check "metrics returns system info" "$METRICS" '"system"'

# ── Test 3: Login with admin ──────────────────────────────
echo ""
echo "[3/5] Testing /api/auth/login (admin) ..."
LOGIN_RESP=$(curl -s -X POST "http://${VM_IP}:8080/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","password":"admin123"}')
check "login returns accessToken" "$LOGIN_RESP" '"accessToken"'
check "login returns user role"   "$LOGIN_RESP" '"role":"admin"'

# Extract token for further tests
ACCESS_TOKEN=$(echo "$LOGIN_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('accessToken',''))" 2>/dev/null || echo "")

if [ -z "$ACCESS_TOKEN" ]; then
  echo "  ❌ Could not extract access token — skipping authenticated tests"
  FAIL=$((FAIL + 1))
else
  echo "  ✅ Access token extracted (${#ACCESS_TOKEN} chars)"

  # ── Test 4: /api/me ──────────────────────────────────────
  echo ""
  echo "[4/5] Testing /api/me ..."
  ME_RESP=$(curl -s "http://${VM_IP}:8080/api/me" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  check "me returns email" "$ME_RESP" "admin@company.com"

  # ── Test 5: Bootstrap ─────────────────────────────────────
  echo ""
  echo "[5/5] Testing /api/auth/bootstrap ..."
  BOOT_RESP=$(curl -s "http://${VM_IP}:8080/api/auth/bootstrap" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  check "bootstrap returns memberships" "$BOOT_RESP" '"memberships"'
  check "bootstrap returns tenants"     "$BOOT_RESP" '"tenants"'
fi

echo ""
echo "=================================================="
if [ "$FAIL" -eq 0 ]; then
  echo " ✅ STEP 09 COMPLETE — All $PASS tests passed"
else
  echo " ⚠️  STEP 09 DONE — $PASS passed, $FAIL failed"
  echo "    Check docker compose logs backend for errors"
fi
echo "=================================================="
echo ""
echo "Next: Run 10_setup_keycloak_mappers.sh"
echo ""
