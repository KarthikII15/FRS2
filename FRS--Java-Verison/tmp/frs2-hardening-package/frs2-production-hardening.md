# FRS2 Production Hardening Guide
**For: Karthik (Solo Deployment)**  
**System: VM 172.20.100.222 + Jetson 172.18.3.202**  
**Estimated Total Time: 3-4 days (spread over 2 weeks)**

---

## Pre-Flight Checklist

```bash
# On VM - verify you have access
ssh karthik@172.20.100.222
cd /opt/frs2  # or wherever your docker-compose.yml lives
docker compose ps  # verify all services running

# On Jetson - verify access
ssh karthik@172.18.3.202
systemctl status frs-runner  # verify service running
```

---

## PHASE 1: IMMEDIATE SECURITY FIXES (No Downtime)
**Time: 2-3 hours | Risk: Low | Downtime: 0 minutes**

### Fix 1.1: Docker Log Rotation (Prevents Disk Exhaustion)

**On VM:**
```bash
# Create Docker daemon config
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
EOF

# Restart Docker daemon (containers will auto-restart)
sudo systemctl restart docker

# Verify
docker info | grep -A 5 "Logging Driver"
# Should show: max-size: 100m, max-file: 3
```

**Rollback if needed:**
```bash
sudo rm /etc/docker/daemon.json
sudo systemctl restart docker
```

---

### Fix 1.2: Bind Internal Services to Localhost Only

**On VM:**
```bash
cd /opt/frs2

# Backup current compose file
cp docker-compose.yml docker-compose.yml.backup

# Edit docker-compose.yml - Change these port bindings:
```

**Edit `docker-compose.yml`** — find and replace:

**BEFORE:**
```yaml
  postgres:
    ports:
      - "5432:5432"
  
  kafka:
    ports:
      - "9092:9092"
      - "9093:9093"
  
  zookeeper:
    ports:
      - "2181:2181"
```

**AFTER:**
```yaml
  postgres:
    ports:
      - "127.0.0.1:5432:5432"
  
  kafka:
    ports:
      - "127.0.0.1:9092:9092"
      - "127.0.0.1:9093:9093"
  
  zookeeper:
    ports:
      - "127.0.0.1:2181:2181"
```

**Apply changes:**
```bash
# This will recreate only affected containers (near-zero downtime)
docker compose up -d

# Verify services still work
curl http://localhost:8080/api/health
# Should return: {"status":"healthy","database":"connected",...}

# Verify external access is blocked
# From another machine, try: telnet 172.20.100.222 5432
# Should fail (connection refused)
```

**Rollback if needed:**
```bash
mv docker-compose.yml.backup docker-compose.yml
docker compose up -d
```

---

### Fix 1.3: Add Memory Limits to Prevent OOM Crashes

**On VM, edit `docker-compose.yml`:**

Add these under each service:

```yaml
  kafka:
    # ... existing config ...
    environment:
      # ... existing env vars ...
      KAFKA_HEAP_OPTS: "-Xmx512m -Xms256m"
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M

  keycloak:
    # ... existing config ...
    environment:
      # ... existing env vars ...
      JAVA_OPTS: "-Xms256m -Xmx512m"
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M

  backend:
    # ... existing config ...
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

  frontend:
    # ... existing config ...
    deploy:
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 128M
```

**Apply:**
```bash
docker compose up -d

# Verify memory limits active
docker stats --no-stream
# Should show MEM LIMIT column with values you set
```

---

### Fix 1.4: Enable Keycloak Brute Force Protection

**On VM:**
```bash
# Login to Keycloak admin console
# Open browser: http://172.20.100.222:9090
# Username: admin, Password: admin (you'll change this in Phase 2)

# Navigate to: Realm Settings → Security Defenses → Brute Force Detection
# Enable: ON
# Set:
#   - Max Login Failures: 5
#   - Wait Increment: 60 seconds
#   - Quick Login Check: 1000ms
#   - Minimum Quick Login Wait: 60 seconds
#   - Max Wait: 900 seconds (15 min)
#   - Failure Reset Time: 12 hours

# Click "Save"
```

**Verification:**
```bash
# Check realm export
docker exec attendance-keycloak /opt/keycloak/bin/kc.sh export \
  --dir /tmp --realm attendance

docker exec attendance-keycloak cat /tmp/attendance-realm.json | grep bruteForce
# Should show: "bruteForceProtected": true
```

---

## PHASE 2: PASSWORD HARDENING (Requires 5-10 min Downtime)
**Time: 1-2 hours | Risk: Medium | Downtime: 5-10 minutes**

**⚠️ PLAN THIS FOR OFF-HOURS (early morning/late evening)**

### Fix 2.1: Generate Strong Passwords

**On VM:**
```bash
# Generate 3 strong passwords
POSTGRES_PASSWORD=$(openssl rand -base64 24)
KEYCLOAK_DB_PASSWORD=$(openssl rand -base64 24)
KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -base64 24)

# Save them to a secure file
cat > /opt/frs2/PASSWORDS.txt <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
KEYCLOAK_DB_PASSWORD=$KEYCLOAK_DB_PASSWORD
KEYCLOAK_ADMIN_PASSWORD=$KEYCLOAK_ADMIN_PASSWORD
Generated: $(date)
EOF

chmod 600 /opt/frs2/PASSWORDS.txt

# Display (copy these to your password manager NOW)
cat /opt/frs2/PASSWORDS.txt
```

---

### Fix 2.2: Update PostgreSQL Password

**On VM:**
```bash
cd /opt/frs2

# Stop services that depend on Postgres
docker compose stop backend keycloak

# Update main Postgres password
docker exec -it attendance-postgres psql -U postgres <<EOF
ALTER USER postgres WITH PASSWORD '$POSTGRES_PASSWORD';
\q
EOF

# Update Keycloak database user password
docker exec -it keycloak-postgres psql -U postgres <<EOF
ALTER USER postgres WITH PASSWORD '$KEYCLOAK_DB_PASSWORD';
\q
EOF

# Update docker-compose.yml
# Replace POSTGRES_PASSWORD values with new passwords

# Update backend/.env
sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=$POSTGRES_PASSWORD/" backend/.env

# Update Keycloak DB password in docker-compose.yml
# (manually edit the KC_DB_PASSWORD value)

# Restart services
docker compose up -d backend keycloak

# Verify backend connects
curl http://localhost:8080/api/health
```

---

### Fix 2.3: Update Keycloak Admin Password

**On VM:**
```bash
# Set new admin password
docker exec attendance-keycloak /opt/keycloak/bin/kc.sh \
  user set-password --username admin --password "$KEYCLOAK_ADMIN_PASSWORD"

# Update docker-compose.yml
# Replace KEYCLOAK_ADMIN_PASSWORD value

# Test login
# Browser: http://172.20.100.222:9090
# Username: admin
# Password: (use new password from PASSWORDS.txt)
```

---

## PHASE 3: AUTOMATED BACKUPS (No Downtime)
**Time: 1 hour | Risk: Low | Downtime: 0 minutes**

### Fix 3.1: Create Backup Script

**On VM:**
```bash
# Create backup directory
sudo mkdir -p /var/backups/frs2
sudo chown $USER:$USER /var/backups/frs2

# Create backup script
cat > /opt/frs2/backup.sh <<'EOF'
#!/bin/bash
set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/frs2"
LOG_FILE="$BACKUP_DIR/backup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting FRS2 backup..."

# Backup main PostgreSQL database
log "Backing up attendance_intelligence database..."
docker exec attendance-postgres pg_dump -U postgres \
    -d attendance_intelligence \
    --no-owner --no-acl \
    | gzip > "$BACKUP_DIR/attendance_db_$DATE.sql.gz"

# Backup Keycloak database
log "Backing up keycloak database..."
docker exec keycloak-postgres pg_dump -U postgres \
    -d keycloak \
    --no-owner --no-acl \
    | gzip > "$BACKUP_DIR/keycloak_db_$DATE.sql.gz"

# Backup Jetson photos directory (if mounted/accessible)
if [ -d "/opt/frs/photos" ]; then
    log "Backing up proof photos..."
    tar -czf "$BACKUP_DIR/photos_$DATE.tar.gz" \
        -C /opt/frs photos/ 2>/dev/null || log "Photo backup skipped (directory not found)"
fi

# Backup configuration files
log "Backing up configuration..."
tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" \
    /opt/frs2/docker-compose.yml \
    /opt/frs2/backend/.env \
    /opt/frs2/keycloak/realm-export.json 2>/dev/null || true

# Keep only last 7 days of backups
log "Cleaning old backups..."
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

# Calculate backup sizes
TOTAL_SIZE=$(du -sh $BACKUP_DIR | cut -f1)
log "Backup completed successfully. Total backup size: $TOTAL_SIZE"

# Verify latest backups exist and are not empty
for file in "$BACKUP_DIR"/*_$DATE.*; do
    if [ -f "$file" ] && [ -s "$file" ]; then
        log "✓ $(basename $file) - $(du -h $file | cut -f1)"
    else
        log "✗ WARNING: $(basename $file) is missing or empty!"
    fi
done

log "Backup process finished."
EOF

chmod +x /opt/frs2/backup.sh

# Test backup manually
/opt/frs2/backup.sh

# Verify backups created
ls -lh /var/backups/frs2/
```

---

### Fix 3.2: Schedule Automated Backups

**On VM:**
```bash
# Add to crontab (runs daily at 2 AM)
(crontab -l 2>/dev/null || true; echo "0 2 * * * /opt/frs2/backup.sh") | crontab -

# Verify cron job added
crontab -l | grep backup.sh
```

---

### Fix 3.3: Create Restore Script

**On VM:**
```bash
cat > /opt/frs2/restore.sh <<'EOF'
#!/bin/bash
set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: $0 <backup_date>"
    echo "Example: $0 20260403_020001"
    echo ""
    echo "Available backups:"
    ls -1 /var/backups/frs2/*.sql.gz | sed 's/.*_\([0-9_]*\)\.sql\.gz/\1/' | sort -u
    exit 1
fi

BACKUP_DATE=$1
BACKUP_DIR="/var/backups/frs2"

echo "⚠️  WARNING: This will REPLACE current database with backup from $BACKUP_DATE"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo "Stopping services..."
cd /opt/frs2
docker compose stop backend keycloak

echo "Restoring attendance_intelligence database..."
gunzip < "$BACKUP_DIR/attendance_db_$BACKUP_DATE.sql.gz" | \
    docker exec -i attendance-postgres psql -U postgres -d attendance_intelligence

echo "Restoring keycloak database..."
gunzip < "$BACKUP_DIR/keycloak_db_$BACKUP_DATE.sql.gz" | \
    docker exec -i keycloak-postgres psql -U postgres -d keycloak

echo "Restarting services..."
docker compose up -d backend keycloak

echo "✓ Restore completed. Verify system health:"
echo "  curl http://localhost:8080/api/health"
EOF

chmod +x /opt/frs2/restore.sh
```

**Test restore procedure (DRY RUN):**
```bash
# List available backups
/opt/frs2/restore.sh

# Don't actually restore yet, just verify the script works
```

---

## PHASE 4: BASIC MONITORING (No Downtime)
**Time: 1 hour | Risk: Low | Downtime: 0 minutes**

### Fix 4.1: Health Check Monitor

**On VM:**
```bash
cat > /opt/frs2/monitor.sh <<'EOF'
#!/bin/bash
set -euo pipefail

LOG_FILE="/var/log/frs2-monitor.log"
ALERT_EMAIL="karthik@motivitylabs.com"  # Change this to your email

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

alert() {
    local subject="$1"
    local message="$2"
    log "ALERT: $subject - $message"
    
    # Email alert (requires mailutils to be installed)
    if command -v mail &> /dev/null; then
        echo "$message" | mail -s "FRS2 Alert: $subject" "$ALERT_EMAIL"
    fi
}

# Check backend health
if ! curl -sf --max-time 10 http://localhost:8080/api/health > /dev/null; then
    alert "Backend Down" "Backend API is not responding. Attempting restart..."
    cd /opt/frs2
    docker compose restart backend
    sleep 10
    
    if curl -sf --max-time 10 http://localhost:8080/api/health > /dev/null; then
        alert "Backend Recovered" "Backend API has been restarted successfully."
    else
        alert "Backend Failed" "Backend API restart failed. Manual intervention required."
    fi
else
    log "Backend health check: OK"
fi

# Check Keycloak health
if ! curl -sf --max-time 10 http://localhost:9090/health/ready > /dev/null; then
    alert "Keycloak Down" "Keycloak is not responding. Attempting restart..."
    cd /opt/frs2
    docker compose restart keycloak
    sleep 15
    
    if curl -sf --max-time 10 http://localhost:9090/health/ready > /dev/null; then
        alert "Keycloak Recovered" "Keycloak has been restarted successfully."
    else
        alert "Keycloak Failed" "Keycloak restart failed. Manual intervention required."
    fi
else
    log "Keycloak health check: OK"
fi

# Check Jetson heartbeat (if accessible from VM)
if ! curl -sf --max-time 10 http://172.18.3.202:8000/health > /dev/null 2>&1; then
    alert "Jetson Unreachable" "Cannot reach Jetson at 172.18.3.202:8000"
else
    log "Jetson health check: OK"
fi

# Check disk space
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 80 ]; then
    alert "Disk Space Warning" "Disk usage at ${DISK_USAGE}%. Consider cleanup."
fi

# Check Docker container status
STOPPED_CONTAINERS=$(docker compose ps -a | grep -c "Exit" || true)
if [ "$STOPPED_CONTAINERS" -gt 0 ]; then
    alert "Container Stopped" "$STOPPED_CONTAINERS container(s) have stopped unexpectedly."
fi

log "Monitoring check completed."
EOF

chmod +x /opt/frs2/monitor.sh

# Test monitor
/opt/frs2/monitor.sh

# View log
tail -20 /var/log/frs2-monitor.log
```

---

### Fix 4.2: Schedule Monitoring

**On VM:**
```bash
# Run health checks every 5 minutes
(crontab -l 2>/dev/null || true; echo "*/5 * * * * /opt/frs2/monitor.sh") | crontab -

# Verify
crontab -l
```

---

### Fix 4.3: Disk Space Monitor

**On VM:**
```bash
cat > /opt/frs2/disk-monitor.sh <<'EOF'
#!/bin/bash
set -euo pipefail

LOG_FILE="/var/log/frs2-disk.log"
ALERT_EMAIL="karthik@motivitylabs.com"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check main disk
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
log "Disk usage: ${DISK_USAGE}%"

if [ "$DISK_USAGE" -gt 85 ]; then
    log "WARNING: Disk usage critical!"
    
    # Show largest directories
    log "Top 10 largest directories in /opt/frs2:"
    du -h /opt/frs2 2>/dev/null | sort -rh | head -10 | tee -a "$LOG_FILE"
    
    # Docker disk usage
    log "Docker disk usage:"
    docker system df | tee -a "$LOG_FILE"
fi

# Check backup directory
BACKUP_SIZE=$(du -sh /var/backups/frs2 2>/dev/null | cut -f1 || echo "0")
log "Backup directory size: $BACKUP_SIZE"

# Check Docker logs
LOG_SIZE=$(docker inspect --format='{{.LogPath}}' $(docker ps -q) 2>/dev/null | xargs -I{} du -sh {} 2>/dev/null | awk '{sum+=$1}END{print sum}' || echo "0")
log "Docker logs total size: ${LOG_SIZE}MB"
EOF

chmod +x /opt/frs2/disk-monitor.sh

# Run daily at 3 AM
(crontab -l 2>/dev/null || true; echo "0 3 * * * /opt/frs2/disk-monitor.sh") | crontab -
```

---

## PHASE 5: DATABASE OPTIMIZATION (No Downtime)
**Time: 30 minutes | Risk: Low | Downtime: 0 minutes**

### Fix 5.1: Add Missing Indexes

**On VM:**
```bash
# Create migration file
cat > /opt/frs2/backend/src/db/migrations/add_performance_indexes.sql <<'EOF'
-- Add missing indexes for performance

-- Audit log for tenant queries
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created
  ON audit_log(tenant_id, created_at DESC);

-- Attendance lookups by date range
CREATE INDEX IF NOT EXISTS idx_attendance_date_range
  ON attendance_record(attendance_date DESC, fk_employee_id);

-- Event lookups by device and timestamp
CREATE INDEX IF NOT EXISTS idx_event_device_timestamp
  ON frs_event(fk_device_id, event_timestamp DESC);

-- Employee lookups by site
CREATE INDEX IF NOT EXISTS idx_employee_site
  ON frs_employee(fk_site_id, employee_code);

-- Add index comments for documentation
COMMENT ON INDEX idx_audit_tenant_created IS 'Optimizes audit log queries by tenant';
COMMENT ON INDEX idx_attendance_date_range IS 'Optimizes attendance date range queries';
COMMENT ON INDEX idx_event_device_timestamp IS 'Optimizes device event history queries';
COMMENT ON INDEX idx_employee_site IS 'Optimizes employee lookups by site';

-- Analyze tables to update statistics
ANALYZE audit_log;
ANALYZE attendance_record;
ANALYZE frs_event;
ANALYZE frs_employee;
EOF

# Apply indexes
docker exec -i attendance-postgres psql -U postgres -d attendance_intelligence < \
  /opt/frs2/backend/src/db/migrations/add_performance_indexes.sql

# Verify indexes created
docker exec attendance-postgres psql -U postgres -d attendance_intelligence -c \
  "\d+ audit_log" | grep idx_
```

---

## PHASE 6: JETSON VERIFICATION (No Downtime)
**Time: 30 minutes | Risk: Low | Downtime: 0 minutes**

### Fix 6.1: Verify Jetson Auto-Restart

**On Jetson (172.18.3.202):**
```bash
# Check systemd service status
systemctl status frs-runner.service

# View service file
systemctl cat frs-runner.service

# Ensure Restart=always is set
sudo systemctl edit --full frs-runner.service
# Add/verify:
#   Restart=always
#   RestartSec=10

# Enable on boot
sudo systemctl enable frs-runner.service

# Test restart
sudo systemctl restart frs-runner.service
sleep 5
systemctl status frs-runner.service

# Check logs
journalctl -u frs-runner.service -n 50 --no-pager
```

---

### Fix 6.2: Add Jetson Disk Monitor

**On Jetson:**
```bash
cat > /home/karthik/disk-monitor.sh <<'EOF'
#!/bin/bash
PHOTOS_DIR="/opt/frs/photos"
MAX_SIZE_GB=50

CURRENT_SIZE=$(du -s $PHOTOS_DIR 2>/dev/null | awk '{print $1/1024/1024}' || echo 0)

if (( $(echo "$CURRENT_SIZE > $MAX_SIZE_GB" | bc -l) )); then
    echo "[$(date)] WARNING: Photos directory is ${CURRENT_SIZE}GB (limit: ${MAX_SIZE_GB}GB)"
    
    # Delete photos older than 90 days
    find $PHOTOS_DIR -name "*.jpg" -mtime +90 -delete
    
    AFTER_SIZE=$(du -sh $PHOTOS_DIR | cut -f1)
    echo "[$(date)] Cleaned up old photos. New size: $AFTER_SIZE"
fi
EOF

chmod +x /home/karthik/disk-monitor.sh

# Schedule daily at 1 AM
(crontab -l 2>/dev/null || true; echo "0 1 * * * /home/karthik/disk-monitor.sh >> /var/log/jetson-disk.log 2>&1") | crontab -
```

---

## VERIFICATION CHECKLIST

After completing all phases, verify:

**On VM:**
```bash
# 1. Check all services running
docker compose ps
# All should show "Up"

# 2. Verify backend health
curl http://localhost:8080/api/health
# Should return: {"status":"healthy",...}

# 3. Check log rotation
docker info | grep -A 3 "Logging Driver"
# Should show max-size: 100m

# 4. Verify backups exist
ls -lh /var/backups/frs2/
# Should show recent backup files

# 5. Check monitoring logs
tail -20 /var/log/frs2-monitor.log
# Should show recent health checks

# 6. Verify cron jobs
crontab -l
# Should show 3 cron jobs: backup, monitor, disk-monitor

# 7. Test external access blocked
# From another machine:
# telnet 172.20.100.222 5432
# Should fail (connection refused)

# 8. Check memory limits
docker stats --no-stream
# Should show MEM LIMIT column
```

**On Jetson:**
```bash
# 1. Verify service running
systemctl status frs-runner.service
# Should be "active (running)"

# 2. Check auto-restart enabled
systemctl is-enabled frs-runner.service
# Should return "enabled"

# 3. Verify disk monitor scheduled
crontab -l
# Should show disk-monitor.sh
```

---

## ROLLBACK PROCEDURES

### If Backend Won't Start After Password Change:
```bash
cd /opt/frs2
mv docker-compose.yml.backup docker-compose.yml
mv backend/.env.backup backend/.env
docker compose up -d backend
```

### If Database Corrupted After Index Addition:
```bash
# Restore from backup
/opt/frs2/restore.sh <backup_date>
```

### If Docker Won't Start After Log Rotation Config:
```bash
sudo rm /etc/docker/daemon.json
sudo systemctl restart docker
```

---

## POST-HARDENING NEXT STEPS

After completing these phases, you'll have addressed the CRITICAL issues. Next priorities:

1. **HTTPS Setup** (Week 2) - Requires nginx + Let's Encrypt certificates
2. **Production Frontend Build** (Week 2) - Replace Vite dev server
3. **PostgreSQL Replication** (Week 3) - For high availability
4. **Centralized Logging** (Week 4) - Loki or ELK stack

Let me know when you're ready for Phase 2 (HTTPS + Production Frontend) and I'll provide those configs.

---

## SUPPORT CONTACTS

**If Something Breaks:**
1. Check logs: `docker compose logs <service>`
2. Check monitoring: `tail -100 /var/log/frs2-monitor.log`
3. Restore from backup: `/opt/frs2/restore.sh`

**Critical Files to Keep:**
- `/opt/frs2/PASSWORDS.txt` (secure this!)
- `/opt/frs2/docker-compose.yml.backup`
- `/var/backups/frs2/` (entire directory)
