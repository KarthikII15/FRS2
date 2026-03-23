#!/bin/bash
# ============================================================
# STEP 07 — Database migrations + seed + Kafka topics
# Run this on the VM (172.20.100.222)
# ============================================================
set -e

VM_IP="172.20.100.222"
PROJECT="/home/administrator/FRS_/FRS--Java-Verison"
BACKEND="$PROJECT/backend"

echo ""
echo "=================================================="
echo " STEP 07: Migrations + Seed + Kafka Topics"
echo "=================================================="
echo ""

cd "$BACKEND"

# Install backend node modules
echo "[1/4] Installing backend npm packages..."
npm install
echo "  ✅ npm install complete"

# ── Export DB env vars so scripts can reach containerized Postgres ──
# The scripts use pool.js which reads from process.env
export DB_HOST="${VM_IP}"
export DB_PORT=5432
export DB_NAME=attendance_intelligence
export DB_USER=postgres
export DB_PASSWORD=postgres123
export DB_SSL=false
export KAFKA_BROKERS="${VM_IP}:9093"
export KAFKA_CLIENT_ID=frs2-setup
export KAFKA_GROUP_ID=frs2-setup-group
export KAFKA_TOPIC_PREFIX=frs.
export KAFKA_NUM_PARTITIONS=3
export KAFKA_REPLICATION_FACTOR=1

# ── Create DB if not exists ───────────────────────────────
echo ""
echo "[2/4] Ensuring database exists..."
docker exec attendance-postgres psql -U postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname='attendance_intelligence'" \
  | grep -q 1 \
  || docker exec attendance-postgres psql -U postgres -c \
     "CREATE DATABASE attendance_intelligence;"
echo "  ✅ Database 'attendance_intelligence' ready"

# ── Run all migrations ────────────────────────────────────
echo ""
echo "[3/4] Running SQL migrations..."
echo "  (001_init_auth → 002_domain_live_data → 003_keycloak → 004_pgvector → 005_devices → 006_face_embeddings)"
echo ""

node scripts/migrate.js

echo ""
echo "  ✅ All migrations complete"

# ── Seed default data ─────────────────────────────────────
echo ""
echo "[3b/4] Seeding default users, departments, employees..."
node scripts/seed.js

echo ""
echo "  Default credentials seeded:"
echo "  • admin@company.com / admin123  (role: admin)"
echo "  • hr@company.com    / hr123     (role: hr)"
echo "  • 5 sample employees (EMP001–EMP005)"
echo "  ✅ Seed complete"

# ── Create Kafka topics ───────────────────────────────────
echo ""
echo "[4/4] Creating Kafka topics..."
node scripts/create-topics.js

echo ""
echo "  Verifying topics:"
docker exec attendance-kafka kafka-topics \
  --bootstrap-server localhost:9092 \
  --list 2>/dev/null | grep "frs\." | sed 's/^/  • /'

echo ""
echo "=================================================="
echo " ✅ STEP 07 COMPLETE"
echo "=================================================="
echo ""
echo "Next: Run 08_start_backend_frontend.sh"
echo ""
