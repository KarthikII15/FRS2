#!/bin/bash
set -euo pipefail

# Configuration
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/FRS_/FRS--Java-Verison/backups"
LOG_FILE="$BACKUP_DIR/backup.log"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "Starting FRS2 backup process..."
log "=========================================="

AVAILABLE_SPACE=$(df -h $BACKUP_DIR | awk 'NR==2 {print $4}')
log "Available disk space: $AVAILABLE_SPACE"

# Backup main PostgreSQL database
log "Backing up main database (attendance_intelligence)..."
if docker exec attendance-postgres pg_dump -U postgres \
    -d attendance_intelligence \
    --no-owner --no-acl \
    | gzip > "$BACKUP_DIR/attendance_db_$DATE.sql.gz"; then
    BACKUP_SIZE=$(du -h "$BACKUP_DIR/attendance_db_$DATE.sql.gz" | cut -f1)
    log "✓ Main database backup completed: $BACKUP_SIZE"
else
    log "✗ Main database backup failed!"
    exit 1
fi

# Backup Keycloak database - try different usernames
log "Backing up Keycloak database..."
KEYCLOAK_BACKED_UP=false

for KC_USER in keycloak keycloakuser postgres; do
    if docker exec attendance-keycloak-db pg_dump -U "$KC_USER" \
        -d keycloak \
        --no-owner --no-acl \
        2>/dev/null | gzip > "$BACKUP_DIR/keycloak_db_$DATE.sql.gz"; then
        BACKUP_SIZE=$(du -h "$BACKUP_DIR/keycloak_db_$DATE.sql.gz" | cut -f1)
        log "✓ Keycloak database backup completed: $BACKUP_SIZE (user: $KC_USER)"
        KEYCLOAK_BACKED_UP=true
        break
    fi
done

if [ "$KEYCLOAK_BACKED_UP" = false ]; then
    log "⚠ Warning: Could not backup Keycloak database (non-critical)"
fi

# Backup configuration files
log "Backing up configuration files..."
TEMP_CONFIG_DIR=$(mktemp -d)
mkdir -p "$TEMP_CONFIG_DIR/config"

CONFIG_FILES=(
    "$HOME/FRS_/FRS--Java-Verison/docker-compose.yml"
    "$HOME/FRS_/FRS--Java-Verison/backend/.env"
)

for file in "${CONFIG_FILES[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "$TEMP_CONFIG_DIR/config/" 2>/dev/null || true
    fi
done

if tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" -C "$TEMP_CONFIG_DIR" config/ 2>/dev/null; then
    BACKUP_SIZE=$(du -h "$BACKUP_DIR/config_$DATE.tar.gz" | cut -f1)
    log "✓ Configuration backup completed: $BACKUP_SIZE"
fi

rm -rf "$TEMP_CONFIG_DIR"

# Cleanup old backups
log "Cleaning up old backups (keeping last $RETENTION_DAYS days)..."
DELETED_COUNT=0

for file in $(find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS 2>/dev/null); do
    rm -f "$file"
    ((DELETED_COUNT++))
done

for file in $(find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS 2>/dev/null); do
    rm -f "$file"
    ((DELETED_COUNT++))
done

[ $DELETED_COUNT -gt 0 ] && log "✓ Deleted $DELETED_COUNT old backup(s)" || log "No old backups to delete"

# Summary
TOTAL_SIZE=$(du -sh $BACKUP_DIR | cut -f1)
BACKUP_COUNT=$(ls -1 $BACKUP_DIR/*.{sql.gz,tar.gz} 2>/dev/null | wc -l)

log "=========================================="
log "Backup Summary:"
log "  - Total backups: $BACKUP_COUNT files"
log "  - Total size: $TOTAL_SIZE"
log "=========================================="
log "✓ Backup completed successfully!"
