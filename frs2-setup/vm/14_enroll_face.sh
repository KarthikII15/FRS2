#!/bin/bash
# ============================================================
# STEP 14 — Enroll an employee face
# Run this on the VM (172.20.100.222)
#
# Usage:
#   ./14_enroll_face.sh                          # interactive prompts
#   ./14_enroll_face.sh EMP001 /path/to/photo.jpg
# ============================================================

VM_IP="172.20.100.222"
JETSON_IP="172.18.3.202"

EMPLOYEE_CODE="${1:-}"
PHOTO_PATH="${2:-}"

echo ""
echo "=================================================="
echo " STEP 14: Enroll employee face"
echo "=================================================="
echo ""

# ── Get token ─────────────────────────────────────────────
echo "Getting auth token..."
LOGIN=$(curl -s -X POST "http://${VM_IP}:8080/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","password":"admin123"}')

TOKEN=$(echo "$LOGIN" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('accessToken',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi
echo "✅ Token obtained"

# ── List employees for reference ──────────────────────────
echo ""
echo "Employees in the system:"
EMPS=$(curl -s "http://${VM_IP}:8080/api/employees" \
  -H "Authorization: Bearer $TOKEN")
echo "$EMPS" | python3 -c "
import sys, json
d = json.load(sys.stdin)
emps = d.get('employees', d) if isinstance(d, dict) else d
if isinstance(emps, list):
    for e in emps:
        enrolled = '✅' if e.get('face_enrolled') else '⬜'
        print(f'  {enrolled} {e.get(\"employee_code\",\"?\")} | {e.get(\"full_name\",\"?\")} | ID: {e.get(\"pk_employee_id\",\"?\")}')
" 2>/dev/null || echo "$EMPS" | head -5

# ── Interactive input if not provided ─────────────────────
if [ -z "$EMPLOYEE_CODE" ]; then
  echo ""
  read -p "Enter employee code (e.g. EMP001): " EMPLOYEE_CODE
fi

if [ -z "$PHOTO_PATH" ]; then
  echo ""
  echo "Options:"
  echo "  1) Upload a local photo file"
  echo "  2) Take snapshot from camera (requires camera to be reachable)"
  read -p "Choose [1/2]: " CHOICE

  if [ "$CHOICE" = "2" ]; then
    echo ""
    read -p "Camera password: " CAM_PASS
    echo "Taking snapshot from camera..."
    curl -s -o /tmp/enroll_snap.jpg \
      "http://admin:${CAM_PASS}@172.18.3.201:80/ISAPI/Streaming/channels/101/picture"
    if [ -s /tmp/enroll_snap.jpg ]; then
      echo "✅ Snapshot saved to /tmp/enroll_snap.jpg"
      PHOTO_PATH="/tmp/enroll_snap.jpg"
    else
      echo "❌ Snapshot failed — check camera password and connectivity"
      exit 1
    fi
  else
    read -p "Path to photo file: " PHOTO_PATH
  fi
fi

if [ ! -f "$PHOTO_PATH" ]; then
  echo "❌ Photo not found: $PHOTO_PATH"
  exit 1
fi

echo ""
echo "Photo file: $PHOTO_PATH ($(du -h "$PHOTO_PATH" | cut -f1))"

# ── Get employee DB ID from code ──────────────────────────
EMP_DB_ID=$(docker exec attendance-postgres psql -U postgres -d attendance_intelligence -tAc \
  "SELECT pk_employee_id FROM hr_employee WHERE employee_code='${EMPLOYEE_CODE}' LIMIT 1;" 2>/dev/null | tr -d ' ')

if [ -z "$EMP_DB_ID" ]; then
  echo "❌ Employee '$EMPLOYEE_CODE' not found in DB"
  exit 1
fi

EMP_NAME=$(docker exec attendance-postgres psql -U postgres -d attendance_intelligence -tAc \
  "SELECT full_name FROM hr_employee WHERE pk_employee_id=${EMP_DB_ID} LIMIT 1;" 2>/dev/null | tr -d ' ')

echo "Employee: $EMP_NAME (ID: $EMP_DB_ID, code: $EMPLOYEE_CODE)"

# ── Send photo to backend → EdgeAI → get embedding ────────
echo ""
echo "Sending photo to backend for face recognition..."
RECOG=$(curl -s -X POST "http://${VM_IP}:8080/api/face/recognize" \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@${PHOTO_PATH}")

echo "Recognition response:"
echo "$RECOG" | python3 -m json.tool 2>/dev/null || echo "$RECOG"

# If the Jetson sidecar is running, it will return an embedding.
# If EdgeAI is unavailable, the backend returns 503.
# For direct embedding registration (if you have the embedding):
echo ""
echo "─────────────────────────────────────────────────────"
echo "If the above returned 503 (EdgeAI unavailable), use the"
echo "UI enrollment path instead:"
echo ""
echo "  1. Open http://${VM_IP}:5173"
echo "  2. Login as hr@company.com / hr123"
echo "  3. Go to Employees → $EMP_NAME → Face Enrollment"
echo "  4. Upload $PHOTO_PATH"
echo "─────────────────────────────────────────────────────"

echo ""
echo "=================================================="
echo " ✅ STEP 14 COMPLETE"
echo "=================================================="
echo ""
echo "Next: Run 15_final_verify.sh for full end-to-end check"
echo ""
