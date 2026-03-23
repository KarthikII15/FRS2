#!/bin/bash
# ============================================================
# STEP 15 — Final end-to-end verification
# Run this on the VM (172.20.100.222)
# ============================================================

VM_IP="172.20.100.222"
JETSON_IP="172.18.3.202"
CAM_IP="172.18.3.201"

echo ""
echo "=================================================="
echo " STEP 15: Final end-to-end verification"
echo "=================================================="
echo ""

PASS=0
FAIL=0
WARN=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; echo "     $2"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠️  $1"; echo "     $2"; WARN=$((WARN+1)); }

# ── Docker containers ─────────────────────────────────────
echo "[ Docker containers ]"
for SVC in postgres kafka keycloak-db keycloak backend frontend; do
  STATUS=$(docker inspect --format='{{.State.Status}}' "attendance-${SVC}" 2>/dev/null || echo "missing")
  if [ "$STATUS" = "running" ]; then
    ok "attendance-${SVC} is running"
  else
    fail "attendance-${SVC}" "Status: $STATUS — run: docker compose up -d $SVC"
  fi
done

# ── Backend health ────────────────────────────────────────
echo ""
echo "[ Backend API ]"
HEALTH=$(curl -s "http://${VM_IP}:8080/api/health" 2>/dev/null)
if echo "$HEALTH" | grep -q '"status":"UP"'; then
  ok "Health endpoint: UP"
else
  fail "Health endpoint" "$HEALTH"
fi
if echo "$HEALTH" | grep -q '"database"'; then
  ok "Database connection: UP"
else
  warn "Database status unclear" "Check: curl http://${VM_IP}:8080/api/health"
fi

# ── API auth ──────────────────────────────────────────────
echo ""
echo "[ API auth (api mode) ]"
LOGIN=$(curl -s -X POST "http://${VM_IP}:8080/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","password":"admin123"}' 2>/dev/null)
if echo "$LOGIN" | grep -q '"accessToken"'; then
  ok "API login: admin@company.com"
  TOKEN=$(echo "$LOGIN" | python3 -c \
    "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
else
  fail "API login" "$LOGIN"
  TOKEN=""
fi

# ── Keycloak ──────────────────────────────────────────────
echo ""
echo "[ Keycloak ]"
OIDC=$(curl -s "http://${VM_IP}:9090/realms/attendance/.well-known/openid-configuration" 2>/dev/null)
if echo "$OIDC" | grep -q '"issuer"'; then
  ok "Keycloak OIDC discovery: attendance realm"
else
  fail "Keycloak OIDC" "Not reachable: http://${VM_IP}:9090/realms/attendance"
fi

KC_LOGIN=$(curl -s -X POST \
  "http://${VM_IP}:9090/realms/attendance/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=attendance-frontend&username=admin@company.com&password=admin123&grant_type=password" 2>/dev/null)

if echo "$KC_LOGIN" | grep -q '"access_token"'; then
  ok "Keycloak login: admin@company.com"
  KC_TOKEN=$(echo "$KC_LOGIN" | python3 -c \
    "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

  # Check bootstrap with keycloak token
  BOOT=$(curl -s "http://${VM_IP}:8080/api/auth/bootstrap" \
    -H "Authorization: Bearer $KC_TOKEN" 2>/dev/null)
  if echo "$BOOT" | grep -q '"memberships"'; then
    ok "Keycloak token → backend bootstrap: PASS"
  else
    fail "Keycloak token → bootstrap" "$BOOT"
  fi
else
  fail "Keycloak login" "$KC_LOGIN"
fi

# ── Kafka topics ──────────────────────────────────────────
echo ""
echo "[ Kafka topics ]"
TOPICS=$(docker exec attendance-kafka kafka-topics \
  --bootstrap-server localhost:9092 --list 2>/dev/null || echo "")
for TOPIC in frs.events frs.detections frs.device-events frs.ai-detections frs.alerts; do
  if echo "$TOPICS" | grep -q "$TOPIC"; then
    ok "Topic: $TOPIC"
  else
    fail "Topic missing: $TOPIC" "Run: docker exec attendance-kafka kafka-topics --bootstrap-server localhost:9092 --create --topic $TOPIC --partitions 3 --replication-factor 1"
  fi
done

# ── Database tables ───────────────────────────────────────
echo ""
echo "[ Database tables ]"
TABLES=$(docker exec attendance-postgres psql -U postgres -d attendance_intelligence \
  -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>/dev/null)
for TBL in frs_user frs_tenant hr_employee attendance_record employee_face_embeddings devices; do
  if echo "$TABLES" | grep -q "$TBL"; then
    ok "Table: $TBL"
  else
    fail "Missing table: $TBL" "Re-run Step 07 migrations"
  fi
done

# ── Seeded data ───────────────────────────────────────────
echo ""
echo "[ Seeded data ]"
EMP_COUNT=$(docker exec attendance-postgres psql -U postgres -d attendance_intelligence \
  -tAc "SELECT COUNT(*) FROM hr_employee;" 2>/dev/null | tr -d ' ')
if [ "$EMP_COUNT" -gt "0" ] 2>/dev/null; then
  ok "Employees in DB: $EMP_COUNT"
else
  warn "No employees in DB" "Run: node scripts/seed.js (from backend dir)"
fi

# ── Frontend ──────────────────────────────────────────────
echo ""
echo "[ Frontend ]"
FE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://${VM_IP}:5173" 2>/dev/null || echo "000")
if [ "$FE_STATUS" = "200" ]; then
  ok "Frontend: http://${VM_IP}:5173"
else
  fail "Frontend" "HTTP $FE_STATUS"
fi

# ── WebSocket ─────────────────────────────────────────────
echo ""
echo "[ WebSocket ]"
WS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://${VM_IP}:8080/socket.io/?EIO=4&transport=polling" 2>/dev/null || echo "000")
if [ "$WS_STATUS" = "200" ]; then
  ok "Socket.io polling endpoint"
else
  fail "Socket.io" "HTTP $WS_STATUS"
fi

# ── Jetson sidecar ────────────────────────────────────────
echo ""
echo "[ Jetson sidecar (optional — needs Jetson running) ]"
JETSON_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
  "http://${JETSON_IP}:5000/health" 2>/dev/null || echo "000")
if [ "$JETSON_STATUS" = "200" ]; then
  ok "Jetson sidecar: http://${JETSON_IP}:5000"
else
  warn "Jetson sidecar not reachable" "Start runner.py on Jetson (Step J06)"
fi

# ── Camera ────────────────────────────────────────────────
echo ""
echo "[ Camera reachability (from VM) ]"
CAM_RTSP=$(nc -z -w3 "${CAM_IP}" 554 2>/dev/null && echo "open" || echo "closed")
if [ "$CAM_RTSP" = "open" ]; then
  ok "Camera RTSP port 554 reachable from VM"
else
  warn "Camera port 554 not reachable from VM" "Camera is on a different subnet (172.18.x). This is normal — Jetson connects directly."
fi

# ── Summary ───────────────────────────────────────────────
echo ""
echo "=================================================="
echo " SUMMARY"
echo "=================================================="
echo "  ✅ Passed:   $PASS"
echo "  ⚠️  Warnings: $WARN"
echo "  ❌ Failed:   $FAIL"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "  🎉 ALL CHECKS PASSED — System is ready!"
  echo ""
  echo "  Open the application:"
  echo "  → http://${VM_IP}:5173"
  echo "  → Login: admin@company.com / admin123"
  echo "  → Or:    hr@company.com / hr123"
else
  echo "  Fix the ❌ failures above before proceeding."
fi
echo "=================================================="
echo ""
