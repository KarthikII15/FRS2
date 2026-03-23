#!/bin/bash
# ============================================================
# JETSON STEP J04 — Get auth token from backend
# Run this ON THE JETSON (172.18.3.202)
#
# The runner.py reads a token from /opt/frs/device_token.txt
# and sends it as Authorization: Bearer <token> on every
# POST /api/face/recognize request.
# ============================================================
set -e

VM_IP="172.20.100.222"
TOKEN_FILE="/opt/frs/device_token.txt"

echo ""
echo "=================================================="
echo " JETSON J04: Get auth token from backend"
echo "=================================================="
echo ""

mkdir -p /opt/frs

# ── Try AUTH_MODE=api login first ─────────────────────────
echo "[1/2] Requesting token from backend (API mode login)..."

LOGIN_RESP=$(curl -s --max-time 10 \
  -X POST "http://${VM_IP}:8080/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","password":"admin123"}')

TOKEN=$(echo "$LOGIN_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('accessToken',''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "  API login failed. Trying Keycloak mode..."

  # Try Keycloak
  KC_RESP=$(curl -s --max-time 10 \
    -X POST "http://${VM_IP}:9090/realms/attendance/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=attendance-frontend&username=admin@company.com&password=admin123&grant_type=password")

  TOKEN=$(echo "$KC_RESP" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null || echo "")

  if [ -z "$TOKEN" ]; then
    echo "  ❌ Both API and Keycloak login failed"
    echo "     API response:      $LOGIN_RESP"
    echo "     Keycloak response: $KC_RESP"
    echo ""
    echo "  Make sure the backend is running on VM (Step 08)"
    exit 1
  fi
  echo "  ✅ Got token via Keycloak"
else
  echo "  ✅ Got token via API auth"
fi

# ── Write token to file ───────────────────────────────────
echo ""
echo "[2/2] Writing token to $TOKEN_FILE ..."
echo "$TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"

# Verify
TOKEN_LEN=$(wc -c < "$TOKEN_FILE")
echo "  ✅ Token written ($TOKEN_LEN bytes)"

# Decode expiry
python3 -c "
import sys, json, base64, datetime
token = open('/opt/frs/device_token.txt').read().strip()
parts = token.split('.')
if len(parts) >= 2:
    payload = parts[1] + '=' * (4 - len(parts[1]) % 4)
    d = json.loads(base64.urlsafe_b64decode(payload))
    exp = d.get('exp', 0)
    if exp:
        expiry = datetime.datetime.fromtimestamp(exp)
        now = datetime.datetime.now()
        mins = int((expiry - now).total_seconds() / 60)
        print(f'  Token expires: {expiry.strftime(\"%H:%M:%S\")} ({mins} minutes from now)')
        print(f'  Email: {d.get(\"email\", d.get(\"preferred_username\", \"?\"))}')
" 2>/dev/null || echo "  (Could not decode expiry)"

echo ""
echo "=================================================="
echo " ✅ JETSON J04 COMPLETE"
echo "=================================================="
echo ""
echo "  Token file: $TOKEN_FILE"
echo "  Token will expire in ~30 min."
echo "  Step J05 sets up auto-refresh every 25 min."
echo ""
echo "Next: Run J05_setup_token_cron.sh"
echo ""
