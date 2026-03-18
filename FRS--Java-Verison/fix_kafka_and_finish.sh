#!/bin/bash
# Run from: ~/FRS_/FRS--Java-Verison/
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; }
info() { echo -e "${YELLOW}▶  $1${NC}"; }
step() { echo -e "\n${BLUE}══════════════════════════════════════${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}══════════════════════════════════════${NC}"; }

step "FIX 1 — Kafka DNS (EAI_AGAIN kafka)"
# The backend runs outside Docker so it can't resolve the hostname "kafka"
# Fix: change KAFKA_BROKERS in backend/.env from "kafka:9092" to "localhost:9092"
# AND expose Kafka to host in docker-compose.yml

info "Fixing backend/.env KAFKA_BROKERS..."
sed -i 's/^KAFKA_BROKERS=kafka:9092/KAFKA_BROKERS=localhost:9092/' backend/.env
grep "KAFKA_BROKERS" backend/.env
ok "KAFKA_BROKERS set to localhost:9092"

info "Checking Kafka advertised listeners — need to add host listener..."
# The current docker-compose.yml only advertises kafka:9092 (internal Docker DNS)
# We need to also advertise on localhost:9092 for the host-running backend
CURRENT=$(grep "KAFKA_ADVERTISED_LISTENERS" docker-compose.yml)
echo "Current: $CURRENT"

if echo "$CURRENT" | grep -q "PLAINTEXT_HOST"; then
  info "Host listener already configured"
else
  info "Adding PLAINTEXT_HOST listener to Kafka config..."
  # Update docker-compose.yml kafka environment
  sed -i 's|KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: "CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT"|KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: "CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT"|' docker-compose.yml
  sed -i 's|KAFKA_LISTENERS: "PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:29093"|KAFKA_LISTENERS: "PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:29093,PLAINTEXT_HOST://0.0.0.0:9093"|' docker-compose.yml
  sed -i 's|KAFKA_ADVERTISED_LISTENERS: "PLAINTEXT://kafka:9092"|KAFKA_ADVERTISED_LISTENERS: "PLAINTEXT://kafka:9092,PLAINTEXT_HOST://localhost:9093"|' docker-compose.yml
  sed -i 's|KAFKA_INTER_BROKER_LISTENER_NAME: "PLAINTEXT"|KAFKA_INTER_BROKER_LISTENER_NAME: "PLAINTEXT"|' docker-compose.yml

  # Expose port 9093 for host access
  if ! grep -q "9093:9093" docker-compose.yml; then
    sed -i '/- "9092:9092"/a\      - "9093:9093"' docker-compose.yml
  fi

  info "Restarting Kafka with new config..."
  docker compose restart kafka
  ok "Kafka restarted with host listener on port 9093"

  info "Updating backend/.env to use port 9093 for host access..."
  sed -i 's/^KAFKA_BROKERS=localhost:9092/KAFKA_BROKERS=localhost:9093/' backend/.env
  grep "KAFKA_BROKERS" backend/.env
fi

info "Waiting for Kafka on port 9093..."
for i in $(seq 1 20); do
  if nc -z localhost 9093 2>/dev/null; then
    ok "Kafka host port 9093 is open"
    break
  fi
  # Also try 9092 in case the listener is already there
  if nc -z localhost 9092 2>/dev/null; then
    ok "Kafka is reachable on localhost:9092"
    sed -i 's/^KAFKA_BROKERS=localhost:9093/KAFKA_BROKERS=localhost:9092/' backend/.env
    break
  fi
  if [ $i -eq 20 ]; then
    fail "Kafka not reachable on host — Kafka is non-fatal, continuing"
  fi
  sleep 3
  echo "  waiting... ($i/20)"
done

step "FIX 2 — Create Kafka topics (now with correct broker address)"
cd backend
node scripts/create-topics.js 2>&1 | tail -5 || info "Topics creation failed — Kafka is non-fatal"
cd ..

step "FIX 3 — Restart backend with fixed Kafka config"
info "Restarting backend..."
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
    ok "Backend restarted"
    break
  fi
  sleep 2
  echo "  waiting... ($i/15)"
done

step "FIX 4 — Wait for Keycloak (checking every 10s)"
info "Checking Keycloak status..."
for i in $(seq 1 30); do
  KC=$(curl -s --max-time 5 http://172.20.100.222:9090/realms/attendance/.well-known/openid-configuration 2>/dev/null)
  if echo "$KC" | grep -q '"issuer"'; then
    ISSUER=$(echo "$KC" | python3 -c "import sys,json; print(json.load(sys.stdin)['issuer'])" 2>/dev/null)
    ok "Keycloak is UP — issuer: $ISSUER"
    break
  fi
  if [ $i -eq 30 ]; then
    fail "Keycloak not ready after 5 min"
    info "Check logs: docker compose -f docker-compose.keycloak.yml logs keycloak | tail -30"
    info "If realm missing, we'll import manually next"
    break
  fi
  echo "  Keycloak not ready yet... ($((i*10))s / 300s max)"
  sleep 10
done

step "FIX 5 — Verify Keycloak realm and test token"
KC_CHECK=$(curl -s --max-time 5 http://172.20.100.222:9090/realms/attendance/.well-known/openid-configuration 2>/dev/null)
if echo "$KC_CHECK" | grep -q '"issuer"'; then
  # Test getting a token
  KC_TOKEN_RESP=$(curl -s --max-time 10 -X POST \
    "http://172.20.100.222:9090/realms/attendance/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=attendance-frontend&grant_type=password&username=admin@company.com&password=admin123")

  if echo "$KC_TOKEN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'access_token' in d else 1)" 2>/dev/null; then
    KC_TOKEN=$(echo "$KC_TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'][:40])")
    ok "Keycloak token works — token: ${KC_TOKEN}..."

    # Test bootstrap with KC token
    FULL_TOKEN=$(echo "$KC_TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
    BOOTSTRAP=$(curl -s --max-time 5 \
      -H "Authorization: Bearer $FULL_TOKEN" \
      http://172.20.100.222:8080/api/auth/bootstrap 2>/dev/null)

    if echo "$BOOTSTRAP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'user' in d else 1)" 2>/dev/null; then
      ROLE=$(echo "$BOOTSTRAP" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['role'])" 2>/dev/null)
      ok "Bootstrap with Keycloak token works — role: $ROLE"
      info "Backend is ready for AUTH_MODE=keycloak"
    else
      fail "Bootstrap with KC token failed — backend still in api mode"
      info "Response: $(echo $BOOTSTRAP | head -c 200)"
      info "To enable Keycloak auth: edit backend/.env → AUTH_MODE=keycloak, then restart backend"
    fi
  else
    KC_ERR=$(echo "$KC_TOKEN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','?') + ': ' + d.get('error_description','?'))" 2>/dev/null)
    fail "Keycloak token failed: $KC_ERR"
    info "Check users in realm: docker exec attendance-keycloak /opt/keycloak/bin/kcadm.sh get users -r attendance --no-config --server http://localhost:8080 --realm master --user admin --password admin 2>/dev/null | head -5"
  fi
else
  info "Keycloak not ready — check if realm imported:"
  docker compose -f docker-compose.keycloak.yml logs --tail=20 keycloak 2>/dev/null | grep -i "import\|error\|started\|realm" || true
fi

step "FIX 6 — Start frontend (bound to 0.0.0.0)"
# Kill existing frontend if running
fuser -k 5173/tcp 2>/dev/null || true
sleep 1

info "Starting frontend..."
nohup npm run dev -- --host 0.0.0.0 --port 5173 > /tmp/frontend.log 2>&1 &
echo $! > /tmp/frontend.pid

info "Waiting for frontend..."
for i in $(seq 1 15); do
  if curl -s --max-time 2 -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null | grep -q "200"; then
    ok "Frontend is UP → http://172.20.100.222:5173"
    break
  fi
  if [ $i -eq 15 ]; then
    fail "Frontend not responding — check: tail -20 /tmp/frontend.log"
  fi
  sleep 2
  echo "  waiting... ($i/15)"
done

step "FINAL STATUS"
echo ""

HEALTH=$(curl -s --max-time 3 http://172.20.100.222:8080/api/health 2>/dev/null)
[ "$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)" = "UP" ] \
  && ok "Backend   → http://172.20.100.222:8080  (login: admin@company.com / admin123)" \
  || fail "Backend   → not responding"

KC_UP=$(curl -s --max-time 3 http://172.20.100.222:9090/realms/attendance/.well-known/openid-configuration 2>/dev/null | grep -c "issuer")
[ "$KC_UP" -gt 0 ] \
  && ok "Keycloak  → http://172.20.100.222:9090  (admin UI: admin / admin)" \
  || fail "Keycloak  → still starting (run: docker compose -f docker-compose.keycloak.yml logs keycloak | tail -10)"

FRONT=$(curl -s --max-time 3 -o /dev/null -w "%{http_code}" http://172.20.100.222:5173 2>/dev/null)
[ "$FRONT" = "200" ] \
  && ok "Frontend  → http://172.20.100.222:5173  (open this in your browser)" \
  || fail "Frontend  → not running  (check: tail -20 /tmp/frontend.log)"

KAFKA_PORT=$(grep "KAFKA_BROKERS" backend/.env | cut -d= -f2 | cut -d: -f2)
nc -z localhost $KAFKA_PORT 2>/dev/null \
  && ok "Kafka     → localhost:$KAFKA_PORT" \
  || fail "Kafka     → not reachable (non-fatal — events won't stream but auth/attendance works)"

echo ""
echo "  Log files:"
echo "    tail -f /tmp/backend.log"
echo "    tail -f /tmp/frontend.log"
echo "    docker compose -f docker-compose.keycloak.yml logs -f keycloak"
echo ""
echo "  Next steps:"
echo "    1. Open http://172.20.100.222:5173 → login with admin@company.com / admin123"
echo "    2. To switch to Keycloak auth: edit backend/.env → AUTH_MODE=keycloak"
echo "       then: kill \$(cat /tmp/backend.pid) && cd backend && nohup npm run dev > /tmp/backend.log 2>&1 &"
echo "    3. For Jetson: copy jetson/ files, set BACKEND_URL=http://172.20.100.222:8080"
echo ""