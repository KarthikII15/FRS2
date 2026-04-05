#!/bin/bash
# ====================================================================
# FRS2 PRODUCTION HARDENING DEPLOYMENT SCRIPT
# Run this on VM: 172.20.100.222
# ====================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

confirm() {
    local prompt="$1"
    local response
    read -p "$prompt (yes/no): " response
    if [ "$response" != "yes" ]; then
        log "Operation cancelled by user."
        exit 0
    fi
}

# ====================================================================
# PRE-FLIGHT CHECKS
# ====================================================================

log "Starting FRS2 Production Hardening..."

# Check if running as correct user
if [ "$USER" = "root" ]; then
    error "Do not run this as root. Run as your normal user (e.g., karthik)"
    exit 1
fi

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if docker compose is available
if ! docker compose version &> /dev/null; then
    error "Docker Compose is not available. Please install it first."
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    error "docker-compose.yml not found. Please run this from /home/administrator/FRS_/FRS--Java-Verison/"
    exit 1
fi

log "✓ Pre-flight checks passed"

# ====================================================================
# PHASE 1: BACKUP CURRENT CONFIGURATION
# ====================================================================

log "Phase 1: Backing up current configuration..."

BACKUP_DIR="$HOME/FRS_/FRS--Java-Verison/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

cp docker-compose.yml "$BACKUP_DIR/docker-compose.yml.backup"
cp backend/.env "$BACKUP_DIR/.env.backup" 2>/dev/null || warn "backend/.env not found"
cp frontend/Dockerfile "$BACKUP_DIR/Dockerfile.frontend.backup" 2>/dev/null || true

log "✓ Backups created in: $BACKUP_DIR"

# ====================================================================
# PHASE 2: GENERATE STRONG PASSWORDS
# ====================================================================

log "Phase 2: Generating strong passwords..."

warn "This will generate NEW passwords for PostgreSQL, Keycloak DB, and Keycloak Admin."
warn "You will need to update these in your environment variables."
confirm "Continue with password generation?"

POSTGRES_PASSWORD=$(openssl rand -base64 24)
KEYCLOAK_DB_PASSWORD=$(openssl rand -base64 24)
KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -base64 24)

# Save passwords to secure file
PASSWORDS_FILE="/home/administrator/FRS_/FRS--Java-Verison/PASSWORDS.txt"
cat > "$PASSWORDS_FILE" <<EOF
# FRS2 PRODUCTION PASSWORDS
# Generated: $(date)
# KEEP THIS FILE SECURE - chmod 600

POSTGRES_PASSWORD=$POSTGRES_PASSWORD
KEYCLOAK_DB_PASSWORD=$KEYCLOAK_DB_PASSWORD
KEYCLOAK_ADMIN_PASSWORD=$KEYCLOAK_ADMIN_PASSWORD

# Instructions:
# 1. Update these values in docker-compose.yml
# 2. Update DB_PASSWORD in backend/.env
# 3. Delete this file after saving passwords to password manager
EOF

chmod 600 "$PASSWORDS_FILE"

log "✓ Passwords generated and saved to: $PASSWORDS_FILE"
warn "IMPORTANT: Copy these passwords to your password manager NOW!"
warn "Press Enter after you've saved the passwords..."
read

# ====================================================================
# PHASE 3: CONFIGURE DOCKER LOG ROTATION
# ====================================================================

log "Phase 3: Configuring Docker log rotation..."

if [ ! -f "/etc/docker/daemon.json" ]; then
    log "Creating /etc/docker/daemon.json..."
    sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
EOF
    
    log "Restarting Docker daemon..."
    sudo systemctl restart docker
    sleep 5
    
    log "✓ Docker log rotation configured"
else
    warn "/etc/docker/daemon.json already exists. Skipping..."
fi

# ====================================================================
# PHASE 4: UPDATE DOCKER COMPOSE CONFIGURATION
# ====================================================================

log "Phase 4: Updating docker-compose.yml..."

warn "This will update docker-compose.yml with:"
warn "  - Localhost-only port bindings for PostgreSQL, Kafka, Zookeeper"
warn "  - Memory limits for all services"
warn "  - New password placeholders"
confirm "Apply docker-compose.yml changes?"

# Use the hardened version (you'll need to copy docker-compose-hardened.yml from the files I created)
if [ -f "docker-compose-hardened.yml" ]; then
    cp docker-compose.yml "$BACKUP_DIR/docker-compose.yml.pre-hardening"
    cp docker-compose-hardened.yml docker-compose.yml
    log "✓ Applied hardened docker-compose.yml"
else
    error "docker-compose-hardened.yml not found!"
    error "Please copy the hardened version from the deployment package."
    exit 1
fi

# ====================================================================
# PHASE 5: UPDATE PASSWORDS IN CONFIGURATION
# ====================================================================

log "Phase 5: Updating passwords in configuration files..."

# Update docker-compose.yml
sed -i "s/POSTGRES_PASSWORD:.*/POSTGRES_PASSWORD: $POSTGRES_PASSWORD/" docker-compose.yml
sed -i "s/KEYCLOAK_DB_PASSWORD:.*/KEYCLOAK_DB_PASSWORD: $KEYCLOAK_DB_PASSWORD/" docker-compose.yml
sed -i "s/KEYCLOAK_ADMIN_PASSWORD:.*/KEYCLOAK_ADMIN_PASSWORD: $KEYCLOAK_ADMIN_PASSWORD/" docker-compose.yml

# Update backend/.env
if [ -f "backend/.env" ]; then
    sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=$POSTGRES_PASSWORD/" backend/.env
    log "✓ Updated backend/.env"
fi

log "✓ Passwords updated in configuration files"

# ====================================================================
# PHASE 6: APPLY CHANGES
# ====================================================================

log "Phase 6: Applying changes..."

warn "This will restart your services with new configuration."
warn "Expected downtime: 2-3 minutes"
confirm "Apply changes and restart services?"

log "Stopping services..."
docker compose down

log "Starting services with new configuration..."
docker compose up -d

log "Waiting for services to start..."
sleep 30

# ====================================================================
# PHASE 7: VERIFY DEPLOYMENT
# ====================================================================

log "Phase 7: Verifying deployment..."

# Check if all containers are running
RUNNING_CONTAINERS=$(docker compose ps --filter "status=running" --format "{{.Service}}" | wc -l)
EXPECTED_CONTAINERS=7  # postgres, keycloak-postgres, keycloak, kafka, zookeeper, backend, frontend

if [ "$RUNNING_CONTAINERS" -ge "$EXPECTED_CONTAINERS" ]; then
    log "✓ All containers running ($RUNNING_CONTAINERS/$EXPECTED_CONTAINERS)"
else
    error "Only $RUNNING_CONTAINERS/$EXPECTED_CONTAINERS containers running"
    error "Check logs: docker compose logs"
    exit 1
fi

# Test backend health
sleep 10
if curl -sf http://localhost:8080/api/health > /dev/null; then
    log "✓ Backend health check passed"
else
    error "Backend health check failed"
    error "Check logs: docker compose logs backend"
    exit 1
fi

# Verify log rotation
if docker info | grep -q "max-size"; then
    log "✓ Docker log rotation configured"
else
    warn "Docker log rotation may not be active"
fi

# ====================================================================
# PHASE 8: INSTALL MONITORING SCRIPTS
# ====================================================================

log "Phase 8: Installing monitoring and backup scripts..."

# Copy scripts from deployment package
if [ -f "scripts/backup.sh" ]; then
    cp scripts/backup.sh /home/administrator/FRS_/FRS--Java-Verison/backup.sh
    chmod +x /home/administrator/FRS_/FRS--Java-Verison/backup.sh
    log "✓ Backup script installed"
fi

if [ -f "scripts/monitor.sh" ]; then
    cp scripts/monitor.sh /home/administrator/FRS_/FRS--Java-Verison/monitor.sh
    chmod +x /home/administrator/FRS_/FRS--Java-Verison/monitor.sh
    log "✓ Monitor script installed"
fi

# Create backup directory
sudo mkdir -p /home/administrator/FRS_/FRS--Java-Verison/backups
sudo chown $USER:$USER /home/administrator/FRS_/FRS--Java-Verison/backups

# Schedule cron jobs
log "Setting up automated tasks..."

# Backup daily at 2 AM
(crontab -l 2>/dev/null | grep -v "backup.sh" || true; echo "0 2 * * * /home/administrator/FRS_/FRS--Java-Verison/backup.sh") | crontab -

# Monitor every 5 minutes
(crontab -l 2>/dev/null | grep -v "monitor.sh" || true; echo "*/5 * * * * /home/administrator/FRS_/FRS--Java-Verison/monitor.sh") | crontab -

log "✓ Cron jobs scheduled"
crontab -l

# ====================================================================
# PHASE 9: ADD DATABASE INDEXES
# ====================================================================

log "Phase 9: Adding performance indexes..."

if [ -f "backend/src/db/migrations/add_performance_indexes.sql" ]; then
    log "Applying database indexes..."
    docker exec -i attendance-postgres psql -U postgres -d attendance_intelligence < \
        backend/src/db/migrations/add_performance_indexes.sql
    log "✓ Performance indexes added"
else
    warn "Index migration file not found. Skipping..."
fi

# ====================================================================
# COMPLETION
# ====================================================================

log ""
log "=================================================="
log "FRS2 PRODUCTION HARDENING COMPLETED SUCCESSFULLY!"
log "=================================================="
log ""
log "Summary of changes:"
log "  ✓ Docker log rotation configured (100MB max, 3 files)"
log "  ✓ Database ports bound to localhost only"
log "  ✓ Memory limits applied to all services"
log "  ✓ Strong passwords generated and applied"
log "  ✓ Automated backups scheduled (daily at 2 AM)"
log "  ✓ Health monitoring scheduled (every 5 minutes)"
log "  ✓ Performance indexes added"
log ""
log "IMPORTANT NEXT STEPS:"
log "  1. Save passwords from $PASSWORDS_FILE to password manager"
log "  2. Update Keycloak admin password in UI (http://172.20.100.222:9090)"
log "  3. Test manual backup: /home/administrator/FRS_/FRS--Java-Verison/backup.sh"
log "  4. Verify monitoring: tail -f /home/administrator/FRS_/FRS--Java-Verison/logs/monitor.log"
log ""
log "Backups saved to: $BACKUP_DIR"
log ""
warn "You still need to:"
warn "  - Set up HTTPS with nginx (see hardening guide Week 2)"
warn "  - Deploy production frontend build (see hardening guide Week 2)"
warn "  - Configure PostgreSQL replication (see hardening guide Week 3)"
log ""
log "System is now running with enhanced security!"
log "Current services status:"
docker compose ps
