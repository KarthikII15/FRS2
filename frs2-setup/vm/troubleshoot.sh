#!/bin/bash
# ============================================================
# TROUBLESHOOT — Diagnose common FRS2 issues
# Run this on the VM (172.20.100.222)
# ============================================================

VM_IP="172.20.100.222"
JETSON_IP="172.18.3.202"
PROJECT="/home/administrator/FRS_/FRS--Java-Verison"

echo ""
echo "=================================================="
echo " FRS2 Troubleshooter"
echo "=================================================="

# ── Detect what's wrong ───────────────────────────────────

echo ""
echo "─── Container status ─────────────────────────────"
cd "$PROJECT" 2>/dev/null && docker compose ps 2>/dev/null || \
  echo "  Cannot find docker-compose in $PROJECT"

echo ""
echo "─── Backend log (last 30 lines) ──────────────────"
docker logs --tail=30 attendance-backend 2>/dev/null || echo "  Backend container not running"

echo ""
echo "─── Keycloak log (last 20 lines, errors only) ────"
docker logs attendance-keycloak 2>/dev/null | grep -iE "ERROR|WARN|Exception|realm" | tail -20 \
  || echo "  Keycloak container not running"

echo ""
echo "─── Current .env values ──────────────────────────"
echo "  backend:"
grep -E "AUTH_MODE|DB_HOST|KAFKA_BROKERS|KEYCLOAK_ISSUER|EDGE_AI" \
  "$PROJECT/backend/.env" 2>/dev/null | sed 's/^/  /' || echo "  Not found"
echo ""
echo "  frontend:"
grep -E "VITE_AUTH_MODE|VITE_API_BASE|VITE_WS_URL" \
  "$PROJECT/.env" 2>/dev/null | sed 's/^/  /' || echo "  Not found"

echo ""
echo "─── Quick fix commands ───────────────────────────"
echo ""
echo "  Restart everything:"
echo "  cd $PROJECT && docker compose restart"
echo ""
echo "  View live backend logs:"
echo "  docker logs -f attendance-backend"
echo ""
echo "  View live keycloak logs:"
echo "  docker logs -f attendance-keycloak"
echo ""
echo "  Re-run migrations (if tables missing):"
echo "  cd $PROJECT/backend && DB_HOST=$VM_IP DB_PORT=5432 DB_NAME=attendance_intelligence DB_USER=postgres DB_PASSWORD=postgres123 node scripts/migrate.js"
echo ""
echo "  Wipe and restart Keycloak (realm not imported):"
echo "  cd $PROJECT && docker compose stop keycloak && docker volume rm \$(docker volume ls -q | grep keycloak-data) && docker compose up -d keycloak"
echo ""
echo "  Force rebuild all images:"
echo "  cd $PROJECT && docker compose build --no-cache && docker compose up -d"
echo ""
echo "  Open Keycloak admin:"
echo "  http://${VM_IP}:9090/admin  (admin / admin)"
echo ""
echo "  Test Keycloak login from command line:"
echo "  curl -s -X POST 'http://${VM_IP}:9090/realms/attendance/protocol/openid-connect/token' \\"
echo "    -d 'client_id=attendance-frontend&username=admin@company.com&password=admin123&grant_type=password' \\"
echo "    | python3 -c \"import sys,json; d=json.load(sys.stdin); print('OK' if 'access_token' in d else d)\""
echo ""
echo "  Fix: 'audience mismatch' error in backend:"
echo "  Re-run: vm/10_setup_keycloak_mappers.sh"
echo ""
echo "  Fix: Jetson cannot reach VM:"
echo "  On Jetson: sudo ip route add 172.20.100.0/24 via <your-gateway-ip>"
echo ""
echo "  Fix: Camera password wrong:"
echo "  Edit /opt/frs-models/config/cameras.json on Jetson and update 'password' field"
echo "  Then restart runner: sudo systemctl restart frs-edge"
echo ""
