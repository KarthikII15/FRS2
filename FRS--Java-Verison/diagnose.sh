#!/bin/bash
VM_IP="172.20.100.222"

echo "════════════════════════════════════════"
echo "1. AUTH — why is login failing?"
echo "════════════════════════════════════════"
echo "Raw login response:"
curl -s -X POST http://$VM_IP:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","password":"admin123"}'
echo ""

echo ""
echo "════════════════════════════════════════"
echo "2. DB — are migrations run? (check tables)"
echo "════════════════════════════════════════"
docker exec attendance-postgres psql -U postgres -d attendance_intelligence \
  -c "\dt" 2>/dev/null || echo "Cannot reach postgres container"

echo ""
echo "3. DB — is frs_user seeded?"
docker exec attendance-postgres psql -U postgres -d attendance_intelligence \
  -c "SELECT pk_user_id, email, role FROM frs_user;" 2>/dev/null || echo "Table missing or DB not seeded"

echo ""
echo "4. DB — is frs_tenant seeded?"
docker exec attendance-postgres psql -U postgres -d attendance_intelligence \
  -c "SELECT pk_tenant_id, tenant_name FROM frs_tenant;" 2>/dev/null

echo ""
echo "5. DB — memberships?"
docker exec attendance-postgres psql -U postgres -d attendance_intelligence \
  -c "SELECT pk_membership_id, fk_user_id, role, tenant_id FROM frs_user_membership;" 2>/dev/null

echo ""
echo "════════════════════════════════════════"
echo "6. KEYCLOAK — is the container running?"
echo "════════════════════════════════════════"
docker ps | grep keycloak || echo "No keycloak container running"

echo ""
echo "════════════════════════════════════════"
echo "7. FRONTEND — what is on port 5173?"
echo "════════════════════════════════════════"
ss -tlnp | grep 5173 || echo "Nothing listening on 5173"

echo ""
echo "════════════════════════════════════════"
echo "8. CAMERA — test without password first"
echo "════════════════════════════════════════"
echo "ISAPI device info (unauthenticated, expect 401 not 404):"
curl -s -o /dev/null -w "HTTP %{http_code}" http://172.18.3.201:80/ISAPI/System/deviceInfo
echo ""
echo "RTSP port open?"
timeout 2 bash -c 'echo >/dev/tcp/172.18.3.201/554' 2>/dev/null && echo "Port 554 OPEN" || echo "Port 554 CLOSED/unreachable"
echo "HTTP port open?"
timeout 2 bash -c 'echo >/dev/tcp/172.18.3.201/80' 2>/dev/null && echo "Port 80 OPEN" || echo "Port 80 CLOSED/unreachable"

echo ""
echo "════════════════════════════════════════"
echo "9. BACKEND .env AUTH_MODE check"
echo "════════════════════════════════════════"
grep "AUTH_MODE" backend/.env 2>/dev/null || grep "AUTH_MODE" /proc/$(pgrep -f "node.*server")/environ 2>/dev/null | tr '\0' '\n' | grep AUTH || echo "Check backend/.env manually"

echo ""
echo "════════════════════════════════════════"
echo "10. BACKEND logs (last 30 lines)"
echo "════════════════════════════════════════"
docker logs attendance-backend --tail 30 2>/dev/null || echo "Backend not running in Docker — check process"