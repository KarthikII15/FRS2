#!/bin/bash
# ============================================================
# STEP 01 — Install Docker + Docker Compose + Node.js 20
# Run this on the VM (172.20.100.222)
# ============================================================
set -e

echo ""
echo "=================================================="
echo " STEP 01: Installing Docker + Node.js on VM"
echo "=================================================="
echo ""

# ── 1. System update ──────────────────────────────────────
echo "[1/5] Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y curl wget git ca-certificates gnupg lsb-release

# ── 2. Install Docker ─────────────────────────────────────
echo ""
echo "[2/5] Installing Docker..."
curl -fsSL https://get.docker.com | sudo sh

# Add current user to docker group
sudo usermod -aG docker "$USER"
echo "  → Added $USER to docker group"

# Start and enable Docker
sudo systemctl enable docker
sudo systemctl start docker

# ── 3. Install Docker Compose plugin ──────────────────────
echo ""
echo "[3/5] Installing Docker Compose plugin..."
sudo apt-get install -y docker-compose-plugin

# Verify
DOCKER_VERSION=$(docker --version)
COMPOSE_VERSION=$(docker compose version)
echo "  → $DOCKER_VERSION"
echo "  → $COMPOSE_VERSION"

# ── 4. Install Node.js 20 ─────────────────────────────────
echo ""
echo "[4/5] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
echo "  → Node: $NODE_VERSION"
echo "  → npm:  $NPM_VERSION"

# ── 5. Install netcat (used in health checks) ─────────────
echo ""
echo "[5/5] Installing helper tools..."
sudo apt-get install -y netcat-openbsd jq python3 python3-pip

echo ""
echo "=================================================="
echo " ✅ STEP 01 COMPLETE"
echo "=================================================="
echo ""
echo "⚠️  IMPORTANT: Log out and log back in (or run 'newgrp docker')"
echo "   so Docker group membership takes effect."
echo ""
echo "   Run this to activate without logout:"
echo "   newgrp docker"
echo ""
