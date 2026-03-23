#!/bin/bash
# ============================================================
# JETSON STEP J07 — Install systemd service (auto-start)
# Run this ON THE JETSON (172.18.3.202)
#
# After this, the runner starts automatically on boot and
# restarts if it crashes. Manage with:
#   sudo systemctl status  frs-edge
#   sudo systemctl start   frs-edge
#   sudo systemctl stop    frs-edge
#   sudo journalctl -fu    frs-edge
# ============================================================
set -e

VM_IP="172.20.100.222"

# Detect runner location
RUNNER_PATH=""
for P in "/opt/frs/runner.py" "/opt/frs/jetson/runner.py"; do
  if [ -f "$P" ]; then RUNNER_PATH="$P"; break; fi
done

if [ -z "$RUNNER_PATH" ]; then
  echo "❌ runner.py not found. Run J06 first."
  exit 1
fi

RUNNER_DIR=$(dirname "$RUNNER_PATH")

echo ""
echo "=================================================="
echo " JETSON J07: Installing systemd service"
echo "=================================================="
echo ""

# ── Write service file ────────────────────────────────────
echo "[1/3] Writing /etc/systemd/system/frs-edge.service ..."

sudo tee /etc/systemd/system/frs-edge.service > /dev/null << EOF
[Unit]
Description=FRS2 Edge Runner — Prama camera face recognition
Documentation=https://github.com/your-org/frs2
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${RUNNER_DIR}

# Environment
Environment=MODEL_CONFIG_PATH=/opt/frs-models/config/model_config.json
Environment=CAMERAS_CONFIG=/opt/frs-models/config/cameras.json
Environment=BACKEND_URL=http://${VM_IP}:8080
Environment=TOKEN_PATH=/opt/frs/device_token.txt
Environment=SIDECAR_PORT=5000
Environment=PYTHONUNBUFFERED=1

# Start command
ExecStart=/usr/bin/python3 ${RUNNER_PATH}

# Restart policy — restart 10 seconds after crash
Restart=always
RestartSec=10
StartLimitInterval=5min
StartLimitBurst=10

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=frs-edge

[Install]
WantedBy=multi-user.target
EOF

echo "  ✅ Service file written"

# ── Reload and enable ─────────────────────────────────────
echo ""
echo "[2/3] Enabling service..."
sudo systemctl daemon-reload
sudo systemctl enable frs-edge
echo "  ✅ frs-edge enabled (will start on next boot)"

# ── Start now ─────────────────────────────────────────────
echo ""
echo "[3/3] Starting frs-edge service now..."
sudo systemctl start frs-edge

sleep 4

STATUS=$(sudo systemctl is-active frs-edge)
if [ "$STATUS" = "active" ]; then
  echo "  ✅ frs-edge is running"
else
  echo "  ⚠️  Status: $STATUS"
  echo "     Check logs: sudo journalctl -fu frs-edge"
fi

echo ""
echo "  Service status:"
sudo systemctl status frs-edge --no-pager -l | head -20

echo ""
echo "=================================================="
echo " ✅ JETSON J07 COMPLETE"
echo "=================================================="
echo ""
echo "Useful commands:"
echo "  Live logs:    sudo journalctl -fu frs-edge"
echo "  Stop:         sudo systemctl stop frs-edge"
echo "  Restart:      sudo systemctl restart frs-edge"
echo "  Disable:      sudo systemctl disable frs-edge"
echo ""
