-- Migration 008: Create device_status_history table
-- Purpose: Track all device status transitions (for Question 28 - detailed history)

BEGIN;

CREATE TABLE IF NOT EXISTS device_status_history (
    pk_history_id BIGSERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES facility_device(pk_device_id) ON DELETE CASCADE,
    
    -- State transition
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    transition_reason VARCHAR(255),             -- 'heartbeat_timeout', 'manual_reboot', 'provisioned', 'admin_action'
    
    -- Metadata
    changed_by INTEGER REFERENCES frs_user(pk_user_id),  -- NULL if system-triggered
    changed_at TIMESTAMP DEFAULT NOW(),
    duration_seconds INTEGER,                   -- How long device was in old_status
    
    -- Context (additional details about the transition)
    additional_data JSONB DEFAULT '{}'::JSONB
);

-- Indexes
CREATE INDEX idx_status_history_device ON device_status_history(device_id, changed_at DESC);
CREATE INDEX idx_status_history_time ON device_status_history(changed_at DESC);
CREATE INDEX idx_status_history_transition ON device_status_history(old_status, new_status);

-- Trigger to automatically log status changes
CREATE OR REPLACE FUNCTION log_device_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO device_status_history (
            device_id,
            old_status,
            new_status,
            transition_reason,
            duration_seconds,
            additional_data
        ) VALUES (
            NEW.pk_device_id,
            OLD.status,
            NEW.status,
            COALESCE(NEW.notes, 'system_triggered'),  -- Use notes field if available
            EXTRACT(EPOCH FROM (NOW() - COALESCE(OLD.updated_at, NOW())))::INTEGER,
            jsonb_build_object(
                'ip_address', NEW.ip_address,
                'last_heartbeat', NEW.last_heartbeat,
                'offline_since', NEW.offline_since
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_status_change
    AFTER UPDATE ON facility_device
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION log_device_status_change();

-- Function to get device status timeline
CREATE OR REPLACE FUNCTION get_device_status_timeline(
    p_device_id INTEGER,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    changed_at TIMESTAMP,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    duration_hours DECIMAL,
    transition_reason VARCHAR(255)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dsh.changed_at,
        dsh.old_status,
        dsh.new_status,
        ROUND((dsh.duration_seconds / 3600.0)::NUMERIC, 2) as duration_hours,
        dsh.transition_reason
    FROM device_status_history dsh
    WHERE dsh.device_id = p_device_id
      AND dsh.changed_at > NOW() - (p_days || ' days')::INTERVAL
    ORDER BY dsh.changed_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate device availability percentage
CREATE OR REPLACE FUNCTION calculate_device_availability(
    p_device_id INTEGER,
    p_days INTEGER DEFAULT 7
)
RETURNS DECIMAL AS $$
DECLARE
    total_seconds BIGINT;
    online_seconds BIGINT;
    availability_pct DECIMAL;
BEGIN
    -- Total time period in seconds
    total_seconds := p_days * 24 * 3600;
    
    -- Calculate time spent in 'active' status
    WITH status_periods AS (
        SELECT 
            new_status,
            changed_at,
            LEAD(changed_at, 1, NOW()) OVER (ORDER BY changed_at) as next_change,
            EXTRACT(EPOCH FROM (
                LEAD(changed_at, 1, NOW()) OVER (ORDER BY changed_at) - changed_at
            ))::BIGINT as period_seconds
        FROM device_status_history
        WHERE device_id = p_device_id
          AND changed_at > NOW() - (p_days || ' days')::INTERVAL
    )
    SELECT COALESCE(SUM(period_seconds), 0) INTO online_seconds
    FROM status_periods
    WHERE new_status = 'active';
    
    -- Calculate availability percentage
    IF total_seconds > 0 THEN
        availability_pct := (online_seconds::DECIMAL / total_seconds::DECIMAL) * 100;
    ELSE
        availability_pct := 0;
    END IF;
    
    RETURN ROUND(availability_pct, 2);
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE device_status_history IS 'Complete audit trail of device status transitions. Retention: 6 months (configurable).';
COMMENT ON COLUMN device_status_history.transition_reason IS 'Why the status changed: heartbeat_timeout, manual_reboot, admin_action, provisioned, etc.';
COMMENT ON COLUMN device_status_history.duration_seconds IS 'How long the device spent in the previous status';

COMMIT;