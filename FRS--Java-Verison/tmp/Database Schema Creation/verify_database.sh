#!/bin/bash
# Database Verification Script for Docker
# Checks that all tables and functions were created correctly

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

CONTAINER_NAME="${CONTAINER_NAME:-attendance-postgres}"
DB_NAME="${DB_NAME:-attendance_intelligence}"
DB_USER="${DB_USER:-postgres}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}FRS2 Database Verification${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Function to run query through Docker
run_query() {
    docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "$1" 2>&1
}

# Function to check table exists
check_table() {
    local table_name=$1
    local count=$(run_query "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '$table_name' AND table_schema = 'public';")
    count=$(echo "$count" | xargs)  # Trim whitespace
    
    if [ "$count" -gt 0 ]; then
        echo -e "${GREEN}✓ Table exists: $table_name${NC}"
        return 0
    else
        echo -e "${RED}✗ Table missing: $table_name${NC}"
        return 1
    fi
}

# Function to check function exists
check_function() {
    local function_name=$1
    local count=$(run_query "SELECT COUNT(*) FROM pg_proc WHERE proname = '$function_name' AND pronamespace != 'pg_catalog'::regnamespace;")
    count=$(echo "$count" | xargs)  # Trim whitespace
    
    if [ "$count" -gt 0 ]; then
        echo -e "${GREEN}✓ Function exists: $function_name${NC}"
        return 0
    else
        echo -e "${RED}✗ Function missing: $function_name${NC}"
        return 1
    fi
}

# Check tables
echo -e "${YELLOW}Checking new tables...${NC}"
check_table "system_settings"
check_table "device_type"
check_table "site_device_assignment"
check_table "employee_site_access"
check_table "device_heartbeat"
check_table "device_status_history"
check_table "device_command_queue"
check_table "unauthorized_access_log"
check_table "hrms_sync_log"
echo ""

# Check enhanced tables
echo -e "${YELLOW}Checking enhanced tables...${NC}"
check_table "frs_site"
check_table "facility_device"
echo ""

# Check functions
echo -e "${YELLOW}Checking for key functions...${NC}"
check_function "update_device_on_heartbeat" || true
check_function "log_device_status_change" || true
check_function "get_pending_commands" || true
check_function "get_device_site" || true
echo ""

# Check data
echo -e "${YELLOW}Checking seeded data...${NC}"
device_types=$(run_query "SELECT COUNT(*) FROM device_type;" | xargs)
echo -e "Device types: ${GREEN}$device_types${NC}"

settings_count=$(run_query "SELECT COUNT(*) FROM system_settings;" | xargs)
echo -e "System settings: ${GREEN}$settings_count${NC}"
echo ""

# Show sample data
echo -e "${YELLOW}Sample device types:${NC}"
docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c \
    "SELECT type_code, type_name, category FROM device_type LIMIT 4;"
echo ""

echo -e "${YELLOW}Sample system settings (data_retention):${NC}"
docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c \
    "SELECT setting_key, setting_value, description FROM system_settings WHERE category = 'data_retention' LIMIT 3;"
echo ""

# Check enhanced facility_device columns
echo -e "${YELLOW}Enhanced facility_device columns:${NC}"
device_cols=$(run_query "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'facility_device' AND column_name IN ('device_type_id', 'serial_number', 'mac_address', 'device_secret_hash', 'last_heartbeat', 'replaces_device_id', 'created_by', 'decommissioned_at');" | xargs)
echo -e "Device management columns added: ${GREEN}$device_cols / 8${NC}"
echo ""

# Check enhanced frs_site columns
echo -e "${YELLOW}Enhanced frs_site columns:${NC}"
site_cols=$(run_query "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'frs_site' AND column_name IN ('city', 'country', 'site_config', 'site_status', 'created_by_user_id', 'latitude', 'longitude');" | xargs)
echo -e "Site enhancement columns added: ${GREEN}$site_cols / 7${NC}"
echo ""

# Check index count
echo -e "${YELLOW}Database indexes:${NC}"
index_count=$(run_query "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';" | xargs)
echo -e "Total indexes: ${GREEN}$index_count${NC}"
echo ""

# Check existing devices (sample)
echo -e "${YELLOW}Sample devices in facility_device:${NC}"
docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c \
    "SELECT external_device_id, name, status, last_active FROM facility_device LIMIT 3;"
echo ""

# Summary statistics
echo -e "${YELLOW}Summary Statistics:${NC}"
total_tables=$(run_query "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';" | xargs)
total_functions=$(run_query "SELECT COUNT(*) FROM pg_proc WHERE pronamespace != 'pg_catalog'::regnamespace;" | xargs)
echo -e "Total tables in database: ${GREEN}$total_tables${NC}"
echo -e "Total custom functions: ${GREEN}$total_functions${NC}"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Verification Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
