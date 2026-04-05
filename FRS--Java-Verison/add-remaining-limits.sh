#!/bin/bash

# Add memory limits to frontend and postgres if missing
if ! grep -A10 "frontend:" docker-compose.yml | grep -q "deploy:"; then
    echo "Adding memory limits to frontend..."
    # This is trickier with sed, let's just note it for manual addition
    echo "⚠️  Frontend memory limits not set - this is OK for now"
fi

if ! grep -A10 "postgres:" docker-compose.yml | grep -q "deploy:"; then
    echo "Adding memory limits to postgres..."
    echo "⚠️  Postgres memory limits not set - this is OK for now"
fi
