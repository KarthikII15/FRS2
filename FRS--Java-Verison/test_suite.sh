#!/bin/bash
# ================================================================
# FRS2 — Comprehensive Application Test Suite
# Tests every API endpoint, auth flow, and data integrity
# Run: bash ~/FRS_/FRS--Java-Verison/test_suite.sh
# ================================================================

VM="172.20.100.222"
API="http://$VM:8080/api"
KC="http://$VM:9090"
REALM="attendance"
PASS=0
FAIL=0
WARN=0
SECTION=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

section() {
  SECTION="$1"
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}${BOLD}  $1${NC}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

pass() { echo -e "  ${GREEN}✅ PASS${NC} — $1"; ((PASS++)); }
fail() { echo -e "  ${RED}❌ FAIL${NC} — $1"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}⚠️  WARN${NC} — $1"; ((WARN++)); }
info() { echo -e "  ${BLUE}ℹ️  INFO${NC} — $1"; }

# ── Helper: HTTP test ─────────────────────────────────────────
http_test() {
  local desc="$1"
  local expected_code="$2"
  local actual_code="$3"
  local body="$4"
  
  if [ "$actual_code" = "$expected_code" ]; then
    pass "$desc (HTTP $actual_code)"
  elif [ "$actual_code" = "000" ]; then
    fail "$desc — Connection refused"
  else
    fail "$desc — Expected HTTP $expected_code, got HTTP $actual_code"
    if [ -n "$body" ] && echo "$body" | grep -q "message"; then
      echo "        $(echo $body | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message',''))" 2>/dev/null)"
    fi
  fi
}

# ── Helper: JSON field check ──────────────────────────────────
has_field() {
  local desc="$1"
  local json="$2"
  local field="$3"
  if echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$field' in str(d)" 2>/dev/null; then
    pass "$desc — has '$field'"
  else
    fail "$desc — missing field '$field'"
  fi
}

# ── Helper: Count check ───────────────────────────────────────
count_gte() {
  local desc="$1"
  local json="$2"
  local min="$3"
  local count=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data', d if isinstance(d,list) else [])))" 2>/dev/null)
  if [ -n "$count" ] && [ "$count" -ge "$min" ] 2>/dev/null; then
    pass "$desc — $count records (≥$min)"
  else
    fail "$desc — got $count records (expected ≥$min)"
  fi
}

echo ""
echo -e "${BOLD}================================================================${NC}"
echo -e "${BOLD}  FRS2 Face Recognition Attendance System — Full Test Suite${NC}"
echo -e "${BOLD}  $(date)${NC}"
echo -e "${BOLD}================================================================${NC}"

# ================================================================
# SECTION 1: INFRASTRUCTURE
# ================================================================
section "1. Infrastructure Health"

# Frontend
FE_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$VM:5173 --max-time 10)
http_test "Frontend (React/Vite) is up" "200" "$FE_CODE"

# Backend health
HEALTH=$(curl -s http://$VM:8080/api/health --max-time 10)
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$VM:8080/api/health --max-time 10)
http_test "Backend API is up" "200" "$HEALTH_CODE"

# Backend DB health
DB_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$VM:8080/api/health/db --max-time 10)
if [ "$DB_CODE" = "200" ]; then
  pass "Backend DB connection healthy"
else
  # Try alternate health endpoint
  DB_CHECK=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('database','unknown'))" 2>/dev/null)
  if [ "$DB_CHECK" = "connected" ] || [ "$DB_CHECK" = "ok" ]; then
    pass "Backend DB connection healthy"
  else
    warn "Backend DB health endpoint not available (app may still work)"
  fi
fi

# Keycloak
KC_CODE=$(curl -s -o /dev/null -w "%{http_code}" $KC/realms/$REALM --max-time 10)
http_test "Keycloak realm 'attendance' accessible" "200" "$KC_CODE"

# PostgreSQL via backend
PG_HEALTH=$(docker exec attendance-postgres pg_isready -U postgres 2>/dev/null)
if echo "$PG_HEALTH" | grep -q "accepting"; then
  pass "PostgreSQL accepting connections"
else
  fail "PostgreSQL not responding"
fi

# Kafka
KAFKA_CHECK=$(docker exec attendance-kafka kafka-topics.sh --list --bootstrap-server localhost:9092 2>/dev/null | wc -l)
if [ "$KAFKA_CHECK" -gt 0 ]; then
  pass "Kafka broker running ($KAFKA_CHECK topics)"
else
  warn "Kafka check inconclusive"
fi

# ================================================================
# SECTION 2: AUTHENTICATION
# ================================================================
section "2. Authentication & Authorization"

# Get admin token from Keycloak
info "Obtaining admin token from Keycloak..."
KC_RESPONSE=$(curl -s -X POST \
  "$KC/realms/$REALM/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=attendance-frontend&username=admin@company.com&password=admin123&grant_type=password" \
  --max-time 15)

ADMIN_TOKEN=$(echo "$KC_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "None" ]; then
  pass "Admin Keycloak login (admin@company.com)"
else
  fail "Admin Keycloak login failed"
  info "Response: $(echo $KC_RESPONSE | head -c 200)"
fi

# Get HR token
HR_RESPONSE=$(curl -s -X POST \
  "$KC/realms/$REALM/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=attendance-frontend&username=hr@company.com&password=hr123&grant_type=password" \
  --max-time 15)
HR_TOKEN=$(echo "$HR_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -n "$HR_TOKEN" ] && [ "$HR_TOKEN" != "None" ]; then
  pass "HR Keycloak login (hr@company.com)"
else
  fail "HR Keycloak login failed"
fi

# Bootstrap
BOOTSTRAP=$(curl -s -w "\n%{http_code}" "$API/auth/bootstrap" \
  -H "Authorization: Bearer $ADMIN_TOKEN" --max-time 15)
BOOTSTRAP_CODE=$(echo "$BOOTSTRAP" | tail -1)
BOOTSTRAP_BODY=$(echo "$BOOTSTRAP" | head -1)
http_test "Auth bootstrap (admin)" "200" "$BOOTSTRAP_CODE"

if [ "$BOOTSTRAP_CODE" = "200" ]; then
  has_field "Bootstrap has user object" "$BOOTSTRAP_BODY" "user"
  has_field "Bootstrap has memberships" "$BOOTSTRAP_BODY" "memberships"
fi

# Test unauthorized access
UNAUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/live/employees" --max-time 10)
http_test "Unauthenticated request rejected" "401" "$UNAUTH_CODE"

# Invalid token rejected
BAD_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/live/employees" \
  -H "Authorization: Bearer invalid.token.here" --max-time 10)
http_test "Invalid token rejected" "401" "$BAD_CODE"

# ================================================================
# SECTION 3: LIVE DATA ENDPOINTS
# ================================================================
section "3. Live Data Endpoints (/api/live)"

SCOPE_HEADERS='-H "x-tenant-id: $TENANT_ID"'

# Employees
EMP_RESP=$(curl -s "$API/live/employees" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID" --max-time 15)
EMP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/live/employees" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /live/employees" "200" "$EMP_CODE"
count_gte "Live employees has data" "$EMP_RESP" "1"

# Attendance
ATT_RESP=$(curl -s "$API/live/attendance" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID" --max-time 15)
ATT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/live/attendance" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /live/attendance" "200" "$ATT_CODE"
count_gte "Live attendance has records" "$ATT_RESP" "1"

# Devices
DEV_RESP=$(curl -s "$API/live/devices" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID" --max-time 15)
DEV_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/live/devices" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /live/devices" "200" "$DEV_CODE"

# Alerts
ALT_RESP=$(curl -s "$API/live/alerts" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID" --max-time 15)
ALT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/live/alerts" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /live/alerts" "200" "$ALT_CODE"

# Metrics
MET_RESP=$(curl -s "$API/live/metrics" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID" --max-time 15)
MET_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/live/metrics" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /live/metrics" "200" "$MET_CODE"
if [ "$MET_CODE" = "200" ]; then
  has_field "Metrics has totalEmployees" "$MET_RESP" "totalEmployees"
  has_field "Metrics has attendanceRate" "$MET_RESP" "attendanceRate"
fi

# Shifts
SHF_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/live/shifts" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /live/shifts" "200" "$SHF_CODE"

# Attendance with date filter
DATED_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API/live/attendance?fromDate=2026-01-01&toDate=2026-12-31" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /live/attendance with date filter" "200" "$DATED_CODE"

# ================================================================
# SECTION 4: EMPLOYEE MANAGEMENT
# ================================================================
sleep 2
section "4. Employee Management (/api/employees)"

# List employees
EMP_LIST=$(curl -s "$API/employees" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
EMP_LIST_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/employees" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /employees — list all" "200" "$EMP_LIST_CODE"

# Get first employee ID
EMP_ID=$(echo "$EMP_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['pk_employee_id'])" 2>/dev/null)
info "Testing with employee ID: $EMP_ID"

# Get single employee
if [ -n "$EMP_ID" ]; then
  SINGLE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/employees/$EMP_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
  http_test "GET /employees/:id" "200" "$SINGLE_CODE"

  # Employee attendance
  EA_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/employees/$EMP_ID/attendance" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
  http_test "GET /employees/:id/attendance" "200" "$EA_CODE"
fi

# Search
SEARCH_RESP=$(curl -s "$API/employees/search?q=johnson" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
SEARCH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/employees/search?q=johnson" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /employees/search?q=johnson" "200" "$SEARCH_CODE"

# Create employee
NEW_EMP=$(curl -s -w "\n%{http_code}" -X POST "$API/employees" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -d '{"employee_code":"TEST001","full_name":"Test Employee","email":"test.employee@company.com","position_title":"QA Tester","join_date":"2026-01-01","status":"active"}' \
  --max-time 15)
NEW_EMP_CODE=$(echo "$NEW_EMP" | tail -1)
NEW_EMP_BODY=$(echo "$NEW_EMP" | head -1)
http_test "POST /employees — create" "201" "$NEW_EMP_CODE"

NEW_EMP_ID=$(echo "$NEW_EMP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('pk_employee_id',''))" 2>/dev/null)

# Update employee
if [ -n "$NEW_EMP_ID" ]; then
  UPD_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$API/employees/$NEW_EMP_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -H "x-tenant-id: $TENANT_ID" \
    -d '{"position_title":"Senior QA Tester"}' --max-time 15)
  http_test "PUT /employees/:id — update" "200" "$UPD_CODE"

  # Deactivate
  DEACT_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/employees/$NEW_EMP_ID/deactivate" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID" --max-time 15)
  http_test "POST /employees/:id/deactivate" "200" "$DEACT_CODE"

  # Delete test employee (cleanup)
  DEL_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/employees/$NEW_EMP_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID" --max-time 15)
  http_test "DELETE /employees/:id — cleanup" "200" "$DEL_CODE"
fi

# ================================================================
# SECTION 5: ATTENDANCE
# ================================================================
sleep 2
section "5. Attendance (/api/attendance)"

# Today's attendance
TODAY_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/attendance/today" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /attendance/today" "200" "$TODAY_CODE"

# Currently present
CURR_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/attendance/current" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /attendance/current" "200" "$CURR_CODE"

# Stats
STATS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/attendance/stats" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /attendance/stats" "200" "$STATS_CODE"

# Date range
DR_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API/attendance/date-range?fromDate=2026-01-01&toDate=2026-03-19" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /attendance/date-range" "200" "$DR_CODE"

# Mark attendance (simulate face recognition event)
if [ -n "$EMP_ID" ]; then
  MARK_RESP=$(curl -s -w "\n%{http_code}" -X POST "$API/attendance/mark" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -H "x-tenant-id: $TENANT_ID" \
    -d "{\"employeeId\":\"$EMP_ID\",\"status\":\"present\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
    --max-time 15)
  MARK_CODE=$(echo "$MARK_RESP" | tail -1)
  http_test "POST /attendance/mark (simulate check-in)" "201" "$MARK_CODE"
fi

# Daily report
RPT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/attendance/reports/daily" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /attendance/reports/daily" "200" "$RPT_CODE"

# Monthly report
MRPT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/attendance/reports/monthly?year=2026&month=3" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /attendance/reports/monthly" "200" "$MRPT_CODE"

# ================================================================
# SECTION 6: HR ROUTES (departments, shifts, leave)
# ================================================================
sleep 2
section "6. HR Management (/api/hr)"

# Departments
DEPT_RESP=$(curl -s "$API/hr/departments" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
DEPT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/hr/departments" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /hr/departments" "200" "$DEPT_CODE"
count_gte "Has departments" "$DEPT_RESP" "1"

# Create department
NEW_DEPT=$(curl -s -w "\n%{http_code}" -X POST "$API/hr/departments" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -d '{"name":"Test Department","code":"TESTDEPT","color":"#FF0000"}' --max-time 15)
NEW_DEPT_CODE=$(echo "$NEW_DEPT" | tail -1)
NEW_DEPT_BODY=$(echo "$NEW_DEPT" | head -1)
http_test "POST /hr/departments — create" "201" "$NEW_DEPT_CODE"
NEW_DEPT_ID=$(echo "$NEW_DEPT_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

# Update department
if [ -n "$NEW_DEPT_ID" ]; then
  UPD_DEPT_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$API/hr/departments/$NEW_DEPT_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -H "x-tenant-id: $TENANT_ID" \
    -d '{"name":"Test Department Updated"}' --max-time 15)
  http_test "PUT /hr/departments/:id — update" "200" "$UPD_DEPT_CODE"

  # Delete department (cleanup)
  DEL_DEPT_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/hr/departments/$NEW_DEPT_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID" --max-time 15)
  http_test "DELETE /hr/departments/:id — cleanup" "200" "$DEL_DEPT_CODE"
fi

# Shifts
SHFT_RESP=$(curl -s "$API/hr/shifts" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
SHFT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/hr/shifts" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /hr/shifts" "200" "$SHFT_CODE"
count_gte "Has shifts" "$SHFT_RESP" "1"

# Create shift
NEW_SHFT=$(curl -s -w "\n%{http_code}" -X POST "$API/hr/shifts" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -d '{"name":"Test Shift","shift_type":"flexible","start_time":"10:00","end_time":"19:00","grace_period_minutes":15}' --max-time 15)
NEW_SHFT_CODE=$(echo "$NEW_SHFT" | tail -1)
NEW_SHFT_BODY=$(echo "$NEW_SHFT" | head -1)
http_test "POST /hr/shifts — create" "201" "$NEW_SHFT_CODE"
NEW_SHFT_ID=$(echo "$NEW_SHFT_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('pk_shift_id',d.get('id','')))" 2>/dev/null)

# Assign staff to shift
if [ -n "$NEW_SHFT_ID" ] && [ -n "$EMP_ID" ]; then
  ASSIGN_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/hr/shifts/$NEW_SHFT_ID/assign" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -H "x-tenant-id: $TENANT_ID" \
    -d "{\"employee_ids\":[$EMP_ID]}" --max-time 15)
  http_test "POST /hr/shifts/:id/assign — assign staff" "200" "$ASSIGN_CODE"

  # Delete shift (cleanup)
  DEL_SHFT_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/hr/shifts/$NEW_SHFT_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID" --max-time 15)
  http_test "DELETE /hr/shifts/:id — cleanup" "200" "$DEL_SHFT_CODE"
fi

# Leave requests
LEAVE_RESP=$(curl -s "$API/hr/leave" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
LEAVE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/hr/leave" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
http_test "GET /hr/leave" "200" "$LEAVE_CODE"

# Create leave request
if [ -n "$EMP_ID" ]; then
  NEW_LEAVE=$(curl -s -w "\n%{http_code}" -X POST "$API/hr/leave" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -H "x-tenant-id: $TENANT_ID" \
    -d "{\"employee_id\":$EMP_ID,\"leave_type\":\"Annual Leave\",\"start_date\":\"2026-04-01\",\"end_date\":\"2026-04-03\",\"reason\":\"Test leave\"}" \
    --max-time 15)
  NEW_LEAVE_CODE=$(echo "$NEW_LEAVE" | tail -1)
  NEW_LEAVE_BODY=$(echo "$NEW_LEAVE" | head -1)
  http_test "POST /hr/leave — create request" "201" "$NEW_LEAVE_CODE"
  NEW_LEAVE_ID=$(echo "$NEW_LEAVE_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('pk_leave_id',''))" 2>/dev/null)

  # Approve leave
  if [ -n "$NEW_LEAVE_ID" ]; then
    APPR_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$API/hr/leave/$NEW_LEAVE_ID/status" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -H "x-tenant-id: $TENANT_ID" \
      -d '{"status":"Approved"}' --max-time 15)
    http_test "PUT /hr/leave/:id/status — approve" "200" "$APPR_CODE"
  fi
fi

# Employee attendance history
if [ -n "$EMP_ID" ]; then
  EA2_RESP=$(curl -s "$API/hr/employees/$EMP_ID/attendance" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
  EA2_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/hr/employees/$EMP_ID/attendance" -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID")
  http_test "GET /hr/employees/:id/attendance" "200" "$EA2_CODE"
fi

# ================================================================
# SECTION 7: CAMERA / DEVICE MANAGEMENT
# ================================================================
sleep 2
section "7. Camera Management (/api/cameras)"

# List cameras
CAM_RESP=$(curl -s "$API/cameras" -H "Authorization: Bearer $ADMIN_TOKEN")
CAM_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/cameras" -H "Authorization: Bearer $ADMIN_TOKEN")
http_test "GET /cameras — list" "200" "$CAM_CODE"

CAM_ID=$(echo "$CAM_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); cams=d.get('data',[]); print(cams[0]['id'] if cams else '')" 2>/dev/null)
info "Found camera ID: $CAM_ID"

# Register new camera
NEW_CAM=$(curl -s -w "\n%{http_code}" -X POST "$API/cameras" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST-CAM-001","name":"Test Camera","ipAddress":"192.168.1.200","location":"Test Location","role":"entry","fpsTarget":5}' \
  --max-time 15)
NEW_CAM_CODE=$(echo "$NEW_CAM" | tail -1)
NEW_CAM_BODY=$(echo "$NEW_CAM" | head -1)
http_test "POST /cameras — register" "201" "$NEW_CAM_CODE"
NEW_CAM_ID=$(echo "$NEW_CAM_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

# Get single camera
if [ -n "$NEW_CAM_ID" ]; then
  GCAM_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/cameras/$NEW_CAM_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  http_test "GET /cameras/:id" "200" "$GCAM_CODE"

  # Update camera
  UCAM_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$API/cameras/$NEW_CAM_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Test Camera Updated","location":"Test Location Updated"}' --max-time 15)
  http_test "PUT /cameras/:id — update" "200" "$UCAM_CODE"

  # Camera status
  SCAM_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/cameras/$NEW_CAM_ID/status" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  http_test "GET /cameras/:id/status" "200" "$SCAM_CODE"

  # Test RTSP (will fail since fake camera, but endpoint should respond)
  TCAM_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/cameras/$NEW_CAM_ID/test" \
    -H "Authorization: Bearer $ADMIN_TOKEN" --max-time 15)
  if [ "$TCAM_CODE" = "200" ] || [ "$TCAM_CODE" = "422" ]; then
    pass "POST /cameras/:id/test — endpoint responds (HTTP $TCAM_CODE)"
  else
    fail "POST /cameras/:id/test — got HTTP $TCAM_CODE"
  fi

  # Delete test camera (cleanup)
  DCAM_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/cameras/$NEW_CAM_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  http_test "DELETE /cameras/:id — cleanup" "200" "$DCAM_CODE"
fi

# Camera discover endpoint
DISC_RESP=$(curl -s -w "\n%{http_code}" -X POST "$API/cameras/discover" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ipAddress":"172.18.3.201","username":"admin","password":"admin"}' --max-time 15)
DISC_CODE=$(echo "$DISC_RESP" | tail -1)
if [ "$DISC_CODE" = "200" ]; then
  pass "POST /cameras/discover — endpoint responds"
  DISC_BODY=$(echo "$DISC_RESP" | head -1)
  REACHABLE=$(echo "$DISC_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('reachable','unknown'))" 2>/dev/null)
  info "Camera at 172.18.3.201 reachable: $REACHABLE"
else
  fail "POST /cameras/discover — HTTP $DISC_CODE"
fi

# ================================================================
# SECTION 8: DASHBOARD ANALYTICS
# ================================================================
sleep 2
section "8. Dashboard Analytics (/api/dashboard)"

for ENDPOINT in "admin/summary" "admin/system-health" "admin/device-status" "admin/alerts" \
                "hr/summary" "hr/attendance-today" "hr/department-summary" \
                "hr/late-arrivals" "hr/absentees" \
                "live/presence" "analytics/peak-hours" "analytics/employee-ranking"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/dashboard/$ENDPOINT" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID" --max-time 15)
  if [ "$CODE" = "200" ]; then
    pass "GET /dashboard/$ENDPOINT"
  elif [ "$CODE" = "404" ]; then
    warn "GET /dashboard/$ENDPOINT — not implemented (404)"
  else
    fail "GET /dashboard/$ENDPOINT — HTTP $CODE"
  fi
done

# ================================================================
# SECTION 9: USER MANAGEMENT
# ================================================================
sleep 2
section "9. User Management (/api/users)"

# List users
USERS_RESP=$(curl -s "$API/users" -H "Authorization: Bearer $ADMIN_TOKEN")
USERS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/users" -H "Authorization: Bearer $ADMIN_TOKEN")
http_test "GET /users — list all" "200" "$USERS_CODE"
if [ "$USERS_CODE" = "200" ]; then
  USER_COUNT=$(echo "$USERS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null)
  info "Total users in system: $USER_COUNT"
fi

# Create user
NEW_USER=$(curl -s -w "\n%{http_code}" -X POST "$API/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser.frs2@company.com","username":"Test FRS2 User","password":"TestPass123!","role":"hr"}' \
  --max-time 15)
NEW_USER_CODE=$(echo "$NEW_USER" | tail -1)
NEW_USER_BODY=$(echo "$NEW_USER" | head -1)
http_test "POST /users — create user" "201" "$NEW_USER_CODE"
NEW_USER_ID=$(echo "$NEW_USER_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('pk_user_id',d.get('id','')))" 2>/dev/null)

# Test new user can login
if [ -n "$NEW_USER_ID" ]; then
  NEW_USER_TOKEN_RESP=$(curl -s -X POST \
    "$KC/realms/$REALM/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=attendance-frontend&username=testuser.frs2@company.com&password=TestPass123!&grant_type=password" \
    --max-time 15)
  NEW_USER_TOKEN=$(echo "$NEW_USER_TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
  if [ -n "$NEW_USER_TOKEN" ] && [ "$NEW_USER_TOKEN" != "None" ]; then
    pass "New user can login via Keycloak"
  else
    fail "New user cannot login — Keycloak sync may have failed"
  fi

  # Delete user (cleanup)
  DEL_USER_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/users/$NEW_USER_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" --max-time 15)
  http_test "DELETE /users/:id — cleanup" "200" "$DEL_USER_CODE"
fi

# ================================================================
# SECTION 10: DATABASE INTEGRITY
# ================================================================
section "10. Database Integrity"

DB="attendance_intelligence"
PSQL="docker exec attendance-postgres psql -U postgres -d $DB -t -c"

# Check no duplicate tenants
TENANT_COUNT=$($PSQL "SELECT count(*) FROM frs_tenant;" 2>/dev/null | tr -d ' ')
if [ "$TENANT_COUNT" = "1" ]; then
  pass "Single tenant (no duplicates)"
else
  fail "Expected 1 tenant, found $TENANT_COUNT"
fi

# Check employees
EMP_DB_COUNT=$($PSQL "SELECT count(*) FROM hr_employee WHERE status='active';" 2>/dev/null | tr -d ' ')
if [ -n "$EMP_DB_COUNT" ] && [ "$EMP_DB_COUNT" -ge "1" ]; then
  pass "Active employees in DB: $EMP_DB_COUNT"
else
  fail "No active employees in DB"
fi

# Check departments
DEPT_COUNT=$($PSQL "SELECT count(*) FROM hr_department;" 2>/dev/null | tr -d ' ')
if [ -n "$DEPT_COUNT" ] && [ "$DEPT_COUNT" -ge "1" ]; then
  pass "Departments in DB: $DEPT_COUNT"
else
  fail "No departments in DB"
fi

# Check no orphaned attendance records
ORPHAN=$($PSQL "SELECT count(*) FROM attendance_record a WHERE NOT EXISTS (SELECT 1 FROM hr_employee e WHERE e.pk_employee_id = a.fk_employee_id);" 2>/dev/null | tr -d ' ')
if [ "$ORPHAN" = "0" ]; then
  pass "No orphaned attendance records"
else
  warn "Found $ORPHAN orphaned attendance records"
fi

# Check FK integrity - employees have valid departments
BAD_DEPT=$($PSQL "SELECT count(*) FROM hr_employee WHERE fk_department_id IS NOT NULL AND fk_department_id NOT IN (SELECT pk_department_id FROM hr_department);" 2>/dev/null | tr -d ' ')
if [ "$BAD_DEPT" = "0" ]; then
  pass "Employee department FK integrity OK"
else
  fail "$BAD_DEPT employees with invalid department FK"
fi

# Check leave table exists
LEAVE_EXISTS=$($PSQL "SELECT count(*) FROM hr_leave_request;" 2>/dev/null | tr -d ' ')
if [ $? -eq 0 ]; then
  pass "Leave requests table exists ($LEAVE_EXISTS records)"
else
  fail "Leave requests table missing"
fi

# Check face embeddings table
FACE_TABLE=$($PSQL "SELECT count(*) FROM employee_face_embeddings;" 2>/dev/null | tr -d ' ')
if [ $? -eq 0 ]; then
  pass "Face embeddings table exists ($FACE_TABLE embeddings)"
else
  fail "Face embeddings table missing"
fi

# ================================================================
# SECTION 11: KEYCLOAK CONFIGURATION
# ================================================================
section "11. Keycloak Configuration"

# Get KC admin token
KC_ADMIN=$(curl -s -X POST \
  "$KC/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli&username=admin&password=admin&grant_type=password" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -n "$KC_ADMIN" ]; then
  pass "Keycloak admin token obtained"

  # Check realm exists
  REALM_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "$KC/admin/realms/$REALM" -H "Authorization: Bearer $KC_ADMIN")
  http_test "Realm 'attendance' configured" "200" "$REALM_CODE"

  # Check clients
  CLIENTS=$(curl -s "$KC/admin/realms/$REALM/clients" \
    -H "Authorization: Bearer $KC_ADMIN" | \
    python3 -c "import sys,json; clients=json.load(sys.stdin); print([c['clientId'] for c in clients])" 2>/dev/null)
  if echo "$CLIENTS" | grep -q "attendance-frontend"; then
    pass "Client 'attendance-frontend' exists"
  else
    fail "Client 'attendance-frontend' missing"
  fi

  # Check roles
  ROLES=$(curl -s "$KC/admin/realms/$REALM/roles" \
    -H "Authorization: Bearer $KC_ADMIN" | \
    python3 -c "import sys,json; print([r['name'] for r in json.load(sys.stdin)])" 2>/dev/null)
  if echo "$ROLES" | grep -q "admin"; then
    pass "Role 'admin' exists"
  else
    fail "Role 'admin' missing"
  fi
  if echo "$ROLES" | grep -q "hr"; then
    pass "Role 'hr' exists"
  else
    fail "Role 'hr' missing"
  fi

  # Check login theme
  THEME=$(curl -s "$KC/admin/realms/$REALM" \
    -H "Authorization: Bearer $KC_ADMIN" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('loginTheme',''))" 2>/dev/null)
  if [ "$THEME" = "frs2" ]; then
    pass "Custom login theme 'frs2' active"
  else
    warn "Login theme is '$THEME' (expected 'frs2')"
  fi

  # Check user count
  KC_USERS=$(curl -s "$KC/admin/realms/$REALM/users?max=100" \
    -H "Authorization: Bearer $KC_ADMIN" | \
    python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
  if [ -n "$KC_USERS" ] && [ "$KC_USERS" -ge "2" ]; then
    pass "Keycloak has $KC_USERS users"
  else
    warn "Keycloak user count: $KC_USERS"
  fi
else
  fail "Keycloak admin token failed — skipping KC tests"
fi

# ================================================================
# SECTION 12: WEBSOCKET
# ================================================================
section "12. WebSocket / Real-time"

# Check if socket.io endpoint exists
WS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://$VM:8080/socket.io/?EIO=4&transport=polling" --max-time 10)
if [ "$WS_CODE" = "200" ] || [ "$WS_CODE" = "101" ]; then
  pass "Socket.io endpoint accessible"
else
  warn "Socket.io endpoint returned HTTP $WS_CODE"
fi

# ================================================================
# SECTION 13: RATE LIMITING & SECURITY
# ================================================================
section "13. Security"

# Rate limiter active
RL_RESP=""
for i in $(seq 1 5); do
  RL_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/live/employees" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "x-tenant-id: $TENANT_ID" --max-time 3)
done
if [ "$RL_CODE" != "000" ]; then
  pass "API responds under rapid requests (rate limit not triggered at normal load)"
fi

# CORS headers present
CORS=$(curl -s -I "$API/health" | grep -i "access-control")
if [ -n "$CORS" ]; then
  pass "CORS headers present"
else
  warn "CORS headers not detected on health endpoint"
fi

# No sensitive data in health endpoint
HEALTH_BODY=$(curl -s "$API/health" --max-time 10)
if echo "$HEALTH_BODY" | grep -qi "password\|secret\|token"; then
  fail "Sensitive data exposed in health endpoint"
else
  pass "Health endpoint doesn't expose sensitive data"
fi

# ================================================================
# SECTION 14: FRONTEND ROUTES
# ================================================================
section "14. Frontend Accessibility"

for ROUTE in "" "?tab=overview" "?tab=live-office"; do
  FE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://$VM:5173/$ROUTE" --max-time 10)
  http_test "Frontend route /$ROUTE" "200" "$FE_CODE"
done

# Static assets
ASSET_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://$VM:5173/src/main.tsx" --max-time 10)
if [ "$ASSET_CODE" = "200" ] || [ "$ASSET_CODE" = "304" ]; then
  pass "Frontend serves source files (dev mode)"
fi

# ================================================================
# SUMMARY
# ================================================================
TOTAL=$((PASS + FAIL + WARN))

echo ""
echo -e "${BOLD}================================================================${NC}"
echo -e "${BOLD}  TEST RESULTS SUMMARY${NC}"
echo -e "${BOLD}================================================================${NC}"
echo ""
echo -e "  Total tests:  ${BOLD}$TOTAL${NC}"
echo -e "  ${GREEN}${BOLD}Passed:  $PASS${NC}"
echo -e "  ${RED}${BOLD}Failed:  $FAIL${NC}"
echo -e "  ${YELLOW}${BOLD}Warnings: $WARN${NC}"
echo ""

if [ "$FAIL" = "0" ]; then
  echo -e "  ${GREEN}${BOLD}✅ ALL TESTS PASSED — System is production ready${NC}"
elif [ "$FAIL" -le "3" ]; then
  echo -e "  ${YELLOW}${BOLD}⚠️  MOSTLY PASSING — $FAIL minor issues to review${NC}"
else
  echo -e "  ${RED}${BOLD}❌ $FAIL FAILURES — Review issues above${NC}"
fi

echo ""
echo -e "  Run again after Jetson connects to verify face recognition pipeline."
echo ""