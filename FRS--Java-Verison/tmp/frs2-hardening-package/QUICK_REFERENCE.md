# FRS2 PRODUCTION OPERATIONS QUICK REFERENCE

## 🚀 DEPLOYMENT SUMMARY

**System**: FRS2 Face Recognition Attendance System  
**VM**: 172.20.100.222 (Backend, Frontend, Databases, Keycloak)  
**Jetson**: 172.18.3.202 (Edge AI, Face Recognition)

---

## ⚡ QUICK COMMANDS

### Check System Status
```bash
# On VM - all services
cd /opt/frs2
docker compose ps

# Backend health
curl http://localhost:8080/api/health

# Keycloak health
curl http://localhost:9090/health/ready

# On Jetson - edge service
systemctl status frs-runner
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f keycloak
docker compose logs -f postgres

# Last 50 lines
docker compose logs --tail=50 backend

# Jetson service logs
journalctl -u frs-runner -n 50 --no-pager
```

### Restart Services
```bash
# Restart specific service
docker compose restart backend
docker compose restart keycloak
docker compose restart frontend

# Restart all services
docker compose restart

# Hard reset (down and up)
docker compose down
docker compose up -d
```

### Manual Backup
```bash
# Run backup script
/opt/frs2/backup.sh

# List backups
ls -lh /var/backups/frs2/

# Check last backup
tail -50 /var/backups/frs2/backup.log
```

### Restore Database
```bash
# List available backups
/opt/frs2/restore.sh

# Restore specific backup (example)
/opt/frs2/restore.sh 20260403_020001
```

### Check Monitoring
```bash
# View monitoring log
tail -100 /var/log/frs2-monitor.log

# Watch monitoring in real-time
tail -f /var/log/frs2-monitor.log

# Run manual health check
/opt/frs2/monitor.sh
```

### Check Disk Space
```bash
# Overall disk usage
df -h

# Docker disk usage
docker system df

# Largest directories
du -h /opt/frs2 | sort -rh | head -10

# Backup directory size
du -sh /var/backups/frs2

# Clean up Docker (be careful!)
docker system prune -a --volumes  # ⚠️ Only if disk is full
```

---

## 📊 MONITORING

### Scheduled Tasks (Cron)
```bash
# View cron jobs
crontab -l

# Edit cron jobs
crontab -e

# Cron log (on some systems)
grep CRON /var/log/syslog | tail -20
```

**Active Schedules**:
- Backup: Daily at 2:00 AM (`0 2 * * *`)
- Monitoring: Every 5 minutes (`*/5 * * * *`)

### Check Container Resources
```bash
# Real-time stats
docker stats

# One-time snapshot
docker stats --no-stream

# Specific container
docker stats attendance-backend --no-stream
```

### Database Queries
```bash
# Connect to main database
docker exec -it attendance-postgres psql -U postgres -d attendance_intelligence

# Useful queries:
SELECT COUNT(*) FROM frs_employee;
SELECT COUNT(*) FROM attendance_record;
SELECT COUNT(*) FROM frs_event;

# Check database size
SELECT pg_size_pretty(pg_database_size('attendance_intelligence'));

# Exit psql
\q
```

---

## 🔒 SECURITY

### Update Passwords (After Initial Setup)
```bash
# PostgreSQL password
docker exec -it attendance-postgres psql -U postgres <<EOF
ALTER USER postgres WITH PASSWORD 'new_password_here';
\q
EOF

# Update in backend/.env
nano /opt/frs2/backend/.env
# Change: DB_PASSWORD=new_password_here

# Restart backend
docker compose restart backend
```

### Keycloak Admin
- URL: http://172.20.100.222:9090
- Username: admin
- Password: (see /opt/frs2/PASSWORDS.txt)

### View Secure Files
```bash
# Passwords file (delete after saving to password manager)
cat /opt/frs2/PASSWORDS.txt

# Environment files
cat /opt/frs2/backend/.env
```

---

## 🛠️ TROUBLESHOOTING

### Service Won't Start
```bash
# Check container logs
docker compose logs service_name

# Check if port is in use
sudo netstat -tulpn | grep :8080

# Check if dependent service is running
docker compose ps postgres
```

### Database Connection Issues
```bash
# Check PostgreSQL is accepting connections
docker exec attendance-postgres pg_isready -U postgres

# Check connection from backend
docker compose exec backend nc -zv postgres 5432

# Check database users
docker exec -it attendance-postgres psql -U postgres -c "\du"
```

### Backend Returns 500 Errors
```bash
# Check backend logs
docker compose logs backend --tail=100

# Check database connection
curl http://localhost:8080/api/health

# Restart backend
docker compose restart backend
```

### Keycloak Login Fails
```bash
# Check Keycloak logs
docker compose logs keycloak --tail=100

# Check Keycloak health
curl http://localhost:9090/health/ready

# Restart Keycloak
docker compose restart keycloak
```

### Jetson Not Recognizing Faces
```bash
# On Jetson - check service
systemctl status frs-runner

# Check logs
journalctl -u frs-runner -n 100 --no-pager

# Restart service
sudo systemctl restart frs-runner

# Check camera connection
# (Jetson should log "Camera connected" on startup)

# Check backend connectivity from Jetson
curl http://172.20.100.222:8080/api/health
```

### Disk Full
```bash
# Find largest files
du -h /opt/frs2 | sort -rh | head -20

# Clean Docker cache
docker system prune

# Clean old backups manually
find /var/backups/frs2 -name "*.sql.gz" -mtime +7 -delete

# Clean Jetson photos (if accessible)
find /opt/frs/photos -name "*.jpg" -mtime +90 -delete
```

---

## 🔄 UPDATES & MAINTENANCE

### Update Docker Images
```bash
cd /opt/frs2

# Pull latest images
docker compose pull

# Recreate containers with new images
docker compose up -d

# Remove old images
docker image prune
```

### Update Backend Code
```bash
cd /opt/frs2/backend

# Pull latest code
git pull

# Rebuild and restart
cd /opt/frs2
docker compose build backend
docker compose up -d backend
```

### Update Frontend Code
```bash
cd /opt/frs2/frontend

# Pull latest code
git pull

# Rebuild and restart
cd /opt/frs2
docker compose build frontend
docker compose up -d frontend
```

### Database Migrations
```bash
# Apply new migrations
cd /opt/frs2/backend

# Check pending migrations
docker compose exec backend npm run migrate:status

# Run migrations
docker compose exec backend npm run migrate
```

---

## 📈 PERFORMANCE

### Check Query Performance
```bash
# Enable slow query logging
docker exec -it attendance-postgres psql -U postgres -d attendance_intelligence

# In psql:
ALTER DATABASE attendance_intelligence SET log_min_duration_statement = 1000;
\q

# View slow queries in logs
docker compose logs postgres | grep "duration:"
```

### Check Index Usage
```bash
docker exec -it attendance-postgres psql -U postgres -d attendance_intelligence

# List all indexes
\di

# Check index usage stats
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes 
ORDER BY idx_scan;

\q
```

### Optimize Database
```bash
# Vacuum and analyze
docker exec attendance-postgres psql -U postgres -d attendance_intelligence -c "VACUUM ANALYZE;"

# Check database statistics
docker exec attendance-postgres psql -U postgres -d attendance_intelligence -c "SELECT * FROM pg_stat_database WHERE datname = 'attendance_intelligence';"
```

---

## 🆘 EMERGENCY PROCEDURES

### Complete System Failure
```bash
# 1. Stop everything
cd /opt/frs2
docker compose down

# 2. Check disk space
df -h

# 3. Check Docker daemon
sudo systemctl status docker

# 4. Restart Docker
sudo systemctl restart docker

# 5. Start services
docker compose up -d

# 6. Monitor startup
docker compose logs -f
```

### Restore from Backup (Data Loss)
```bash
# 1. List available backups
/opt/frs2/restore.sh

# 2. Choose backup timestamp
/opt/frs2/restore.sh 20260403_020001

# 3. Follow prompts (will stop services automatically)
```

### Database Corruption
```bash
# 1. Stop backend and keycloak
docker compose stop backend keycloak

# 2. Try PostgreSQL recovery
docker compose restart postgres

# 3. If still corrupted, restore from backup
/opt/frs2/restore.sh <timestamp>
```

---

## 📞 CONTACT & SUPPORT

**For Critical Issues**:
1. Check `/var/log/frs2-monitor.log`
2. Run health check: `/opt/frs2/monitor.sh`
3. Check backup logs: `/var/backups/frs2/backup.log`

**Important File Locations**:
- Configuration: `/opt/frs2/docker-compose.yml`
- Backend env: `/opt/frs2/backend/.env`
- Backups: `/var/backups/frs2/`
- Logs: `/var/log/frs2-monitor.log`
- Passwords: `/opt/frs2/PASSWORDS.txt` (delete after saving!)

**Jetson Locations**:
- Service: `/usr/local/bin/frs_runner`
- Config: `/opt/frs/config.json`
- Photos: `/opt/frs/photos/`
- Service file: `/etc/systemd/system/frs-runner.service`

---

## ✅ DAILY CHECKLIST

**Every Morning**:
```bash
# 1. Check system health
curl http://localhost:8080/api/health

# 2. Review monitoring log
tail -50 /var/log/frs2-monitor.log

# 3. Check disk space
df -h | grep -E "/$"

# 4. Check container status
docker compose ps

# 5. Check last backup
ls -lht /var/backups/frs2/ | head -5
```

**Weekly**:
- Review full monitoring log
- Test restore procedure (in non-production)
- Check for software updates
- Review disk usage trends

**Monthly**:
- Rotate passwords
- Review backup retention policy
- Performance review
- Security audit
