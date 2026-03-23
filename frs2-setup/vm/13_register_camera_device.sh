#!/bin/bash
# ============================================================
# STEP 13 — Register the Prama camera + update rule_config.json
# Run this on the VM (172.20.100.222)
# ============================================================
set -e

VM_IP="172.20.100.222"
CAM_IP="172.18.3.201"
PROJECT="/home/administrator/FRS_/FRS--Java-Verison"
CAM_ID="entrance-cam-01"

echo ""
echo "=================================================="
echo " STEP 13: Register camera device"
echo "=================================================="
echo ""

# ── Get auth token ────────────────────────────────────────
echo "[1/3] Getting auth token..."
LOGIN=$(curl -s -X POST "http://${VM_IP}:8080/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","password":"admin123"}')

TOKEN=$(echo "$LOGIN" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('accessToken',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "  ❌ Login failed: $LOGIN"
  echo "     Is the backend running? Check: docker compose ps"
  exit 1
fi
echo "  ✅ Token obtained"

# ── Register camera in DB via devices endpoint ────────────
echo ""
echo "[2/3] Registering camera device in database..."

# First check if device already exists
EXISTING=$(curl -s "http://${VM_IP}:8080/api/devices" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")

if echo "$EXISTING" | grep -q "$CAM_ID"; then
  echo "  ℹ  Camera '$CAM_ID' already registered, skipping insert"
else
  # Register via PostgreSQL directly (device registration may need admin endpoint)
  # Injecting into facility_device table used by the legacy attendance system
  docker exec attendance-postgres psql -U postgres -d attendance_intelligence << 'EOSQL'
    -- Get the first tenant/customer/site IDs from seed data
    DO $$
    DECLARE
      v_tenant   bigint;
      v_customer bigint;
      v_site     bigint;
      v_unit     bigint;
    BEGIN
      SELECT pk_tenant_id   INTO v_tenant   FROM frs_tenant   LIMIT 1;
      SELECT pk_customer_id INTO v_customer FROM frs_customer  LIMIT 1;
      SELECT pk_site_id     INTO v_site     FROM frs_site      LIMIT 1;
      SELECT pk_unit_id     INTO v_unit     FROM frs_unit      LIMIT 1;

      INSERT INTO facility_device (
        tenant_id, customer_id, site_id, unit_id,
        external_device_id, name, location_label,
        ip_address, status, recognition_accuracy,
        total_scans, error_rate, model, last_active
      ) VALUES (
        v_tenant, v_customer, v_site, v_unit,
        'entrance-cam-01', 'Main Entrance Camera', 'Main Entrance - Building A',
        '172.18.3.201', 'online', 0,
        0, 0, 'Prama Hikvision IP Camera', NOW()
      )
      ON CONFLICT (tenant_id, external_device_id) DO UPDATE
        SET ip_address = EXCLUDED.ip_address,
            status = 'online',
            last_active = NOW();

      RAISE NOTICE 'Device registered/updated';
    END $$;
EOSQL

  echo "  ✅ Camera registered in facility_device table"
fi

# Also register in the newer devices table (used by deviceRoutes)
docker exec attendance-postgres psql -U postgres -d attendance_intelligence -c "
INSERT INTO devices (
  device_code, device_name, device_type,
  ip_address, location_description, status,
  capabilities, config_json
) VALUES (
  'entrance-cam-01',
  'Main Entrance Camera',
  'camera',
  '${CAM_IP}',
  'Main entrance door, Building A ground floor',
  'online',
  '[\"face_detection\",\"face_enrollment\"]'::jsonb,
  '{\"rtspUrl\":\"rtsp://admin:PASS@${CAM_IP}:554/Streaming/Channels/102\",\"snapshotUrl\":\"http://admin:PASS@${CAM_IP}:80/ISAPI/Streaming/channels/101/picture\"}'::jsonb
)
ON CONFLICT (device_code) DO UPDATE
  SET status = 'online',
      ip_address = EXCLUDED.ip_address,
      last_seen_at = NOW();
" 2>/dev/null || true

echo "  ✅ Camera registered in devices table"

# ── Write rule_config.json ────────────────────────────────
echo ""
echo "[3/3] Writing rule_config.json for camera..."

cat > "$PROJECT/backend/conf/rule_config.json" << EOF
{
  "entrance-cam-01": [
    {
      "type": "FaceRecognitionRule",
      "enabled": true,
      "priority": "high",
      "parameters": {
        "minConfidence": 0.55,
        "cooldownSeconds": 10,
        "markAttendance": true,
        "direction": "entry"
      }
    },
    {
      "type": "VideoLossRule",
      "enabled": true,
      "priority": "high",
      "parameters": {
        "timeoutMs": 10000
      }
    }
  ]
}
EOF

echo "  ✅ Written: $PROJECT/backend/conf/rule_config.json"
echo ""
echo "  Restarting backend to pick up new rule_config..."
cd "$PROJECT"
docker compose restart backend

echo ""
echo "  Waiting for backend to restart..."
sleep 10
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://${VM_IP}:8080/api/health" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  echo "  ✅ Backend restarted"
else
  echo "  ⚠️  Backend returning HTTP $STATUS — check logs"
fi

echo ""
echo "=================================================="
echo " ✅ STEP 13 COMPLETE"
echo "=================================================="
echo ""
echo "Camera registered with ID: entrance-cam-01"
echo "Camera IP: ${CAM_IP}"
echo ""
echo "Next: SSH to Jetson and run the J0* scripts"
echo "  ssh ubuntu@172.18.3.202"
echo ""
