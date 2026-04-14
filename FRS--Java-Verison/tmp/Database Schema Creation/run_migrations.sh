#!/bin/bash
# Master Migration Script for FRS2 Device & Site Management
# Runs all migrations in order on PostgreSQL database

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Database connection details
DB_HOST="${DB_HOST:-172.20.100.222}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-attendance_intelligence}"
DB_USER="${DB_USER:-attendance_user}"
DB_PASSWORD="${DB_PASSWORD:-}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}FRS2 Device & Site Management${NC}"
echo -e "${GREEN}Database Migration Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if password is provided
if [ -z "$DB_PASSWORD" ]; then
    echo -e "${YELLOW}Database password not set in environment.${NC}"
    echo -n "Enter database password for user '$DB_USER': "
    read -s DB_PASSWORD
    echo ""
fi

export PGPASSWORD="$DB_PASSWORD"

# Test connection
echo -e "${YELLOW}Testing database connection...${NC}"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT version();" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
else
    echo -e "${RED}✗ Failed to connect to database${NC}"
    exit 1
fi

# Create migration tracking table if it doesn't exist
echo -e "${YELLOW}Creating migration tracking table...${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << EOF
CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP DEFAULT NOW(),
    applied_by VARCHAR(100) DEFAULT CURRENT_USER
);
EOF

echo -e "${GREEN}✓ Migration tracking table ready${NC}"
echo ""

# Function to check if migration has been applied
migration_applied() {
    local migration_name=$1
    local count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT COUNT(*) FROM schema_migrations WHERE migration_name = '$migration_name';")
    [ "$count" -gt 0 ]
}

# Function to apply migration
apply_migration() {
    local migration_file=$1
    local migration_name=$(basename "$migration_file" .sql)
    
    if migration_applied "$migration_name"; then
        echo -e "${YELLOW}⊘ Skipping $migration_name (already applied)${NC}"
        return 0
    fi
    
    echo -e "${YELLOW}→ Applying migration: $migration_name${NC}"
    
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration_file"; then
        # Record successful migration
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
            "INSERT INTO schema_migrations (migration_name) VALUES ('$migration_name');"
        echo -e "${GREEN}✓ Migration $migration_name applied successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Migration $migration_name failed${NC}"
        return 1
    fi
}

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MIGRATION_DIR="$SCRIPT_DIR"

# Array of migration files in order
MIGRATIONS=(
    "001_create_system_settings.sql"
    "002_enhance_site_table.sql"
    "003_create_device_type.sql"
    "004_enhance_facility_device.sql"
    "005_create_site_device_assignment.sql"
    "006_create_employee_site_access.sql"
    "007_create_device_heartbeat.sql"
    "008_create_device_status_history.sql"
    "009_create_device_command_queue.sql"
    "010_create_unauthorized_access_log.sql"
    "011_create_hrms_sync_log.sql"
    "012_helper_functions.sql"
)

# Apply migrations
echo -e "${GREEN}Starting migration process...${NC}"
echo ""

SUCCESS_COUNT=0
SKIP_COUNT=0
FAIL_COUNT=0

for migration in "${MIGRATIONS[@]}"; do
    migration_path="$MIGRATION_DIR/$migration"
    
    if [ ! -f "$migration_path" ]; then
        echo -e "${RED}✗ Migration file not found: $migration${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        continue
    fi
    
    if migration_applied "$(basename "$migration" .sql)"; then
        SKIP_COUNT=$((SKIP_COUNT + 1))
    else
        if apply_migration "$migration_path"; then
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            FAIL_COUNT=$((FAIL_COUNT + 1))
            echo -e "${RED}Migration failed. Stopping here.${NC}"
            break
        fi
    fi
    echo ""
done

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Migration Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Applied:  ${GREEN}$SUCCESS_COUNT${NC}"
echo -e "Skipped:  ${YELLOW}$SKIP_COUNT${NC}"
echo -e "Failed:   ${RED}$FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All migrations completed successfully!${NC}"
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo "1. Verify tables: psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c '\dt'"
    echo "2. Check data: psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c 'SELECT * FROM system_settings;'"
    echo "3. Proceed to Phase 2: Device & Site APIs"
    exit 0
else
    echo -e "${RED}✗ Some migrations failed. Please check the errors above.${NC}"
    exit 1
fi