#!/bin/bash
# Quick reference commands for FRS2

# Health check
alias frs-health="docker compose ps && curl -s http://localhost:8080/api/health && curl -s http://localhost:9090/health/ready"

# View logs
alias frs-logs="tail -f ~/FRS_/FRS--Java-Verison/logs/monitor.log"

# Manual backup
alias frs-backup="~/FRS_/FRS--Java-Verison/scripts/backup-local.sh"

# Restart all
alias frs-restart="cd ~/FRS_/FRS--Java-Verison && docker compose restart"

# Check status
alias frs-status="cd ~/FRS_/FRS--Java-Verison && docker compose ps && docker stats --no-stream"

echo "FRS2 Quick Commands Loaded!"
echo "  frs-health  - Check system health"
echo "  frs-logs    - View monitoring logs"
echo "  frs-backup  - Run manual backup"
echo "  frs-restart - Restart all services"
echo "  frs-status  - Check service status"
