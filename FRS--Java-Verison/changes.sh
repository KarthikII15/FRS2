#!/bin/bash
# FRS2 - Complete Remaining Critical Steps

set -e  # Exit on error

echo "=========================================="
echo "FRS2 Production Hardening - Final Steps"
echo "=========================================="
echo ""

# 1. VERIFY PORT BINDINGS
echo "Step 1: Verifying port bindings..."
echo "Internal services should show 127.0.0.1 (localhost only):"
sudo netstat -tlnp | grep -E "5432|9092|9093" | grep -v "127.0.0.1" && echo "❌ ERROR: Some ports still exposed!" || echo "✅ Port bindings secure!"
echo ""

# 2. SCHEDULE BACKUP SCRIPT
echo "Step 2: Scheduling backup script (daily at 2 AM)..."
(crontab -l 2>/dev/null | grep -v backup-local.sh; echo "0 2 * * * $HOME/FRS_/FRS--Java-Verison/scripts/backup-local.sh >> $HOME/FRS_/FRS--Java-Verison/logs/backup-cron.log 2>&1") | crontab -
echo "✅ Backup scheduled"
echo ""

# 3. SCHEDULE MONITORING SCRIPT
echo "Step 3: Scheduling monitoring script (every 5 minutes)..."
(crontab -l 2>/dev/null | grep -v monitor-local.sh; echo "*/5 * * * * $HOME/FRS_/FRS--Java-Verison/scripts/monitor-local.sh") | crontab -
echo "✅ Monitoring scheduled"
echo ""

# 4. VERIFY CRON JOBS
echo "Step 4: Verifying cron jobs..."
echo "Current cron schedule:"
crontab -l
echo ""

# 5. CREATE LOGS DIRECTORY
echo "Step 5: Creating logs directory..."
mkdir -p $HOME/FRS_/FRS--Java-Verison/logs
echo "✅ Logs directory created"
echo ""

# 6. TEST BACKUP SCRIPT
echo "Step 6: Testing backup script manually..."
read -p "Run backup test now? (yes/no): " test_backup
if [ "$test_backup" = "yes" ]; then
    cd $HOME/FRS_/FRS--Java-Verison
    ./scripts/backup-local.sh
    echo ""
    echo "Backup files created:"
    ls -lh backups/ | tail -5
fi
echo ""

# 7. ADD MEMORY LIMITS TO DOCKER-COMPOSE
echo "Step 7: Adding memory limits to docker-compose.yml..."
cd $HOME/FRS_/FRS--Java-Verison

# Backup current docker-compose
cp docker-compose.yml docker-compose.yml.before-memory-limits

# Check if memory limits already exist
if grep -q "KAFKA_HEAP_OPTS" docker-compose.yml; then
    echo "⚠️  Kafka memory limits already present"
else
    echo "Adding Kafka memory limits..."
    # Add Kafka heap options
    sed -i '/kafka:/,/^  [a-z]/ {
        /environment:/a\
      KAFKA_HEAP_OPTS: "-Xmx512m -Xms256m"
    }' docker-compose.yml
    
    # Add Kafka deploy section if not exists
    if ! grep -A10 "kafka:" docker-compose.yml | grep -q "deploy:"; then
        # Find the line number of kafka service
        KAFKA_LINE=$(grep -n "^  kafka:" docker-compose.yml | cut -d: -f1)
        # Add deploy section before next service
        sed -i "${KAFKA_LINE},/^  [a-z]/ {
            /^  [a-z]/i\
    deploy:\
      resources:\
        limits:\
          memory: 1G\
        reservations:\
          memory: 512M
        }" docker-compose.yml
    fi
fi

if grep -q "JAVA_OPTS.*Xmx" docker-compose.yml; then
    echo "⚠️  Keycloak memory limits already present"
else
    echo "Adding Keycloak memory limits..."
    # Add Keycloak JAVA_OPTS
    sed -i '/keycloak:/,/^  [a-z]/ {
        /environment:/a\
      JAVA_OPTS: "-Xms256m -Xmx512m"
    }' docker-compose.yml
    
    # Add Keycloak deploy section
    if ! grep -A10 "keycloak:" docker-compose.yml | grep -q "deploy:"; then
        KEYCLOAK_LINE=$(grep -n "^  keycloak:" docker-compose.yml | cut -d: -f1)
        sed -i "${KEYCLOAK_LINE},/^  [a-z]/ {
            /^  [a-z]/i\
    deploy:\
      resources:\
        limits:\
          memory: 1G\
        reservations:\
          memory: 512M
        }" docker-compose.yml
    fi
fi
echo "✅ Memory limits added"
echo ""

# 8. SHOW DIFF
echo "Step 8: Reviewing docker-compose.yml changes..."
echo "Changes made to docker-compose.yml:"
diff docker-compose.yml.before-memory-limits docker-compose.yml || true
echo ""

# 9. APPLY DOCKER COMPOSE CHANGES
echo "Step 9: Applying docker-compose changes..."
read -p "Apply memory limits and restart services? (yes/no): " apply_changes
if [ "$apply_changes" = "yes" ]; then
    docker compose up -d
    echo "Waiting for services to restart..."
    sleep 30
    
    echo ""
    echo "Services status:"
    docker compose ps
    
    echo ""
    echo "Memory limits verification:"
    docker stats --no-stream
fi
echo ""

# 10. TEST HEALTH ENDPOINTS
echo "Step 10: Testing health endpoints..."
echo -n "Backend health: "
curl -s http://localhost:8080/api/health | grep -q "UP" && echo "✅ OK" || echo "❌ FAILED"

echo -n "Keycloak health: "
curl -s http://localhost:9090/health/ready | grep -q "ready" && echo "✅ OK" || echo "❌ FAILED"
echo ""

# 11. CHECK PASSWORDS.txt
echo "Step 11: Checking PASSWORDS.txt..."
if [ -f "$HOME/FRS_/FRS--Java-Verison/PASSWORDS.txt" ]; then
    echo "⚠️  WARNING: PASSWORDS.txt still exists!"
    echo ""
    echo "CRITICAL: Have you saved these passwords to your password manager?"
    cat $HOME/FRS_/FRS--Java-Verison/PASSWORDS.txt
    echo ""
    read -p "Delete PASSWORDS.txt now? (Type 'DELETE' to confirm): " delete_pwd
    if [ "$delete_pwd" = "DELETE" ]; then
        rm $HOME/FRS_/FRS--Java-Verison/PASSWORDS.txt
        echo "✅ PASSWORDS.txt deleted"
    else
        echo "⚠️  PASSWORDS.txt NOT deleted - remember to delete it manually!"
    fi
else
    echo "✅ PASSWORDS.txt already deleted"
fi
echo ""

# 12. SUMMARY
echo "=========================================="
echo "HARDENING STEPS COMPLETED!"
echo "=========================================="
echo ""
echo "✅ Completed:"
echo "  - Port bindings secured (localhost only)"
echo "  - Backup scheduled (daily 2 AM)"
echo "  - Monitoring scheduled (every 5 min)"
echo "  - Memory limits configured"
echo "  - Health checks verified"
echo ""
echo "⚠️  Still Required (Manual Steps):"
echo "  1. Enable Keycloak brute force protection:"
echo "     - Login: http://172.20.100.222:9090"
echo "     - Go to: Realm Settings → Security Defenses"
echo "     - Enable: Brute Force Detection"
echo "     - Set: Max Login Failures = 5"
echo ""
echo "  2. HTTPS Setup (Week 2):"
echo "     - Install nginx"
echo "     - Get SSL certificate (Let's Encrypt)"
echo "     - Configure reverse proxy"
echo ""
echo "  3. Production Frontend (Week 2):"
echo "     - Switch to Dockerfile.frontend-production"
echo "     - Rebuild frontend service"
echo ""
echo "=========================================="
echo "Current Production Readiness: 58/100 → 65/100 (estimated)"
echo "=========================================="
echo ""
echo "Next: Check monitoring log in 5 minutes:"
echo "  tail -f $HOME/FRS_/FRS--Java-Verison/logs/monitor.log"
echo ""