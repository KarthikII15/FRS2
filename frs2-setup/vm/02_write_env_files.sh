#!/bin/bash
# ============================================================
# STEP 02 — Write backend .env and frontend .env
# Run this on the VM (172.20.100.222)
# ============================================================
set -e

VM_IP="172.20.100.222"
JETSON_IP="172.18.3.202"
PROJECT="/home/administrator/FRS_/FRS--Java-Verison"

echo ""
echo "=================================================="
echo " STEP 02: Writing .env files"
echo "=================================================="
echo ""

# ── Guard: project must exist ─────────────────────────────
if [ ! -d "$PROJECT" ]; then
  echo "❌ ERROR: Project not found at $PROJECT"
  echo "   Run: git clone <your-repo-url> /opt/frs2"
  exit 1
fi

# ── Backend .env ──────────────────────────────────────────
echo "[1/2] Writing backend .env ..."

cat > "$PROJECT/backend/.env" << EOF
# ─── Server ──────────────────────────────────────────────
PORT=8080
CLIENT_ORIGIN=http://${VM_IP}:5173
PUBLIC_BASE_URL=http://${VM_IP}:8080
NODE_ENV=production

# ─── Database ────────────────────────────────────────────
# When running inside Docker, DB_HOST must be the service name "postgres"
# When running natively (not Docker), use ${VM_IP}
DB_HOST=postgres
DB_PORT=5432
DB_NAME=attendance_intelligence
DB_USER=postgres
DB_PASSWORD=postgres123
DB_SSL=false
DB_POOL_MAX=20
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=5000

# ─── Edge AI (Jetson sidecar on port 5000) ───────────────
EDGE_AI_URL=http://${JETSON_IP}:5000

# ─── Auth mode ───────────────────────────────────────────
# "api" for now. Step 11 will change this to "keycloak"
AUTH_MODE=api

# ─── Token TTL (api mode) ────────────────────────────────
ACCESS_TOKEN_TTL_MINUTES=30
REFRESH_TOKEN_TTL_DAYS=7

# ─── Keycloak (used after Step 11) ───────────────────────
KEYCLOAK_URL=http://${VM_IP}:9090
KEYCLOAK_REALM=attendance
KEYCLOAK_ISSUER=http://${VM_IP}:9090/realms/attendance
KEYCLOAK_AUDIENCE=attendance-frontend
KEYCLOAK_JWKS_URI=http://${VM_IP}:9090/realms/attendance/protocol/openid-connect/certs
KEYCLOAK_CLOCK_TOLERANCE_SEC=5

# ─── Kafka ───────────────────────────────────────────────
# Inside Docker: use service name "kafka" and internal port 9092
KAFKA_BROKERS=kafka:9092
KAFKA_CLIENT_ID=frs2-backend
KAFKA_GROUP_ID=frs2-consumer-group
KAFKA_TOPIC_PREFIX=frs.
KAFKA_NUM_PARTITIONS=3
KAFKA_REPLICATION_FACTOR=1

# ─── Analytics / Frame processing ────────────────────────
FRAME_QUEUE_SIZE=100
ENABLE_FACE_RECOGNITION=true
ENABLE_ALPR=false
ENABLE_REID=false
MOTION_SKIP_FRAMES=3

# ─── Face matching ───────────────────────────────────────
FACE_DB_PATH=/app/data/face_db.sqlite
FACE_MATCH_THRESHOLD=0.55

# ─── Snapshot ────────────────────────────────────────────
SNAPSHOT_TEMP_DIR=/app/temp/snapshots
SNAPSHOT_UPLOAD_CONCURRENCY=3
SNAPSHOT_MAX_RETRIES=3
EOF

echo "   ✅ Written: $PROJECT/backend/.env"

# ── Frontend .env ─────────────────────────────────────────
echo "[2/2] Writing frontend .env ..."

cat > "$PROJECT/.env" << EOF
# ─── Auth mode ───────────────────────────────────────────
# "api" for now. Step 11 will change this to "keycloak"
VITE_AUTH_MODE=api

# ─── Backend API ─────────────────────────────────────────
VITE_API_BASE_URL=http://${VM_IP}:8080/api

# ─── WebSocket (points to backend root, NOT /api) ────────
VITE_WS_URL=http://${VM_IP}:8080

# ─── Keycloak ────────────────────────────────────────────
VITE_KEYCLOAK_URL=http://${VM_IP}:9090
VITE_KEYCLOAK_REALM=attendance
VITE_KEYCLOAK_CLIENT_ID=attendance-frontend
EOF

echo "   ✅ Written: $PROJECT/.env"

echo ""
echo "=================================================="
echo " ✅ STEP 02 COMPLETE"
echo "=================================================="
echo ""
echo "Files written:"
echo "  $PROJECT/backend/.env"
echo "  $PROJECT/.env"
echo ""
