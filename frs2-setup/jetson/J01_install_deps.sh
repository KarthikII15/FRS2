#!/bin/bash
# ============================================================
# JETSON STEP J01 — Install all dependencies
# Run this ON THE JETSON (172.18.3.202)
# SSH in first: ssh ubuntu@172.18.3.202
# ============================================================
set -e

echo ""
echo "=================================================="
echo " JETSON J01: Installing dependencies"
echo "=================================================="
echo ""

# ── 1. System update ──────────────────────────────────────
echo "[1/6] Updating system packages..."
sudo apt-get update -y
sudo apt-get install -y \
  python3-pip python3-dev \
  libgstreamer1.0-dev \
  gstreamer1.0-tools \
  gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad \
  gstreamer1.0-plugins-ugly \
  gstreamer1.0-libav \
  python3-gst-1.0 \
  libopencv-dev \
  python3-opencv \
  netcat-openbsd \
  curl wget git
echo "  ✅ System packages installed"

# ── 2. Jetson-specific GStreamer plugins ──────────────────
echo ""
echo "[2/6] Installing Jetson GStreamer NVDEC plugins..."
sudo apt-get install -y \
  gstreamer1.0-plugins-bad \
  gstreamer1.0-tools \
  libgstreamer-plugins-bad1.0-dev 2>/dev/null || true

# Check if nvv4l2decoder is available (Jetson-specific)
if gst-inspect-1.0 nvv4l2decoder > /dev/null 2>&1; then
  echo "  ✅ nvv4l2decoder (Jetson HW decoder) available"
else
  echo "  ⚠️  nvv4l2decoder not found — will use SW fallback (avdec_h264)"
  echo "     To enable HW decode: sudo apt-get install -y nvidia-jetpack"
fi

# ── 3. Python packages ────────────────────────────────────
echo ""
echo "[3/6] Installing Python packages..."
pip3 install --break-system-packages \
  httpx \
  numpy \
  fastapi \
  uvicorn[standard] \
  python-multipart \
  pillow \
  onnxruntime 2>/dev/null || \
pip3 install \
  httpx \
  numpy \
  fastapi \
  "uvicorn[standard]" \
  python-multipart \
  pillow \
  onnxruntime

echo "  ✅ Python packages installed"

# ── 4. Check opencv ───────────────────────────────────────
echo ""
echo "[4/6] Verifying OpenCV with GStreamer support..."
python3 -c "
import cv2
build = cv2.getBuildInformation()
if 'GStreamer' in build and 'YES' in build[build.find('GStreamer'):build.find('GStreamer')+30]:
    print('  ✅ OpenCV built with GStreamer support')
else:
    print('  ⚠️  OpenCV may not have GStreamer support')
    print('     If RTSP fails, install: sudo apt-get install python3-opencv')
print(f'  OpenCV version: {cv2.__version__}')
"

# ── 5. Create directory structure ─────────────────────────
echo ""
echo "[5/6] Creating directory structure..."
sudo mkdir -p /opt/frs-models/trt
sudo mkdir -p /opt/frs-models/config
sudo mkdir -p /opt/frs
sudo chown -R "$USER:$USER" /opt/frs-models /opt/frs
echo "  ✅ Directories created:"
echo "     /opt/frs-models/trt      (TensorRT engine files)"
echo "     /opt/frs-models/config   (model_config.json, cameras.json)"
echo "     /opt/frs                 (runner scripts + token)"

# ── 6. Verify network to VM ───────────────────────────────
echo ""
echo "[6/6] Testing network connectivity to VM (172.20.100.222)..."
if ping -c 2 -W 3 172.20.100.222 > /dev/null 2>&1; then
  echo "  ✅ Can ping VM at 172.20.100.222"
else
  echo "  ❌ Cannot reach VM at 172.20.100.222"
  echo "     Check routing. You may need:"
  echo "     sudo ip route add 172.20.100.0/24 via <gateway-ip>"
  echo "     Replace <gateway-ip> with your network gateway"
fi

if curl -s --max-time 5 http://172.20.100.222:8080/api/health | grep -q "UP"; then
  echo "  ✅ Backend API reachable from Jetson"
else
  echo "  ⚠️  Backend not reachable yet — start backend on VM first (Step 08)"
fi

echo ""
echo "=================================================="
echo " ✅ JETSON J01 COMPLETE"
echo "=================================================="
echo ""
echo "Next: Run J02_write_configs.sh"
echo ""
