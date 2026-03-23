#!/bin/bash
# ============================================================
# STEP 12 — Full Keycloak → Backend bootstrap verification
# Run this on the VM (172.20.100.222)
# ============================================================

VM_IP="172.20.100.222"

echo ""
echo "=================================================="
echo " STEP 12: Full Keycloak auth flow verification"
echo "=================================================="
echo ""

PASS=0
FAIL=0

check() {
  if [ "$1" = "pass" ]; then
    echo "  ✅ $2"
    PASS=$((PASS+1))
  else
    echo "  ❌ $2"
    echo "     Detail: $3"
    FAIL=$((FAIL+1))
  fi
}

# ── 1. Get Keycloak token ─────────────────────────────────
echo "[1/5] Logging in as admin via Keycloak..."
KC_RESP=$(curl -s -X POST \
  "http://${VM_IP}:9090/realms/attendance/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=attendance-frontend&username=admin@company.com&password=admin123&grant_type=password")

KC_TOKEN=$(echo "$KC_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null)

if [ -z "$KC_TOKEN" ]; then
  check "fail" "Keycloak login" "$KC_RESP"
  echo ""
  echo "  Cannot continue without a token. Fix Keycloak first."
  exit 1
fi
check "pass" "Keycloak admin login successful"

# ── 2. Verify JWT claims ──────────────────────────────────
echo ""
echo "[2/5] Verifying JWT claims..."
CLAIMS=$(echo "$KC_TOKEN" | python3 -c "
import sys, json, base64
token = sys.stdin.read().strip()
parts = token.split('.')
payload = parts[1] + '=' * (4 - len(parts[1]) % 4)
d = json.loads(base64.urlsafe_b64decode(payload))
print(json.dumps(d))
" 2>/dev/null)

ISS=$(echo "$CLAIMS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('iss',''))" 2>/dev/null)
AUD=$(echo "$CLAIMS" | python3 -c "import sys,json; d=json.load(sys.stdin); a=d.get('aud',[]); print(str(a))" 2>/dev/null)
ROLES=$(echo "$CLAIMS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str(d.get('realm_access',{}).get('roles',[])))" 2>/dev/null)
EMAIL=$(echo "$CLAIMS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('email',''))" 2>/dev/null)

EXPECTED_ISS="http://${VM_IP}:9090/realms/attendance"
if [ "$ISS" = "$EXPECTED_ISS" ]; then
  check "pass" "iss matches: $ISS"
else
  check "fail" "iss mismatch" "Expected: $EXPECTED_ISS  Got: $ISS"
fi

if echo "$AUD" | grep -q "attendance-frontend"; then
  check "pass" "aud contains attendance-frontend: $AUD"
else
  check "fail" "aud missing attendance-frontend" "Got: $AUD — Run Step 10 again"
fi

if echo "$ROLES" | grep -q "admin"; then
  check "pass" "realm_access.roles contains admin: $ROLES"
else
  check "fail" "role 'admin' not in token" "Got: $ROLES"
fi

if [ "$EMAIL" = "admin@company.com" ]; then
  check "pass" "email claim: $EMAIL"
else
  check "fail" "email claim wrong" "Got: $EMAIL"
fi

# ── 3. Call backend bootstrap with Keycloak token ────────
echo ""
echo "[3/5] Calling backend bootstrap with Keycloak token..."
BOOT_RESP=$(curl -s \
  "http://${VM_IP}:8080/api/auth/bootstrap" \
  -H "Authorization: Bearer $KC_TOKEN")

if echo "$BOOT_RESP" | grep -q '"memberships"'; then
  check "pass" "Backend bootstrap returned memberships"
else
  check "fail" "Backend bootstrap failed" "$BOOT_RESP"
fi

if echo "$BOOT_RESP" | grep -q '"tenants"'; then
  check "pass" "Bootstrap returned tenant catalog"
fi

if echo "$BOOT_RESP" | grep -q "admin@company.com"; then
  check "pass" "Bootstrap returned correct user"
fi

BOOT_ROLE=$(echo "$BOOT_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('role',''))" 2>/dev/null)
if [ "$BOOT_ROLE" = "admin" ]; then
  check "pass" "User role in bootstrap response: admin"
else
  check "fail" "User role in bootstrap response" "Expected 'admin', got '$BOOT_ROLE'"
fi

# ── 4. Test HR user ───────────────────────────────────────
echo ""
echo "[4/5] Testing HR user login..."
HR_RESP=$(curl -s -X POST \
  "http://${VM_IP}:9090/realms/attendance/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=attendance-frontend&username=hr@company.com&password=hr123&grant_type=password")
HR_TOKEN=$(echo "$HR_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null)

if [ -n "$HR_TOKEN" ]; then
  check "pass" "HR user Keycloak login successful"
  HR_BOOT=$(curl -s "http://${VM_IP}:8080/api/auth/bootstrap" \
    -H "Authorization: Bearer $HR_TOKEN")
  HR_ROLE=$(echo "$HR_BOOT" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('role',''))" 2>/dev/null)
  if [ "$HR_ROLE" = "hr" ]; then
    check "pass" "HR user role correctly set: hr"
  else
    check "fail" "HR user role" "Expected 'hr', got '$HR_ROLE'"
  fi
else
  check "fail" "HR login" "$HR_RESP"
fi

# ── 5. Test WebSocket endpoint ────────────────────────────
echo ""
echo "[5/5] Verifying WebSocket endpoint..."
WS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://${VM_IP}:8080/socket.io/?EIO=4&transport=polling")
if [ "$WS_STATUS" = "200" ]; then
  check "pass" "Socket.io polling endpoint responding"
else
  check "fail" "Socket.io endpoint" "HTTP $WS_STATUS"
fi

echo ""
echo "=================================================="
if [ "$FAIL" -eq 0 ]; then
  echo " ✅ STEP 12 COMPLETE — All $PASS checks passed"
  echo "    Keycloak ↔ Backend flow is FULLY WORKING"
else
  echo " ⚠️  STEP 12 DONE — $PASS passed, $FAIL failed"
fi
echo "=================================================="
echo ""
echo "Next: Run 13_register_camera_device.sh"
echo ""
