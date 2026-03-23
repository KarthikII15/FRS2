#!/bin/bash
# ============================================================
# JETSON STEP J02 — Write cameras.json and model_config.json
# Run this ON THE JETSON (172.18.3.202)
#
# IMPORTANT: Edit CAM_PASS below with your real camera password
# before running this script.
# ============================================================
set -e

VM_IP="172.20.100.222"
CAM_IP="172.18.3.201"
JETSON_IP="172.18.3.202"

# ── SET YOUR CAMERA PASSWORD HERE ─────────────────────────
CAM_PASS="admin123"   # <-- Change this to your real Prama camera password

echo ""
echo "=================================================="
echo " JETSON J02: Writing config files"
echo "=================================================="
echo ""
echo "  VM IP:     $VM_IP"
echo "  Jetson IP: $JETSON_IP"
echo "  Camera IP: $CAM_IP"
echo "  Cam pass:  ${CAM_PASS:0:2}***  (edit CAM_PASS in this script to change)"
echo ""

# ── cameras.json ──────────────────────────────────────────
echo "[1/2] Writing /opt/frs-models/config/cameras.json ..."

cat > /opt/frs-models/config/cameras.json << EOF
{
  "brand": "prama_hikvision",
  "rtsp_port": 554,
  "onvif_port": 80,
  "notes": [
    "Camera IP: ${CAM_IP}",
    "Jetson IP: ${JETSON_IP}",
    "VM/Backend IP: ${VM_IP}",
    "Sub-stream (102): 5 FPS, lower res — used for live attendance",
    "Main stream (101): full res — used for enrollment snapshots"
  ],
  "cameras": [
    {
      "id": "entrance-cam-01",
      "name": "Main Entrance",
      "model": "Prama Hikvision IP Camera",
      "ipAddress": "${CAM_IP}",
      "username": "admin",
      "password": "${CAM_PASS}",
      "channel": 1,
      "rtspPort": 554,
      "httpPort": 80,
      "rtspUrl":     "rtsp://admin:${CAM_PASS}@${CAM_IP}:554/Streaming/Channels/102",
      "rtspMainUrl": "rtsp://admin:${CAM_PASS}@${CAM_IP}:554/Streaming/Channels/101",
      "snapshotUrl": "http://admin:${CAM_PASS}@${CAM_IP}:80/ISAPI/Streaming/channels/101/picture",
      "onvifUrl":    "http://${CAM_IP}:80/onvif/device_service",
      "fpsTarget": 5,
      "resolution": "1280x720",
      "streamType": "sub",
      "role": "entry",
      "enabled": true
    }
  ]
}
EOF

echo "  ✅ cameras.json written"

# ── model_config.json ─────────────────────────────────────
echo ""
echo "[2/2] Writing /opt/frs-models/config/model_config.json ..."

cat > /opt/frs-models/config/model_config.json << 'EOF'
{
  "models": {
    "face_detection": {
      "path": "/opt/frs-models/trt",
      "filename": "yolov8n-face-fp16.engine",
      "inputShape": [1, 3, 640, 640],
      "confThreshold": 0.50,
      "nmsThreshold": 0.40,
      "type": "tensorrt"
    },
    "face_embedding": {
      "path": "/opt/frs-models/trt",
      "filename": "arcface-r50-fp16.engine",
      "inputShape": [1, 3, 112, 112],
      "embeddingDim": 512,
      "type": "tensorrt"
    }
  },
  "runtime": {
    "device": "cuda",
    "precision": "fp16",
    "batchSize": 1,
    "warmupRuns": 3
  }
}
EOF

echo "  ✅ model_config.json written"

# ── Write backend URL env file ────────────────────────────
echo ""
echo "Writing /opt/frs/.env ..."
cat > /opt/frs/.env << EOF
MODEL_CONFIG_PATH=/opt/frs-models/config/model_config.json
CAMERAS_CONFIG=/opt/frs-models/config/cameras.json
BACKEND_URL=http://${VM_IP}:8080
TOKEN_PATH=/opt/frs/device_token.txt
SIDECAR_PORT=5000
LOG_LEVEL=INFO
EOF

echo "  ✅ /opt/frs/.env written"

echo ""
echo "Config files written:"
echo "  /opt/frs-models/config/cameras.json"
echo "  /opt/frs-models/config/model_config.json"
echo "  /opt/frs/.env"
echo ""
echo "=================================================="
echo " ✅ JETSON J02 COMPLETE"
echo "=================================================="
echo ""
echo "Next: Run J03_test_camera.sh"
echo ""
