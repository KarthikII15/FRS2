#!/bin/bash
# ── Run this on the VM (172.20.100.222) to verify every service ──────────────
VM_IP="172.20.100.222"
JETSON_IP="172.18.3.202"
CAMERA_IP="172.18.3.201"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

ok()   { echo -e "${GREEN}  ✅ $1${NC}"; }
fail() { echo -e "${RED}  ❌ $1${NC}"; }
info() { echo -e "${YELLOW}  ℹ  $1${NC}"; }

echo ""
echo "═══════════════════════════════════════════"
echo "  FRS Setup Verification"
echo "  VM: $VM_IP   Jetson: $JETSON_IP   Camera: $CAMERA_IP"
echo "═══════════════════════════════════════════"

echo ""
echo "── Backend ─────────────────────────────────"
HEALTH=$(curl -s --max-time 3 http://$VM_IP:8080/api/health 2>/dev/null)
if echo "$HEALTH" | grep -q '"status":"UP"'; then
  ok "Backend is UP (http://$VM_IP:8080/api/health)"
else
  fail "Backend not reachable at http://$VM_IP:8080"
fi

echo ""
echo "── Auth (api mode) ─────────────────────────"
TOKEN=$(curl -s --max-time 5 -X POST http://$VM_IP:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","password":"admin123"}' \
  2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('accessToken','FAIL'))" 2>/dev/null)
if [ "$TOKEN" != "FAIL" ] && [ -n "$TOKEN" ]; then
  ok "Login works — got access token (${#TOKEN} chars)"
  BOOTSTRAP=$(curl -s --max-time 5 -H "Authorization: Bearer $TOKEN" \
    http://$VM_IP:8080/api/auth/bootstrap 2>/dev/null)
  ROLE=$(echo "$BOOTSTRAP" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['role'])" 2>/dev/null)
  if [ "$ROLE" = "admin" ]; then
    ok "Bootstrap works — user role: $ROLE"
  else
    fail "Bootstrap failed: $BOOTSTRAP"
  fi
else
  fail "Login failed — check backend/.env and seed data"
fi

echo ""
echo "── Keycloak ────────────────────────────────"
KC_ISSUER=$(curl -s --max-time 5 \
  http://$VM_IP:9090/realms/attendance/.well-known/openid-configuration \
  2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['issuer'])" 2>/dev/null)
if [ "$KC_ISSUER" = "http://$VM_IP:9090/realms/attendance" ]; then
  ok "Keycloak running — issuer: $KC_ISSUER"
else
  fail "Keycloak not reachable or realm missing (got: $KC_ISSUER)"
  info "Start with: docker-compose -f docker-compose.keycloak.yml up -d"
fi

KC_TOKEN=$(curl -s --max-time 5 -X POST \
  "http://$VM_IP:9090/realms/attendance/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=attendance-frontend&grant_type=password&username=admin@company.com&password=admin123" \
  2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token','FAIL')[:20])" 2>/dev/null)
if [ "$KC_TOKEN" != "FAIL" ] && [ -n "$KC_TOKEN" ]; then
  ok "Keycloak login works for admin@company.com"
else
  fail "Keycloak login failed — check realm-export.json users"
fi

echo ""
echo "── Frontend ────────────────────────────────"
FRONT=$(curl -s --max-time 3 -o /dev/null -w "%{http_code}" http://$VM_IP:5173 2>/dev/null)
if [ "$FRONT" = "200" ]; then
  ok "Frontend reachable at http://$VM_IP:5173"
else
  fail "Frontend not reachable (HTTP $FRONT) — is npm run dev running?"
fi

echo ""
echo "── Jetson ──────────────────────────────────"
JETSON_HEALTH=$(curl -s --max-time 3 http://$JETSON_IP:5000/health 2>/dev/null)
if echo "$JETSON_HEALTH" | grep -qi "ok\|healthy\|running"; then
  ok "Jetson sidecar reachable at http://$JETSON_IP:5000"
else
  fail "Jetson sidecar not reachable — is runner.py running on the Jetson?"
  info "SSH to Jetson and run: cd /opt/frs && python3 runner.py"
fi

echo ""
echo "── Camera ──────────────────────────────────"
SNAP=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" \
  "http://admin:YOUR_CAMERA_PASSWORD@$CAMERA_IP:80/ISAPI/Streaming/channels/101/picture" 2>/dev/null)
if [ "$SNAP" = "200" ]; then
  ok "Camera ISAPI snapshot responding (HTTP 200)"
else
  fail "Camera not reachable or wrong password (HTTP $SNAP at $CAMERA_IP)"
  info "Try: curl -u admin:PASSWORD http://$CAMERA_IP:80/ISAPI/System/deviceInfo"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  Done. Fix any ❌ items above before going live."
echo "═══════════════════════════════════════════"
echo ""
