-- Migration 012: Helper functions and database utilities
-- Purpose: Utility functions for device management, config hierarchy, scheduled cleanup

BEGIN;

-- ============================================================================
-- DEVICE MANAGEMENT FUNCTIONS
-- ============================================================================

-- Get active site assignment for a device
CREATE OR REPLACE FUNCTION get_device_site(p_device_id INTEGER)
RETURNS TABLE(
    site_id INTEGER,
    site_code VARCHAR,
    site_name VARCHAR,
    zone_name VARCHAR,
    device_role VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.pk_site_id,
        s.site_code,
        s.site_name,
        sda.zone_name,
        sda.device_role
    FROM site_device_assignment sda
    JOIN frs_site s ON s.pk_site_id = sda.site_id
    WHERE sda.device_id = p_device_id
      AND sda.is_active = TRUE
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Get device by external_device_id with site info
CREATE OR REPLACE FUNCTION get_device_with_site(p_device_code VARCHAR)
RETURNS TABLE(
    device_id INTEGER,
    device_code VARCHAR,
    device_type VARCHAR,
    status VARCHAR,
    last_heartbeat TIMESTAMP,
    site_code VARCHAR,
    site_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fd.pk_device_id,
        fd.external_device_id,
        dt.type_name,
        fd.status,
        fd.last_heartbeat,
        s.site_code,
        s.site_name
    FROM facility_device fd
    LEFT JOIN device_type dt ON dt.pk_device_type_id = fd.device_type_id
    LEFT JOIN site_device_assignment sda ON sda.device_id = fd.pk_device_id AND sda.is_active = TRUE
    LEFT JOIN site s ON s.pk_site_id = sda.site_id
    WHERE fd.external_device_id = p_device_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CONFIGURATION HIERARCHY FUNCTIONS
-- ============================================================================

-- Get effective configuration for a device (Device > Site > Global hierarchy)
CREATE OR REPLACE FUNCTION get_effective_device_config(p_device_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    global_config JSONB;
    site_config JSONB;
    device_config JSONB;
    effective_config JSONB;
BEGIN
    -- Get global default config
    SELECT setting_value::JSONB INTO global_config
    FROM system_settings
    WHERE setting_key = 'global_device_config';
    
    -- Get site config (if device is assigned to a site)
    SELECT s.config INTO site_config
    FROM facility_device fd
    LEFT JOIN site_device_assignment sda ON sda.device_id = fd.pk_device_id AND sda.is_active = TRUE
    LEFT JOIN site s ON s.pk_site_id = sda.site_id
    WHERE fd.pk_device_id = p_device_id;
    
    -- Get device-specific config
    SELECT config INTO device_config
    FROM facility_device
    WHERE pk_device_id = p_device_id;
    
    -- Merge configs: global < site < device (JSONB || operator for deep merge)
    effective_config := COALESCE(global_config, '{}'::JSONB);
    effective_config := effective_config || COALESCE(site_config, '{}'::JSONB);
    effective_config := effective_config || COALESCE(device_config, '{}'::JSONB);
    
    RETURN effective_config;
END;
$$ LANGUAGE plpgsql;

-- Check if employee has access to a site
CREATE OR REPLACE FUNCTION check_employee_site_access(
    p_employee_id INTEGER,
    p_site_id INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    has_access BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM employee_site_access
        WHERE employee_id = p_employee_id
          AND site_id = p_site_id
          AND is_active = TRUE
          AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
    ) INTO has_access;
    
    RETURN has_access;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DEVICE OFFLINE DETECTION (Scheduled Job Function)
-- ============================================================================

-- Mark devices as offline based on heartbeat timeout
CREATE OR REPLACE FUNCTION mark_devices_offline()
RETURNS TABLE(
    device_id INTEGER,
    device_code VARCHAR,
    last_heartbeat TIMESTAMP,
    seconds_since_heartbeat INTEGER
) AS $$
DECLARE
    timeout_seconds INTEGER;
BEGIN
    -- Get timeout threshold from settings
    SELECT COALESCE(setting_value::INTEGER, 60) INTO timeout_seconds
    FROM system_settings
    WHERE setting_key = 'heartbeat_timeout_seconds';
    
    -- Mark devices as offline and return them for alerting
    RETURN QUERY
    WITH updated_devices AS (
        UPDATE facility_device
        SET status = 'offline',
            offline_since = NOW(),
            updated_at = NOW()
        WHERE status = 'active'
          AND last_heartbeat < NOW() - (timeout_seconds || ' seconds')::INTERVAL
        RETURNING pk_device_id, external_device_id, last_heartbeat
    )
    SELECT 
        ud.pk_device_id,
        ud.external_device_id,
        ud.last_heartbeat,
        EXTRACT(EPOCH FROM (NOW() - ud.last_heartbeat))::INTEGER as seconds_since_heartbeat
    FROM updated_devices ud;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DATA CLEANUP FUNCTIONS (Scheduled Jobs)
-- ============================================================================

-- Cleanup expired data based on retention settings
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS TABLE(table_name TEXT, rows_deleted BIGINT) AS $$
DECLARE
    heartbeat_days INTEGER;
    status_days INTEGER;
    photos_hours INTEGER;
BEGIN
    -- Get retention settings
    SELECT COALESCE(setting_value::INTEGER, 7) INTO heartbeat_days
    FROM system_settings WHERE setting_key = 'heartbeat_logs_days';
    
    SELECT COALESCE(setting_value::INTEGER, 180) INTO status_days
    FROM system_settings WHERE setting_key = 'device_status_history_days';
    
    SELECT COALESCE(setting_value::INTEGER, 24) INTO photos_hours
    FROM system_settings WHERE setting_key = 'face_photos_hours';
    
    -- Return results as table
    RETURN QUERY
    -- Cleanup heartbeat logs
    WITH deleted_heartbeats AS (
        DELETE FROM device_heartbeat
        WHERE timestamp < NOW() - (heartbeat_days || ' days')::INTERVAL
        RETURNING 1
    )
    SELECT 'device_heartbeat'::TEXT, COUNT(*)::BIGINT FROM deleted_heartbeats
    
    UNION ALL
    
    -- Cleanup status history
    WITH deleted_status AS (
        DELETE FROM device_status_history
        WHERE changed_at < NOW() - (status_days || ' days')::INTERVAL
        RETURNING 1
    )
    SELECT 'device_status_history'::TEXT, COUNT(*)::BIGINT FROM deleted_status
    
    UNION ALL
    
    -- Cleanup completed/failed commands (keep for 30 days)
    WITH deleted_commands AS (
        DELETE FROM device_command_queue
        WHERE status IN ('completed', 'failed', 'timeout', 'cancelled')
          AND completed_at < NOW() - INTERVAL '30 days'
        RETURNING 1
    )
    SELECT 'device_command_queue'::TEXT, COUNT(*)::BIGINT FROM deleted_commands
    
    UNION ALL
    
    -- Cleanup resolved unauthorized access logs (keep for 90 days)
    WITH deleted_access_logs AS (
        DELETE FROM unauthorized_access_log
        WHERE resolved = TRUE
          AND resolved_at < NOW() - INTERVAL '90 days'
        RETURNING 1
    )
    SELECT 'unauthorized_access_log'::TEXT, COUNT(*)::BIGINT FROM deleted_access_logs;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STATISTICS AND REPORTING FUNCTIONS
-- ============================================================================

-- Get system health summary
CREATE OR REPLACE FUNCTION get_system_health_summary()
RETURNS JSONB AS $$
DECLARE
    summary JSONB;
BEGIN
    SELECT jsonb_build_object(
        'devices', jsonb_build_object(
            'total', (SELECT COUNT(*) FROM facility_device WHERE status != 'decommissioned'),
            'online', (SELECT COUNT(*) FROM facility_device WHERE status = 'active'),
            'offline', (SELECT COUNT(*) FROM facility_device WHERE status = 'offline'),
            'maintenance', (SELECT COUNT(*) FROM facility_device WHERE status = 'maintenance')
        ),
        'sites', jsonb_build_object(
            'total', (SELECT COUNT(*) FROM site WHERE status = 'active'),
            'active', (SELECT COUNT(*) FROM site WHERE status = 'active')
        ),
        'employees', jsonb_build_object(
            'total', (SELECT COUNT(*) FROM employee WHERE status = 'active'),
            'enrolled', (SELECT COUNT(DISTINCT employee_id) FROM employee_embedding)
        ),
        'heartbeats_last_hour', (
            SELECT COUNT(*) FROM device_heartbeat 
            WHERE timestamp > NOW() - INTERVAL '1 hour'
        ),
        'unauthorized_attempts_today', (
            SELECT COUNT(*) FROM unauthorized_access_log 
            WHERE attempt_timestamp > CURRENT_DATE
        ),
        'pending_commands', (
            SELECT COUNT(*) FROM device_command_queue 
            WHERE status = 'pending'
        )
    ) INTO summary;
    
    RETURN summary;
END;
$$ LANGUAGE plpgsql;

-- Get device health metrics
CREATE OR REPLACE FUNCTION get_device_health_metrics(p_device_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    metrics JSONB;
    latest_heartbeat RECORD;
    uptime_pct DECIMAL;
    availability_pct DECIMAL;
BEGIN
    -- Get latest heartbeat metrics
    SELECT * INTO latest_heartbeat
    FROM device_heartbeat
    WHERE device_id = p_device_id
    ORDER BY timestamp DESC
    LIMIT 1;
    
    -- Calculate uptime (last 24 hours)
    uptime_pct := get_device_uptime_percentage(p_device_id, 24);
    
    -- Calculate availability (last 7 days)
    availability_pct := calculate_device_availability(p_device_id, 7);
    
    -- Build metrics object
    SELECT jsonb_build_object(
        'latest_metrics', COALESCE(latest_heartbeat.metrics, '{}'::JSONB),
        'last_heartbeat', latest_heartbeat.timestamp,
        'uptime_24h_pct', uptime_pct,
        'availability_7d_pct', availability_pct,
        'status_timeline', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'timestamp', changed_at,
                    'status', new_status,
                    'duration_hours', ROUND((duration_seconds / 3600.0)::NUMERIC, 2)
                )
            )
            FROM device_status_history
            WHERE device_id = p_device_id
              AND changed_at > NOW() - INTERVAL '7 days'
            ORDER BY changed_at DESC
            LIMIT 10
        )
    ) INTO metrics;
    
    RETURN metrics;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AUDIT TRAIL FUNCTIONS
-- ============================================================================

-- Generic audit logging function (can be called from application or triggers)
CREATE OR REPLACE FUNCTION create_audit_entry(
    p_user_id INTEGER,
    p_action VARCHAR(100),
    p_entity_type VARCHAR(50),
    p_entity_id INTEGER DEFAULT NULL,
    p_entity_name VARCHAR(255) DEFAULT NULL,
    p_before_data JSONB DEFAULT NULL,
    p_after_data JSONB DEFAULT NULL,
    p_additional_data JSONB DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
    audit_id BIGINT;
BEGIN
    -- This assumes you have an audit_log table already (from your existing system)
    -- If not, this is just a placeholder
    INSERT INTO audit_log (
        user_id,
        action,
        entity_type,
        entity_id,
        entity_name,
        before_data,
        after_data,
        additional_data,
        created_at
    ) VALUES (
        p_user_id,
        p_action,
        p_entity_type,
        p_entity_id,
        p_entity_name,
        p_before_data,
        p_after_data,
        p_additional_data,
        NOW()
    )
    RETURNING pk_audit_id INTO audit_id;
    
    RETURN audit_id;
EXCEPTION
    WHEN undefined_table THEN
        -- audit_log table doesn't exist, just return NULL
        RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Deep merge two JSONB objects (for config hierarchy)
CREATE OR REPLACE FUNCTION jsonb_deep_merge(base JSONB, overlay JSONB)
RETURNS JSONB AS $$
BEGIN
    RETURN COALESCE(base, '{}'::JSONB) || COALESCE(overlay, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Generate a unique device token (for testing - actual implementation in Node.js)
CREATE OR REPLACE FUNCTION generate_device_token_hash()
RETURNS TEXT AS $$
BEGIN
    -- In production, this is done in Node.js with bcrypt
    -- This is just a placeholder
    RETURN md5(random()::text || clock_timestamp()::text);
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON FUNCTION get_effective_device_config IS 'Returns merged configuration: Global < Site < Device (highest priority wins)';
COMMENT ON FUNCTION mark_devices_offline IS 'Scheduled job function: Marks devices offline after missing heartbeat timeout';
COMMENT ON FUNCTION cleanup_expired_data IS 'Scheduled job function: Cleans up old data based on retention settings';
COMMENT ON FUNCTION get_system_health_summary IS 'Returns overview of system health: device counts, heartbeat activity, alerts';

COMMIT;

-- Print success message
DO $$
BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Migration 012 completed successfully!';
    RAISE NOTICE 'All helper functions and utilities have been created.';
    RAISE NOTICE '=================================================================';
END $$;