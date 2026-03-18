#!/bin/bash
# Run from: ~/FRS_/FRS--Java-Verison/
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; }
info() { echo -e "${YELLOW}▶  $1${NC}"; }
step() { echo -e "\n${BLUE}══════════════════════════════════════${NC}\n${BLUE}  $1${NC}\n${BLUE}══════════════════════════════════════${NC}"; }

step "DIAGNOSE — What is the actual backend error?"
info "Backend log around the bootstrap crash:"
grep -i "error\|crash\|keycloak\|jwks\|audience\|issuer\|verif" /tmp/backend.log | tail -30
echo ""
info "Last 20 lines of backend log:"
tail -20 /tmp/backend.log

step "DIAGNOSE — Decode the JWT to see what audience it actually contains"
info "Getting a fresh token and decoding it..."
TOKEN_RESP=$(curl -s -X POST \
  "http://172.20.100.222:9090/realms/attendance/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=attendance-frontend&grant_type=password&username=admin@company.com&password=admin123")

if echo "$TOKEN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'access_token' in d else 1)" 2>/dev/null; then
  TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
  ok "Got token"

  info "Decoded JWT payload:"
  echo "$TOKEN" | cut -d. -f2 | python3 -c "
import sys, base64, json
data = sys.stdin.read().strip()
# Add padding
data += '=' * (4 - len(data) % 4)
decoded = base64.b64decode(data)
payload = json.loads(decoded)
# Print the fields that matter for auth
for key in ['iss', 'aud', 'azp', 'sub', 'email', 'realm_access', 'exp']:
    if key in payload:
        print(f'  {key}: {json.dumps(payload[key])}')
"

  echo ""
  info "Current backend .env Keycloak config:"
  grep "KEYCLOAK_" backend/.env
  
else
  fail "Could not get token: $TOKEN_RESP"
  exit 1
fi

step "FIX — The audience field mismatch"
info "Keycloak access tokens for public clients often have aud=account not aud=attendance-frontend"
info "The backend keycloakVerifier.js hardcodes audience check to 'attendance-frontend'"
info "Checking what's actually in the token..."

AUD=$(echo "$TOKEN" | cut -d. -f2 | python3 -c "
import sys, base64, json
data = sys.stdin.read().strip()
data += '=' * (4 - len(data) % 4)
payload = json.loads(base64.b64decode(data))
aud = payload.get('aud', 'NOT_FOUND')
print(aud if isinstance(aud, str) else json.dumps(aud))
" 2>/dev/null)
echo "  Token audience: $AUD"

ISS=$(echo "$TOKEN" | cut -d. -f2 | python3 -c "
import sys, base64, json
data = sys.stdin.read().strip()
data += '=' * (4 - len(data) % 4)
payload = json.loads(base64.b64decode(data))
print(payload.get('iss','NOT_FOUND'))
" 2>/dev/null)
echo "  Token issuer:   $ISS"

# The fix: update KEYCLOAK_AUDIENCE to match the actual aud in the token
# For public clients, this is typically "account" — we need to update the verifier
# OR update KEYCLOAK_AUDIENCE in .env to match

info "Updating KEYCLOAK_AUDIENCE to match actual token audience..."
if echo "$AUD" | grep -q "account"; then
  info "Token has aud=account — updating backend to accept 'account'"
  sed -i 's/^KEYCLOAK_AUDIENCE=.*/KEYCLOAK_AUDIENCE=account/' backend/.env
  ok "KEYCLOAK_AUDIENCE=account"
elif echo "$AUD" | grep -q "attendance-frontend"; then
  info "Token aud already matches attendance-frontend — different issue"
  sed -i 's/^KEYCLOAK_AUDIENCE=.*/KEYCLOAK_AUDIENCE=attendance-frontend/' backend/.env
  ok "KEYCLOAK_AUDIENCE=attendance-frontend confirmed"
else
  # AUD might be an array or something else
  info "Audience is: $AUD — extracting first value"
  FIRST_AUD=$(echo "$TOKEN" | cut -d. -f2 | python3 -c "
import sys, base64, json
data = sys.stdin.read().strip()
data += '=' * (4 - len(data) % 4)
payload = json.loads(base64.b64decode(data))
aud = payload.get('aud', '')
print(aud[0] if isinstance(aud, list) else aud)
" 2>/dev/null)
  info "Using first audience value: $FIRST_AUD"
  sed -i "s/^KEYCLOAK_AUDIENCE=.*/KEYCLOAK_AUDIENCE=$FIRST_AUD/" backend/.env
  ok "KEYCLOAK_AUDIENCE=$FIRST_AUD"
fi

# Also check if issuer in token matches backend config
BACKEND_ISSUER=$(grep "^KEYCLOAK_ISSUER=" backend/.env | cut -d= -f2)
if [ "$ISS" != "$BACKEND_ISSUER" ]; then
  fail "ISSUER MISMATCH!"
  echo "  Token iss:      $ISS"
  echo "  backend config: $BACKEND_ISSUER"
  info "Fixing KEYCLOAK_ISSUER to match token..."
  sed -i "s|^KEYCLOAK_ISSUER=.*|KEYCLOAK_ISSUER=$ISS|" backend/.env
  # Also fix JWKS URI to use same base
  KC_BASE=$(echo "$ISS" | sed 's|/realms/.*||')
  KC_REALM=$(echo "$ISS" | sed 's|.*/realms/||')
  sed -i "s|^KEYCLOAK_JWKS_URI=.*|KEYCLOAK_JWKS_URI=$KC_BASE/realms/$KC_REALM/protocol/openid-connect/certs|" backend/.env
  ok "Issuer and JWKS URI fixed"
else
  ok "Issuer matches: $ISS"
fi

echo ""
info "Final backend Keycloak config:"
grep "KEYCLOAK_" backend/.env

step "RESTART backend with fixed config"
kill $(cat /tmp/backend.pid 2>/dev/null) 2>/dev/null
fuser -k 8080/tcp 2>/dev/null
sleep 2
cd backend
nohup npm run dev > /tmp/backend.log 2>&1 &
echo $! > /tmp/backend.pid
cd ..

info "Waiting for backend..."
for i in $(seq 1 15); do
  if curl -s --max-time 2 http://localhost:8080/api/health | grep -q '"UP"'; then
    ok "Backend UP"
    break
  fi
  sleep 2
  echo "  waiting... ($i/15)"
done

step "TEST — Full end-to-end with fixed config"
sleep 1
TOKEN_RESP2=$(curl -s -X POST \
  "http://172.20.100.222:9090/realms/attendance/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=attendance-frontend&grant_type=password&username=admin@company.com&password=admin123")
TOKEN2=$(echo "$TOKEN_RESP2" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)

if [ -z "$TOKEN2" ]; then
  fail "Could not get token: $TOKEN_RESP2"
  exit 1
fi

BOOTSTRAP=$(curl -s -H "Authorization: Bearer $TOKEN2" \
  http://172.20.100.222:8080/api/auth/bootstrap)

if echo "$BOOTSTRAP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'user' in d else 1)" 2>/dev/null; then
  ROLE=$(echo "$BOOTSTRAP" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['role'])" 2>/dev/null)
  EMAIL=$(echo "$BOOTSTRAP" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['email'])" 2>/dev/null)
  TENANT=$(echo "$BOOTSTRAP" | python3 -c "import sys,json; t=json.load(sys.stdin).get('tenants',[]); print(t[0]['name'] if t else 'none')" 2>/dev/null)
  echo ""
  ok "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ok "  KEYCLOAK END-TO-END COMPLETE"
  ok "  User:   $EMAIL"
  ok "  Role:   $ROLE"
  ok "  Tenant: $TENANT"
  ok "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  NOW: switch frontend to Keycloak SSO:"
  echo ""
  echo "    sed -i 's/VITE_AUTH_MODE=api/VITE_AUTH_MODE=keycloak/' .env"
  echo "    kill \$(cat /tmp/frontend.pid) 2>/dev/null"
  echo "    nohup npm run dev -- --host 0.0.0.0 --port 5173 > /tmp/frontend.log 2>&1 &"
  echo ""
  echo "  Then open: http://172.20.100.222:5173"
  echo "  You will be redirected to Keycloak login page"
  echo "  Login: admin@company.com / admin123"
else
  fail "Bootstrap still failing: $BOOTSTRAP"
  echo ""
  info "Backend error log:"
  grep -i "error\|keycloak\|audience\|issuer" /tmp/backend.log | tail -15
fi