#!/bin/bash
echo "🔄 Restarting backend..."

# Stop the container first
docker compose stop backend 2>/dev/null
sleep 2

# Kill anything still on port 8080
PID=$(sudo lsof -ti :8080 2>/dev/null)
if [ -n "$PID" ]; then
  echo "  Killing stale process on port 8080 (PID: $PID)"
  sudo kill -9 $PID 2>/dev/null
  sleep 3
fi

# Start fresh
docker compose up -d backend
sleep 10

# Verify
STATUS=$(curl -s --max-time 5 http://172.20.100.222:8080/api/health | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
if [ "$STATUS" = "UP" ]; then
  echo "✅ Backend UP"
else
  echo "⚠ Still starting — run: docker compose logs --tail=5 backend"
fi
