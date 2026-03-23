#!/bin/bash
# ============================================================
# JETSON STEP J03 — Test camera + backend connectivity
# Run this ON THE JETSON (172.18.3.202)
# ============================================================

VM_IP="172.20.100.222"
CAM_IP="172.18.3.201"

# Read camera password from cameras.json
CAM_PASS=$(python3 -c "
import json
with open('/opt/frs-models/config/cameras.json') as f:
    d = json.load(f)
print(d['cameras'][0]['password'])
" 2>/dev/null || echo "admin123")

echo ""
echo "=================================================="
echo " JETSON J03: Connectivity tests"
echo "=================================================="
echo ""

PASS=0
FAIL=0
WARN=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; echo "     Fix: $2"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠️  $1"; echo "     $2"; WARN=$((WARN+1)); }

# ── Camera tests ──────────────────────────────────────────
echo "[ Camera: ${CAM_IP} ]"

# RTSP port open
if nc -z -w4 "$CAM_IP" 554 2>/dev/null; then
  ok "Camera RTSP port 554 is open"
else
  fail "Camera RTSP port 554" "Check camera is powered and on 172.18.3.x network"
fi

# HTTP port open
if nc -z -w4 "$CAM_IP" 80 2>/dev/null; then
  ok "Camera HTTP port 80 is open"
else
  fail "Camera HTTP port 80" "Camera may not have HTTP enabled"
fi

# ISAPI device info
echo ""
echo "  Testing Hikvision ISAPI device info..."
ISAPI_RESP=$(curl -s --max-time 6 \
  -u "admin:${CAM_PASS}" \
  "http://${CAM_IP}:80/ISAPI/System/deviceInfo" 2>/dev/null || echo "FAILED")

if echo "$ISAPI_RESP" | grep -qi "deviceName\|model\|Hikvision\|PRAMA"; then
  ok "Camera ISAPI responds"
  # Extract model
  MODEL=$(echo "$ISAPI_RESP" | python3 -c "
import sys, re
text = sys.stdin.read()
m = re.search(r'<model>(.*?)</model>', text)
n = re.search(r'<deviceName>(.*?)</deviceName>', text)
s = re.search(r'<serialNumber>(.*?)</serialNumber>', text)
print(f'  Model: {m.group(1) if m else \"unknown\"}')
print(f'  Name:  {n.group(1) if n else \"unknown\"}')
print(f'  S/N:   {s.group(1) if s else \"unknown\"}')
" 2>/dev/null || true)
  echo "$MODEL"
elif echo "$ISAPI_RESP" | grep -qi "401\|Unauthorized"; then
  fail "Camera ISAPI auth" "Wrong password in cameras.json — edit J02_write_configs.sh and set CAM_PASS"
else
  warn "Camera ISAPI no response" "Camera may not support ISAPI. RTSP may still work."
fi

# Snapshot download
echo ""
echo "  Downloading test snapshot..."
curl -s --max-time 10 \
  -u "admin:${CAM_PASS}" \
  "http://${CAM_IP}:80/ISAPI/Streaming/channels/101/picture" \
  -o /tmp/test_snapshot.jpg 2>/dev/null

if [ -s /tmp/test_snapshot.jpg ]; then
  SIZE=$(du -h /tmp/test_snapshot.jpg | cut -f1)
  ok "Snapshot downloaded: /tmp/test_snapshot.jpg ($SIZE)"
else
  warn "Snapshot download failed" "Check camera password. Snapshot not required for RTSP streaming."
fi

# RTSP connectivity (socket test — not full decode)
echo ""
echo "  Testing RTSP sub-stream (socket only)..."
RTSP_RESP=$(echo -e "OPTIONS rtsp://${CAM_IP}:554/Streaming/Channels/102 RTSP/1.0\r\nCSeq: 1\r\n\r\n" \
  | nc -w4 "$CAM_IP" 554 2>/dev/null | head -1)
if echo "$RTSP_RESP" | grep -q "RTSP"; then
  ok "RTSP stream responds: $RTSP_RESP"
else
  warn "RTSP socket test inconclusive" "Will test further when runner.py starts"
fi

# ── VM/Backend tests ──────────────────────────────────────
echo ""
echo "[ VM Backend: ${VM_IP}:8080 ]"

# Ping VM
if ping -c 2 -W 3 "$VM_IP" > /dev/null 2>&1; then
  ok "Can ping VM at $VM_IP"
else
  fail "Cannot ping VM" "Add route: sudo ip route add 172.20.100.0/24 via <gateway>"
fi

# Backend health
HEALTH=$(curl -s --max-time 8 "http://${VM_IP}:8080/api/health" 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q '"status":"UP"'; then
  ok "Backend health endpoint: UP"
elif [ -z "$HEALTH" ]; then
  fail "Backend not reachable" "Start backend on VM first (Step 08). Check firewall: sudo ufw allow 8080/tcp"
else
  warn "Backend response unexpected" "$HEALTH"
fi

# WebSocket port
if nc -z -w4 "$VM_IP" 8080 2>/dev/null; then
  ok "Backend port 8080 open from Jetson"
else
  fail "Backend port 8080 closed" "sudo ufw allow 8080/tcp on VM"
fi

# ── Python environment ────────────────────────────────────
echo ""
echo "[ Python environment ]"

python3 -c "import httpx; print('  ✅ httpx:', httpx.__version__)" 2>/dev/null \
  || echo "  ❌ httpx not installed — run J01"

python3 -c "import cv2; print('  ✅ opencv:', cv2.__version__)" 2>/dev/null \
  || echo "  ❌ opencv not installed — run J01"

python3 -c "import numpy as np; print('  ✅ numpy:', np.__version__)" 2>/dev/null \
  || echo "  ❌ numpy not installed — run J01"

python3 -c "import fastapi; print('  ✅ fastapi:', fastapi.__version__)" 2>/dev/null \
  || echo "  ❌ fastapi not installed — run J01"

python3 -c "import uvicorn; print('  ✅ uvicorn installed')" 2>/dev/null \
  || echo "  ❌ uvicorn not installed — run J01"

# ── GStreamer check ───────────────────────────────────────
echo ""
echo "[ GStreamer ]"
if gst-inspect-1.0 rtspsrc > /dev/null 2>&1; then
  ok "GStreamer rtspsrc plugin available"
else
  fail "GStreamer rtspsrc missing" "sudo apt-get install -y gstreamer1.0-plugins-good"
fi

if gst-inspect-1.0 nvv4l2decoder > /dev/null 2>&1; then
  ok "nvv4l2decoder (Jetson HW) available — zero-CPU decode enabled"
else
  warn "nvv4l2decoder missing" "Will use SW decoder (avdec_h264). Install: sudo apt-get install -y nvidia-jetpack"
fi

if gst-inspect-1.0 avdec_h264 > /dev/null 2>&1; then
  ok "avdec_h264 (SW fallback decoder) available"
else
  warn "avdec_h264 missing" "sudo apt-get install -y gstreamer1.0-libav"
fi

# ── Model files check ─────────────────────────────────────
echo ""
echo "[ TensorRT model files ]"
if [ -f /opt/frs-models/trt/yolov8n-face-fp16.engine ]; then
  SIZE=$(du -h /opt/frs-models/trt/yolov8n-face-fp16.engine | cut -f1)
  ok "yolov8n-face-fp16.engine ($SIZE)"
else
  warn "yolov8n-face-fp16.engine missing" "See J03 notes below for conversion"
fi

if [ -f /opt/frs-models/trt/arcface-r50-fp16.engine ]; then
  SIZE=$(du -h /opt/frs-models/trt/arcface-r50-fp16.engine | cut -f1)
  ok "arcface-r50-fp16.engine ($SIZE)"
else
  warn "arcface-r50-fp16.engine missing" "See J03 notes below for conversion"
fi

echo ""
echo "=================================================="
echo " SUMMARY: $PASS passed, $WARN warnings, $FAIL failed"
echo "=================================================="

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Fix all ❌ failures before proceeding."
fi

echo ""
echo "─── TensorRT engine conversion (if engines are missing) ────"
echo ""
echo "You need ONNX source files first. Download:"
echo "  YOLOv8n-face ONNX: https://github.com/derronqi/yolov8-face"
echo "  ArcFace R50 ONNX:  https://github.com/onnx/models (vision/body_analysis/arcface)"
echo ""
echo "Then convert on the Jetson (must be done on Jetson — not portable):"
echo ""
echo "  # YOLOv8n-face"
echo "  /usr/src/tensorrt/bin/trtexec \\"
echo "    --onnx=yolov8n-face.onnx \\"
echo "    --saveEngine=/opt/frs-models/trt/yolov8n-face-fp16.engine \\"
echo "    --fp16 --workspace=4096"
echo ""
echo "  # ArcFace R50"
echo "  /usr/src/tensorrt/bin/trtexec \\"
echo "    --onnx=arcface-r50.onnx \\"
echo "    --saveEngine=/opt/frs-models/trt/arcface-r50-fp16.engine \\"
echo "    --fp16 --workspace=4096"
echo ""
echo "  Each conversion takes 5-15 minutes."
echo "───────────────────────────────────────────────────────────"
echo ""
echo "Next: Run J04_get_token.sh"
echo ""
