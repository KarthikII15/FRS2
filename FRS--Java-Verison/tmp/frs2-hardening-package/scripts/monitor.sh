#!/bin/bash
# ====================================================================
# FRS2 HEALTH MONITORING SCRIPT
# Scheduled to run every 5 minutes via cron
# ====================================================================

set -euo pipefail

# Configuration
LOG_FILE="/var/log/frs2-monitor.log"
ALERT_EMAIL="karthik@motivitylabs.com"
MAX_LOG_SIZE=10485760  # 10MB

# Rotate log if too large
if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE") -gt $MAX_LOG_SIZE ]; then
    mv "$LOG_FILE" "$LOG_FILE.old"
fi

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Alert function
alert() {
    local subject="$1"
    local message="$2"
    log "🚨 ALERT: $subject - $message"
    
    # Send email if mail command is available
    if command -v mail &> /dev/null; then
        echo "$message" | mail -s "FRS2 Alert: $subject" "$ALERT_EMAIL"
    fi
}

# ====================================================================
# CHECK 1: BACKEND API HEALTH
# ====================================================================

log "Checking backend API health..."

if curl -sf --max-time 10 http://localhost:8080/api/health > /dev/null; then
    log "✓ Backend API: healthy"
else
    alert "Backend Down" "Backend API is not responding at http://localhost:8080/api/health"
    
    log "Attempting to restart backend service..."
    cd /opt/frs2
    docker compose restart backend
    
    # Wait for restart
    sleep 15
    
    # Verify restart worked
    if curl -sf --max-time 10 http://localhost:8080/api/health > /dev/null; then
        alert "Backend Recovered" "Backend API has been restarted successfully"
        log "✓ Backend recovery successful"
    else
        alert "Backend Failed" "Backend API restart failed - manual intervention required"
        log "✗ Backend recovery failed - check logs: docker compose logs backend"
    fi
fi

# ====================================================================
# CHECK 2: KEYCLOAK HEALTH
# ====================================================================

log "Checking Keycloak health..."

if curl -sf --max-time 10 http://localhost:9090/health/ready > /dev/null; then
    log "✓ Keycloak: healthy"
else
    alert "Keycloak Down" "Keycloak is not responding at http://localhost:9090/health/ready"
    
    log "Attempting to restart Keycloak service..."
    cd /opt/frs2
    docker compose restart keycloak
    
    # Wait for restart (Keycloak takes longer)
    sleep 30
    
    # Verify restart worked
    if curl -sf --max-time 10 http://localhost:9090/health/ready > /dev/null; then
        alert "Keycloak Recovered" "Keycloak has been restarted successfully"
        log "✓ Keycloak recovery successful"
    else
        alert "Keycloak Failed" "Keycloak restart failed - manual intervention required"
        log "✗ Keycloak recovery failed - check logs: docker compose logs keycloak"
    fi
fi

# ====================================================================
# CHECK 3: DATABASE CONNECTIVITY
# ====================================================================

log "Checking PostgreSQL connectivity..."

if docker exec attendance-postgres pg_isready -U postgres > /dev/null 2>&1; then
    log "✓ PostgreSQL: accepting connections"
else
    alert "Database Down" "PostgreSQL is not accepting connections"
    
    log "Attempting to restart PostgreSQL..."
    cd /opt/frs2
    docker compose restart postgres
    
    sleep 10
    
    if docker exec attendance-postgres pg_isready -U postgres > /dev/null 2>&1; then
        alert "Database Recovered" "PostgreSQL has been restarted successfully"
        log "✓ PostgreSQL recovery successful"
    else
        alert "Database Failed" "PostgreSQL restart failed - manual intervention required"
        log "✗ PostgreSQL recovery failed - check logs: docker compose logs postgres"
    fi
fi

# ====================================================================
# CHECK 4: JETSON EDGE DEVICE
# ====================================================================

log "Checking Jetson edge device..."

# Try to reach Jetson health endpoint
if curl -sf --max-time 5 http://172.18.3.202:8000/health > /dev/null 2>&1; then
    log "✓ Jetson: reachable and healthy"
else
    log "⚠ Jetson: unreachable at 172.18.3.202:8000"
    # This is a warning, not critical - Jetson might be on different network segment
    # Don't send alert on first failure
fi

# ====================================================================
# CHECK 5: DISK SPACE
# ====================================================================

log "Checking disk space..."

DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')

if [ "$DISK_USAGE" -gt 90 ]; then
    alert "Disk Space Critical" "Root disk usage at ${DISK_USAGE}% - immediate action required"
    log "🚨 CRITICAL: Disk usage at ${DISK_USAGE}%"
    
    # Show largest directories
    log "Top 10 largest directories:"
    du -h /opt/frs2 2>/dev/null | sort -rh | head -10 | tee -a "$LOG_FILE"
    
    # Show Docker disk usage
    log "Docker disk usage:"
    docker system df | tee -a "$LOG_FILE"
    
elif [ "$DISK_USAGE" -gt 80 ]; then
    alert "Disk Space Warning" "Root disk usage at ${DISK_USAGE}% - cleanup recommended"
    log "⚠ WARNING: Disk usage at ${DISK_USAGE}%"
else
    log "✓ Disk space: ${DISK_USAGE}% used"
fi

# Check backup directory size
BACKUP_SIZE=$(du -sh /var/backups/frs2 2>/dev/null | cut -f1 || echo "0")
log "Backup directory size: $BACKUP_SIZE"

# ====================================================================
# CHECK 6: DOCKER CONTAINER STATUS
# ====================================================================

log "Checking Docker container status..."

cd /opt/frs2

# Get list of expected containers
EXPECTED_SERVICES=("postgres" "keycloak-postgres" "keycloak" "backend" "frontend" "kafka" "zookeeper")

ALL_RUNNING=true
for service in "${EXPECTED_SERVICES[@]}"; do
    STATUS=$(docker compose ps "$service" --format "{{.Status}}" 2>/dev/null || echo "missing")
    
    if echo "$STATUS" | grep -q "Up"; then
        log "✓ $service: running"
    else
        log "✗ $service: $STATUS"
        alert "Container Stopped" "Container '$service' is not running: $STATUS"
        ALL_RUNNING=false
    fi
done

if ! $ALL_RUNNING; then
    log "Some containers are not running - attempting restart..."
    docker compose up -d
fi

# ====================================================================
# CHECK 7: DOCKER LOG SIZE
# ====================================================================

log "Checking Docker log sizes..."

TOTAL_LOG_SIZE=0
for container in $(docker ps -q); do
    LOG_PATH=$(docker inspect --format='{{.LogPath}}' "$container" 2>/dev/null || echo "")
    if [ -n "$LOG_PATH" ] && [ -f "$LOG_PATH" ]; then
        LOG_SIZE=$(du -m "$LOG_PATH" | cut -f1)
        TOTAL_LOG_SIZE=$((TOTAL_LOG_SIZE + LOG_SIZE))
    fi
done

if [ "$TOTAL_LOG_SIZE" -gt 1000 ]; then
    log "⚠ WARNING: Docker logs total ${TOTAL_LOG_SIZE}MB - log rotation may not be working"
else
    log "✓ Docker logs: ${TOTAL_LOG_SIZE}MB"
fi

# ====================================================================
# CHECK 8: RECENT ERRORS IN BACKEND LOGS
# ====================================================================

log "Checking for recent backend errors..."

ERROR_COUNT=$(docker compose logs backend --since 5m 2>/dev/null | grep -i "error" | wc -l || echo 0)

if [ "$ERROR_COUNT" -gt 10 ]; then
    log "⚠ WARNING: $ERROR_COUNT errors in backend logs in last 5 minutes"
    # Show last 5 errors
    log "Recent errors:"
    docker compose logs backend --since 5m 2>/dev/null | grep -i "error" | tail -5 | tee -a "$LOG_FILE"
else
    log "✓ Backend error count: $ERROR_COUNT (last 5 min)"
fi

# ====================================================================
# CHECK 9: MEMORY USAGE
# ====================================================================

log "Checking container memory usage..."

# Get memory stats for all containers
MEMORY_STATS=$(docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}" 2>/dev/null || echo "")

if [ -n "$MEMORY_STATS" ]; then
    log "Container memory usage:"
    echo "$MEMORY_STATS" | tee -a "$LOG_FILE"
else
    log "⚠ Could not retrieve memory stats"
fi

# ====================================================================
# SUMMARY
# ====================================================================

log "=========================================="
log "Health check completed"
log "=========================================="
