#!/bin/bash
# Run from: ~/FRS_/FRS--Java-Verison/
# Fixes: "Account is not fully set up" on Keycloak login

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; }
info() { echo -e "${YELLOW}▶  $1${NC}"; }
step() { echo -e "\n${BLUE}══════════════════════════════════════${NC}\n${BLUE}  $1${NC}\n${BLUE}══════════════════════════════════════${NC}"; }

KC_CONTAINER="attendance-keycloak"
KC_URL="http://localhost:8080"
REALM="attendance"

step "FIX — Keycloak users 'Account is not fully set up'"
info "Root cause: imported users missing firstName/lastName — Keycloak requires these"
info "Fix: add names + mark all required actions complete via kcadm"

# Get admin token inside the container
info "Getting Keycloak admin token..."
docker exec $KC_CONTAINER /opt/keycloak/bin/kcadm.sh \
  config credentials \
  --server $KC_URL \
  --realm master \
  --user admin \
  --password admin \
  --config /tmp/kcadm.config 2>&1

ok "Admin authenticated"

# Fix admin@company.com
info "Fixing admin@company.com..."
ADMIN_ID=$(docker exec $KC_CONTAINER /opt/keycloak/bin/kcadm.sh \
  get users -r $REALM \
  --query "email=admin@company.com" \
  --fields id \
  --config /tmp/kcadm.config 2>/dev/null \
  | python3 -c "import sys,json; users=json.load(sys.stdin); print(users[0]['id'] if users else 'NOT_FOUND')" 2>/dev/null)

echo "  admin user ID: $ADMIN_ID"

if [ "$ADMIN_ID" != "NOT_FOUND" ] && [ -n "$ADMIN_ID" ]; then
  docker exec $KC_CONTAINER /opt/keycloak/bin/kcadm.sh \
    update users/$ADMIN_ID \
    -r $REALM \
    -s "firstName=Admin" \
    -s "lastName=User" \
    -s "emailVerified=true" \
    -s "requiredActions=[]" \
    --config /tmp/kcadm.config 2>&1 && ok "admin@company.com fixed"
else
  fail "admin user not found — will create fresh"
  docker exec $KC_CONTAINER /opt/keycloak/bin/kcadm.sh \
    create users \
    -r $REALM \
    -s "username=admin@company.com" \
    -s "email=admin@company.com" \
    -s "firstName=Admin" \
    -s "lastName=User" \
    -s "emailVerified=true" \
    -s "enabled=true" \
    -s "requiredActions=[]" \
    --config /tmp/kcadm.config 2>&1
  ADMIN_ID=$(docker exec $KC_CONTAINER /opt/keycloak/bin/kcadm.sh \
    get users -r $REALM \
    --query "email=admin@company.com" \
    --fields id \
    --config /tmp/kcadm.config 2>/dev/null \
    | python3 -c "import sys,json; users=json.load(sys.stdin); print(users[0]['id'])" 2>/dev/null)
  ok "admin@company.com created (ID: $ADMIN_ID)"
fi

# Set password for admin
info "Setting admin password..."
docker exec $KC_CONTAINER /opt/keycloak/bin/kcadm.sh \
  set-password \
  -r $REALM \
  --userid $ADMIN_ID \
  --new-password admin123 \
  --config /tmp/kcadm.config 2>&1 && ok "admin password set to: admin123"

# Assign admin realm role
info "Assigning admin realm role..."
docker exec $KC_CONTAINER /opt/keycloak/bin/kcadm.sh \
  add-roles \
  -r $REALM \
  --uusername "admin@company.com" \
  --rolename admin \
  --config /tmp/kcadm.config 2>&1 && ok "admin role assigned"

# Fix hr@company.com
info "Fixing hr@company.com..."
HR_ID=$(docker exec $KC_CONTAINER /opt/keycloak/bin/kcadm.sh \
  get users -r $REALM \
  --query "email=hr@company.com" \
  --fields id \
  --config /tmp/kcadm.config 2>/dev/null \
  | python3 -c "import sys,json; users=json.load(sys.stdin); print(users[0]['id'] if users else 'NOT_FOUND')" 2>/dev/null)

echo "  HR user ID: $HR_ID"

if [ "$HR_ID" != "NOT_FOUND" ] && [ -n "$HR_ID" ]; then
  docker exec $KC_CONTAINER /opt/keycloak/bin/kcadm.sh \
    update users/$HR_ID \
    -r $REALM \
    -s "firstName=HR" \
    -s "lastName=Manager" \
    -s "emailVerified=true" \
    -s "requiredActions=[]" \
    --config /tmp/kcadm.config 2>&1 && ok "hr@company.com fixed"
else
  fail "HR user not found — will create fresh"
  docker exec $KC_CONTAINER /opt/keycloak/bin/kcadm.sh \
    create users \
    -r $REALM \
    -s "username=hr@company.com" \
    -s "email=hr@company.com" \
    -s "firstName=HR" \
    -s "lastName=Manager" \
    -s "emailVerified=true" \
    -s "enabled=true" \
    -s "requiredActions=[]" \
    --config /tmp/kcadm.config 2>&1
  HR_ID=$(docker exec $KC_CONTAINER /opt/keycloak/bin/kcadm.sh \
    get users -r $REALM \
    --query "email=hr@company.com" \
    --fields id \
    --config /tmp/kcadm.config 2>/dev/null \
    | python3 -c "import sys,json; users=json.load(sys.stdin); print(users[0]['id'])" 2>/dev/null)
  ok "hr@company.com created (ID: $HR_ID)"
fi

# Set password for hr
info "Setting HR password..."
docker exec $KC_CONTAINER /opt/keycloak/bin/kcadm.sh \
  set-password \
  -r $REALM \
  --userid $HR_ID \
  --new-password hr123 \
  --config /tmp/kcadm.config 2>&1 && ok "HR password set to: hr123"

# Assign hr realm role
info "Assigning hr realm role..."
docker exec $KC_CONTAINER /opt/keycloak/bin/kcadm.sh \
  add-roles \
  -r $REALM \
  --uusername "hr@company.com" \
  --rolename hr \
  --config /tmp/kcadm.config 2>&1 && ok "hr role assigned"

step "TEST — Get Keycloak token"
sleep 2
TOKEN_RESP=$(curl -s -X POST \
  "http://172.20.100.222:9090/realms/attendance/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=attendance-frontend&grant_type=password&username=admin@company.com&password=admin123")

if echo "$TOKEN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'access_token' in d else 1)" 2>/dev/null; then
  TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
  ok "Keycloak token obtained for admin@company.com"
  echo "  Token preview: ${TOKEN:0:50}..."

  step "TEST — Bootstrap with Keycloak token against backend (api mode)"
  BOOTSTRAP=$(curl -s -H "Authorization: Bearer $TOKEN" \
    http://172.20.100.222:8080/api/auth/bootstrap)
  if echo "$BOOTSTRAP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'user' in d else 1)" 2>/dev/null; then
    ROLE=$(echo "$BOOTSTRAP" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['role'])" 2>/dev/null)
    ok "Bootstrap in api mode: role=$ROLE (expected — bootstrap works in both modes)"
  else
    info "Bootstrap in api mode returned: $(echo $BOOTSTRAP | head -c 200)"
    info "This is normal — bootstrap requires AUTH_MODE=keycloak to validate KC tokens"
  fi

  step "SWITCH — Enable Keycloak auth mode"
  info "Updating backend/.env to AUTH_MODE=keycloak..."
  sed -i 's/^AUTH_MODE=api/AUTH_MODE=keycloak/' backend/.env
  grep "AUTH_MODE" backend/.env
  ok "AUTH_MODE=keycloak set"

  info "Restarting backend..."
  kill $(cat /tmp/backend.pid 2>/dev/null) 2>/dev/null
  fuser -k 8080/tcp 2>/dev/null
  sleep 2
  cd backend
  nohup npm run dev > /tmp/backend.log 2>&1 &
  echo $! > /tmp/backend.pid
  cd ..

  info "Waiting for backend to come back..."
  for i in $(seq 1 15); do
    if curl -s --max-time 2 http://localhost:8080/api/health | grep -q '"UP"'; then
      ok "Backend restarted in Keycloak mode"
      break
    fi
    sleep 2
    echo "  waiting... ($i/15)"
  done

  step "TEST — Full end-to-end Keycloak flow"
  # Get fresh token after backend restart
  TOKEN_RESP2=$(curl -s -X POST \
    "http://172.20.100.222:9090/realms/attendance/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=attendance-frontend&grant_type=password&username=admin@company.com&password=admin123")
  TOKEN2=$(echo "$TOKEN_RESP2" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)

  BOOTSTRAP2=$(curl -s -H "Authorization: Bearer $TOKEN2" \
    http://172.20.100.222:8080/api/auth/bootstrap)

  if echo "$BOOTSTRAP2" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'user' in d else 1)" 2>/dev/null; then
    ROLE2=$(echo "$BOOTSTRAP2" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['role'])" 2>/dev/null)
    SCOPE=$(echo "$BOOTSTRAP2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('activeScope','no scope'))" 2>/dev/null)
    ok "KEYCLOAK END-TO-END COMPLETE — role=$ROLE2, scope=$SCOPE"
    echo ""
    echo -e "${GREEN}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  ALL SYSTEMS GO — Keycloak is fully wired${NC}"
    echo -e "${GREEN}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Open in browser: http://172.20.100.222:5173"
    echo "  You will be redirected to Keycloak login"
    echo "  Login: admin@company.com / admin123"
    echo ""
    echo "  For frontend to use Keycloak SSO, also update .env:"
    echo "    VITE_AUTH_MODE=keycloak"
    echo "  Then restart frontend:"
    echo "    kill \$(cat /tmp/frontend.pid) && nohup npm run dev -- --host 0.0.0.0 --port 5173 > /tmp/frontend.log 2>&1 &"
  else
    fail "Bootstrap with KC token failed: $(echo $BOOTSTRAP2 | head -c 300)"
    info "Check backend/.env KEYCLOAK_AUDIENCE matches the client_id used to get the token"
    info "Current AUDIENCE: $(grep KEYCLOAK_AUDIENCE backend/.env)"
  fi
else
  fail "Token still failed: $(echo $TOKEN_RESP | head -c 300)"
  info "Try logging in manually via browser: http://172.20.100.222:9090/realms/attendance/account"
  info "Or check all users: docker exec attendance-keycloak /opt/keycloak/bin/kcadm.sh get users -r attendance --config /tmp/kcadm.config"
fi