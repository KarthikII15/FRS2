#!/bin/bash
# ============================================================
# STEP 08 — Build and start backend + frontend
# Run this on the VM (172.20.100.222)
# ============================================================
set -e

VM_IP="172.20.100.222"
PROJECT="/home/administrator/FRS_/FRS--Java-Verison"

echo ""
echo "=================================================="
echo " STEP 08: Starting backend + frontend"
echo "=================================================="
echo ""

cd "$PROJECT"

# Build images (forces a fresh build with current code + .env)
echo "[1/3] Building Docker images..."
docker compose build backend frontend
echo "  ✅ Images built"

# Start services
echo ""
echo "[2/3] Starting backend and frontend containers..."
docker compose up -d backend frontend

echo ""
echo "[3/3] Waiting for backend to be ready..."
MAX_WAIT=120
WAITED=0
while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://${VM_IP}:8080/api/health" 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "  ✅ Backend is responding (HTTP 200)"
    break
  fi
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    echo "  ❌ Backend did not start after ${MAX_WAIT}s"
    echo "  Check logs:"
    docker compose logs --tail=40 backend
    exit 1
  fi
  printf "  ... %ss (HTTP %s)\r" "$WAITED" "$STATUS"
  sleep 5
  WAITED=$((WAITED + 5))
done

# Show backend health detail
echo ""
echo "  Backend health:"
curl -s "http://${VM_IP}:8080/api/health" | python3 -m json.tool 2>/dev/null \
  || curl -s "http://${VM_IP}:8080/api/health"

echo ""
echo "  Waiting for frontend..."
sleep 5
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://${VM_IP}:5173" 2>/dev/null || echo "000")
if [ "$FRONTEND_STATUS" = "200" ]; then
  echo "  ✅ Frontend is responding (HTTP 200)"
else
  echo "  ⚠️  Frontend returned HTTP $FRONTEND_STATUS (may still be starting)"
  echo "     Check: docker compose logs --tail=20 frontend"
fi

echo ""
echo "All running containers:"
docker compose ps

echo ""
echo "=================================================="
echo " ✅ STEP 08 COMPLETE"
echo "=================================================="
echo ""
echo "  Frontend:  http://${VM_IP}:5173"
echo "  Backend:   http://${VM_IP}:8080/api"
echo "  Health:    http://${VM_IP}:8080/api/health"
echo ""
echo "Next: Run 09_verify_backend.sh"
echo ""
