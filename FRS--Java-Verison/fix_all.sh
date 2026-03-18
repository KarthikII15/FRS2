#!/bin/bash
# ── FRS Complete Fix Script ───────────────────────────────────────────────────
# Run from: ~/FRS_/FRS--Java-Verison/
# This fixes: Postgres down, Kafka down, seed, backend restart, Keycloak

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; }
info() { echo -e "${YELLOW}▶  $1${NC}"; }
step() { echo -e "\n${BLUE}══════════════════════════════════════${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}══════════════════════════════════════${NC}"; }

# ── Confirm we're in the right directory ──────────────────────────────────────
if [ ! -f "docker-compose.yml" ]; then
  echo "ERROR: Run this from ~/FRS_/FRS--Java-Verison/"
  exit 1
fi

step "STEP 1 — Start Postgres + Kafka"
info "Starting infrastructure containers..."
docker compose up -d postgres kafka

info "Waiting for Postgres to be healthy..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres -d attendance_intelligence >/dev/null 2>&1; then
    ok "Postgres is healthy"
    break
  fi
  if [ $i -eq 30 ]; then fail "Postgres not ready after 30s — check: docker compose logs postgres"; exit 1; fi
  sleep 2
  echo "  waiting... ($i/30)"
done

info "Waiting for Kafka to be healthy..."
for i in $(seq 1 40); do
  if docker compose exec -T kafka kafka-topics --bootstrap-server localhost:9092 --list >/dev/null 2>&1; then
    ok "Kafka is healthy"
    break
  fi
  if [ $i -eq 40 ]; then
    fail "Kafka not ready after 40s — check: docker compose logs kafka"
    info "Continuing anyway — Kafka errors are non-fatal for auth/attendance"
    break
  fi
  sleep 3
  echo "  waiting... ($i/40)"
done

step "STEP 2 — Run migrations (idempotent — safe to run again)"
info "Running database migrations..."
cd backend
node scripts/migrate.js
ok "Migrations done"

step "STEP 3 — Clean duplicate tenants and re-seed"
info "Cleaning duplicate data..."
node -e "
import('./src/db/pool.js').then(async ({pool}) => {
  try {
    await pool.query(\`TRUNCATE 
      frs_user_membership, frs_customer_user_map, frs_tenant_user_map,
      system_alert, audit_log, attendance_record, facility_device,
      employee_face_embeddings, hr_employee, hr_shift, hr_department,
      auth_session_token, attendance_events, device_events, devices
      RESTART IDENTITY CASCADE\`);
    await pool.query('DELETE FROM frs_user');
    await pool.query('DELETE FROM frs_unit');
    await pool.query('DELETE FROM frs_site');
    await pool.query('DELETE FROM frs_customer');
    await pool.query('DELETE FROM frs_tenant');
    console.log('Cleaned successfully');
  } catch(e) {
    console.error('Clean error:', e.message);
    process.exit(1);
  }
  await pool.end();
});
"

info "Seeding database..."
node scripts/seed.js
ok "Database seeded"

step "STEP 4 — Create Kafka topics"
info "Creating Kafka topics..."
node scripts/create-topics.js || info "Topics may already exist — continuing"

step "STEP 5 — Test login before starting backend"
info "Verifying login works..."
LOGIN=$(node -e "
import('./src/services/authService.js').then(async ({loginWithEmailPassword}) => {
  const result = await loginWithEmailPassword('admin@company.com', 'admin123', {ipAddress:'127.0.0.1',userAgent:'test'});
  if(result) console.log('LOGIN_OK:' + result.user.role);
  else console.log('LOGIN_FAIL');
  process.exit(0);
}).catch(e => { console.log('LOGIN_ERROR:' + e.message); process.exit(1); });
" 2>/dev/null)

if echo "$LOGIN" | grep -q "LOGIN_OK"; then
  ok "Login test passed — user role: $(echo $LOGIN | sed 's/LOGIN_OK://')"
else
  fail "Login test: $LOGIN"
  info "Check: node -e \"import('./src/db/pool.js').then(({pool})=>pool.query('SELECT email,role FROM frs_user').then(r=>{console.log(r.rows);pool.end()}))\""
fi

cd ..

step "STEP 6 — Kill old backend process and restart"
info "Killing any process on port 8080..."
fuser -k 8080/tcp 2>/dev/null && sleep 2 || true

info "Starting backend in background (logs → /tmp/backend.log)..."
cd backend
nohup npm run dev > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > /tmp/backend.pid
cd ..

info "Waiting for backend to start..."
for i in $(seq 1 20); do
  if curl -s --max-time 2 http://localhost:8080/api/health | grep -q '"UP"'; then
    ok "Backend is UP (PID $BACKEND_PID)"
    break
  fi
  if [ $i -eq 20 ]; then
    fail "Backend didn't start in 20s"
    echo "Last 20 lines of log:"
    tail -20 /tmp/backend.log
    exit 1
  fi
  sleep 2
  echo "  waiting... ($i/20)"
done

step "STEP 7 — Test the login endpoint over HTTP"
LOGIN_RESP=$(curl -s -X POST http://172.20.100.222:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","password":"admin123"}')

if echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ROLE:'+d['user']['role'])" 2>/dev/null | grep -q "ROLE:"; then
  ROLE=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['role'])")
  ok "HTTP Login works — role: $ROLE"
  TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
  echo "  Token (first 40 chars): ${TOKEN:0:40}..."
else
  fail "HTTP Login failed"
  echo "  Response: $LOGIN_RESP"
fi

step "STEP 8 — Start Keycloak"
info "Starting Keycloak containers..."
docker compose -f docker-compose.keycloak.yml up -d

info "Keycloak takes 60–90 seconds. Waiting..."
for i in $(seq 1 45); do
  KC=$(curl -s --max-time 3 http://172.20.100.222:9090/realms/attendance/.well-known/openid-configuration 2>/dev/null)
  if echo "$KC" | grep -q '"issuer"'; then
    ISSUER=$(echo "$KC" | python3 -c "import sys,json; print(json.load(sys.stdin)['issuer'])" 2>/dev/null)
    ok "Keycloak is UP — issuer: $ISSUER"
    break
  fi
  if [ $i -eq 45 ]; then
    info "Keycloak not ready yet — it may still be starting"
    info "Run after 2 min: curl -s http://172.20.100.222:9090/realms/attendance/.well-known/openid-configuration | python3 -c \"import sys,json; print(json.load(sys.stdin)['issuer'])\""
    break
  fi
  sleep 4
  echo "  waiting for Keycloak... ($((i*4))s)"
done

step "STEP 9 — Final summary"
echo ""
echo "  Service status:"

# Backend
HEALTH=$(curl -s --max-time 3 http://172.20.100.222:8080/api/health 2>/dev/null)
[ "$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)" = "UP" ] \
  && ok "Backend  → http://172.20.100.222:8080" \
  || fail "Backend  → not responding"

# Keycloak
KC_ISSUER=$(curl -s --max-time 3 http://172.20.100.222:9090/realms/attendance/.well-known/openid-configuration \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('issuer','FAIL'))" 2>/dev/null)
[ "$KC_ISSUER" = "http://172.20.100.222:9090/realms/attendance" ] \
  && ok "Keycloak → http://172.20.100.222:9090" \
  || fail "Keycloak → not ready yet (wait 2 min and check manually)"

# Frontend
FRONT=$(curl -s --max-time 3 -o /dev/null -w "%{http_code}" http://172.20.100.222:5173 2>/dev/null)
[ "$FRONT" = "200" ] \
  && ok "Frontend → http://172.20.100.222:5173" \
  || fail "Frontend → not running. Start with: cd ~/FRS_/FRS--Java-Verison && npm run dev -- --host 0.0.0.0"

echo ""
echo "  Logs:"
echo "    Backend:  tail -f /tmp/backend.log"
echo "    Kafka:    docker compose logs -f kafka"
echo "    Keycloak: docker compose -f docker-compose.keycloak.yml logs -f keycloak"
echo ""
echo "  Next: open http://172.20.100.222:5173 in your browser"
echo "        login: admin@company.com / admin123"
echo ""