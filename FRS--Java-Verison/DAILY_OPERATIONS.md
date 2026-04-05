# FRS2 Daily Operations Checklist

## Morning Health Check (5 minutes)
```bash
# 1. Check all services running
docker compose ps

# 2. Check system health
curl http://localhost:8080/api/health
curl http://localhost:9090/health/ready

# 3. Review monitoring log from overnight
tail -50 ~/FRS_/FRS--Java-Verison/logs/monitor.log

# 4. Check disk space
df -h | grep -E "/$"

# 5. Verify last backup
ls -lht ~/FRS_/FRS--Java-Verison/backups/ | head -5
```

## Weekly Tasks

### Monday
- Review full week's monitoring logs
- Check backup sizes and verify growth is normal
- Review any alerts or warnings

### Wednesday  
- Test manual backup: `~/FRS_/FRS--Java-Verison/scripts/backup-local.sh`
- Verify Jetson is still recognizing faces properly
- Check Docker container resource usage: `docker stats --no-stream`

### Friday
- Review week's attendance data for anomalies
- Check database performance
- Plan weekend maintenance if needed

## Monthly Tasks

### First Monday of Month
- Test restore procedure with last week's backup
- Review and clean old backups (script auto-cleans 7+ days)
- Check for system updates
- Review security logs

### Third Monday of Month
- Rotate passwords (if security policy requires)
- Review Keycloak brute force logs
- Check for failed login attempts
- Audit user access

## Emergency Contacts

**System Down:**
1. Check monitoring log
2. Run: `docker compose restart`
3. Check individual service logs: `docker compose logs <service>`

**Database Issues:**
1. Restore from backup: `~/FRS_/FRS--Java-Verison/scripts/restore-local.sh`
2. Check database logs: `docker logs attendance-postgres`

**Jetson Not Responding:**
1. SSH to Jetson: `ssh administrator@172.18.3.202`
2. Check service: `sudo systemctl status frs-runner`
3. Restart: `sudo systemctl restart frs-runner`

## Key File Locations

- Backups: `~/FRS_/FRS--Java-Verison/backups/`
- Logs: `~/FRS_/FRS--Java-Verison/logs/`
- Config: `~/FRS_/FRS--Java-Verison/docker-compose.yml`
- Scripts: `~/FRS_/FRS--Java-Verison/scripts/`

## Monitoring Metrics

Monitor these in logs/monitor.log:
- Backend health checks (should be "OK")
- Keycloak health (should be "OK")
- Database connectivity (should be "OK")
- Disk usage (warning at 80%, critical at 90%)
- Container status (all should be "running")

## Success Criteria

✅ All services "Up" in `docker compose ps`
✅ Backend health returns `{"status":"UP"}`
✅ Keycloak health returns "ready"
✅ Daily backup created at 2 AM
✅ Monitor log shows health checks every 5 min
✅ Disk usage < 80%
✅ No container restarts in last 24h

---

**Keep this checklist handy for daily operations!**
