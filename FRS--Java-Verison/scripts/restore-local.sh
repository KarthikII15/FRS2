#!/bin/bash
# ====================================================================
# FRS2 DATABASE RESTORE SCRIPT
# Use this to restore database from backup
# ====================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ====================================================================
# USAGE
# ====================================================================

if [ $# -ne 1 ]; then
    echo "Usage: $0 <backup_timestamp>"
    echo ""
    echo "Example: $0 20260403_020001"
    echo ""
    echo "Available backups:"
    echo "=================="
    
    if ls /home/administrator/FRS_/FRS--Java-Verison/backups/*.sql.gz 2>/dev/null | head -1 > /dev/null; then
        # Extract unique timestamps
        ls -1 /home/administrator/FRS_/FRS--Java-Verison/backups/*.sql.gz | \
            sed 's/.*_\([0-9]\{8\}_[0-9]\{6\}\)\.sql\.gz/\1/' | \
            sort -u | \
            while read timestamp; do
                # Find all files with this timestamp
                echo ""
                echo "Timestamp: $timestamp"
                echo "  Files:"
                ls -lh /home/administrator/FRS_/FRS--Java-Verison/backups/*_${timestamp}.* 2>/dev/null | \
                    awk '{print "    - " $9 " (" $5 ")"}'
            done
    else
        echo "  No backups found in /home/administrator/FRS_/FRS--Java-Verison/backups/"
    fi
    
    exit 1
fi

BACKUP_DATE=$1
BACKUP_DIR="/home/administrator/FRS_/FRS--Java-Verison/backups"

# ====================================================================
# VERIFICATION
# ====================================================================

log "Verifying backup files exist..."

ATTENDANCE_DB="$BACKUP_DIR/attendance_db_$BACKUP_DATE.sql.gz"
KEYCLOAK_DB="$BACKUP_DIR/keycloak_db_$BACKUP_DATE.sql.gz"

if [ ! -f "$ATTENDANCE_DB" ]; then
    error "Attendance database backup not found: $ATTENDANCE_DB"
    exit 1
fi

if [ ! -f "$KEYCLOAK_DB" ]; then
    error "Keycloak database backup not found: $KEYCLOAK_DB"
    exit 1
fi

log "✓ Found attendance database backup: $(du -h $ATTENDANCE_DB | cut -f1)"
log "✓ Found Keycloak database backup: $(du -h $KEYCLOAK_DB | cut -f1)"

# ====================================================================
# CONFIRMATION
# ====================================================================

echo ""
warn "╔════════════════════════════════════════════════════════════╗"
warn "║                  ⚠️  CRITICAL WARNING ⚠️                   ║"
warn "╠════════════════════════════════════════════════════════════╣"
warn "║ This will REPLACE your current database with the backup   ║"
warn "║ from: $BACKUP_DATE                                         ║"
warn "║                                                            ║"
warn "║ ALL CURRENT DATA WILL BE LOST!                            ║"
warn "║                                                            ║"
warn "║ The system will be DOWN for approximately 2-3 minutes.    ║"
warn "╚════════════════════════════════════════════════════════════╝"
echo ""

read -p "Type 'yes' to continue, anything else to abort: " confirm

if [ "$confirm" != "yes" ]; then
    log "Restore cancelled by user."
    exit 0
fi

# ====================================================================
# CREATE SAFETY BACKUP
# ====================================================================

log "Creating safety backup of current state..."

SAFETY_DATE=$(date +%Y%m%d_%H%M%S)
SAFETY_DIR="/home/administrator/FRS_/FRS--Java-Verison/backups/pre-restore-$SAFETY_DATE"
mkdir -p "$SAFETY_DIR"

cd /opt/frs2

log "Backing up current database before restore..."

docker exec attendance-postgres pg_dump -U postgres \
    -d attendance_intelligence \
    --no-owner --no-acl \
    | gzip > "$SAFETY_DIR/attendance_db_current.sql.gz"

docker exec keycloak-postgres pg_dump -U postgres \
    -d keycloak \
    --no-owner --no-acl \
    | gzip > "$SAFETY_DIR/keycloak_db_current.sql.gz"

log "✓ Safety backup created in: $SAFETY_DIR"
log "✓ If restore fails, you can restore from these files"

# ====================================================================
# STOP SERVICES
# ====================================================================

log "Stopping services that use the database..."

docker compose stop backend keycloak

sleep 5

# ====================================================================
# RESTORE ATTENDANCE DATABASE
# ====================================================================

log "Restoring main database (attendance_intelligence)..."

# Drop existing connections
docker exec -i attendance-postgres psql -U postgres <<EOF
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = 'attendance_intelligence'
  AND pid <> pg_backend_pid();
EOF

# Drop and recreate database
docker exec -i attendance-postgres psql -U postgres <<EOF
DROP DATABASE IF EXISTS attendance_intelligence;
CREATE DATABASE attendance_intelligence;
EOF

# Restore from backup
log "Importing backup data..."
gunzip < "$ATTENDANCE_DB" | \
    docker exec -i attendance-postgres psql -U postgres -d attendance_intelligence

if [ $? -eq 0 ]; then
    log "✓ Main database restored successfully"
else
    error "Main database restore failed!"
    error "To recover, run: gunzip < $SAFETY_DIR/attendance_db_current.sql.gz | docker exec -i attendance-postgres psql -U postgres -d attendance_intelligence"
    exit 1
fi

# ====================================================================
# RESTORE KEYCLOAK DATABASE
# ====================================================================

log "Restoring Keycloak database..."

# Drop existing connections
docker exec -i keycloak-postgres psql -U postgres <<EOF
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = 'keycloak'
  AND pid <> pg_backend_pid();
EOF

# Drop and recreate database
docker exec -i keycloak-postgres psql -U postgres <<EOF
DROP DATABASE IF EXISTS keycloak;
CREATE DATABASE keycloak;
EOF

# Restore from backup
log "Importing Keycloak backup data..."
gunzip < "$KEYCLOAK_DB" | \
    docker exec -i keycloak-postgres psql -U postgres -d keycloak

if [ $? -eq 0 ]; then
    log "✓ Keycloak database restored successfully"
else
    error "Keycloak database restore failed!"
    error "To recover, run: gunzip < $SAFETY_DIR/keycloak_db_current.sql.gz | docker exec -i keycloak-postgres psql -U postgres -d keycloak"
    exit 1
fi

# ====================================================================
# RESTART SERVICES
# ====================================================================

log "Restarting services..."

docker compose up -d backend keycloak

log "Waiting for services to start..."
sleep 30

# ====================================================================
# VERIFICATION
# ====================================================================

log "Verifying system health..."

# Check backend
if curl -sf --max-time 30 http://localhost:8080/api/health > /dev/null; then
    log "✓ Backend API is responding"
else
    warn "Backend API is not responding yet - may need more time"
    warn "Check status: docker compose logs backend"
fi

# Check Keycloak
if curl -sf --max-time 30 http://localhost:9090/health/ready > /dev/null; then
    log "✓ Keycloak is responding"
else
    warn "Keycloak is not responding yet - may need more time"
    warn "Check status: docker compose logs keycloak"
fi

# ====================================================================
# COMPLETION
# ====================================================================

log ""
log "╔════════════════════════════════════════════════════════════╗"
log "║           ✓ DATABASE RESTORE COMPLETED                    ║"
log "╚════════════════════════════════════════════════════════════╝"
log ""
log "Summary:"
log "  - Restored from: $BACKUP_DATE"
log "  - Safety backup: $SAFETY_DIR"
log "  - Services restarted"
log ""
log "Next steps:"
log "  1. Verify application functionality"
log "  2. Check that expected data is present"
log "  3. Test login with Keycloak"
log "  4. Test face recognition from Jetson"
log ""
log "If everything looks good, you can delete the safety backup:"
log "  rm -rf $SAFETY_DIR"
log ""
