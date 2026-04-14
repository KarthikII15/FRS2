-- Migration 009: Create device_command_queue table
-- Purpose: Command queue for sending commands to devices (hybrid API + Kafka from Question 34)

BEGIN;

CREATE TABLE IF NOT EXISTS device_command_queue (
    pk_command_id BIGSERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES facility_device(pk_device_id) ON DELETE CASCADE,
    
    -- Command details
    command_type VARCHAR(50) NOT NULL,          -- 'reboot', 'update_config', 'sync_embeddings', 'remove_employee', 'change_threshold'
    command_payload JSONB DEFAULT '{}'::JSONB,  -- Command-specific parameters
    
    -- Lifecycle
    status VARCHAR(20) DEFAULT 'pending',       -- 'pending', 'sent', 'acknowledged', 'completed', 'failed', 'timeout', 'cancelled'
    priority INTEGER DEFAULT 5,                 -- 1=highest (emergency), 10=lowest (maintenance)
    
    -- Timing
    created_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER REFERENCES frs_user(pk_user_id),
    sent_at TIMESTAMP,
    acknowledged_at TIMESTAMP,
    completed_at TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '1 hour'),  -- Commands expire after 1 hour by default
    
    -- Response from device
    result JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    CONSTRAINT chk_command_status CHECK (status IN ('pending', 'sent', 'acknowledged', 'completed', 'failed', 'timeout', 'cancelled'))
);

-- Indexes
CREATE INDEX idx_command_device ON device_command_queue(device_id, status);
CREATE INDEX idx_command_status ON device_command_queue(status, created_at);
CREATE INDEX idx_command_priority ON device_command_queue(priority, created_at) WHERE status = 'pending';
CREATE INDEX idx_command_expires ON device_command_queue(expires_at) WHERE status IN ('pending', 'sent');

-- Function to get pending commands for a device (called by device on heartbeat)
CREATE OR REPLACE FUNCTION get_pending_commands(p_device_id INTEGER, p_limit INTEGER DEFAULT 5)
RETURNS TABLE (
    command_id BIGINT,
    command_type VARCHAR(50),
    command_payload JSONB,
    priority INTEGER,
    created_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pk_command_id,
        dcq.command_type,
        dcq.command_payload,
        dcq.priority,
        dcq.created_at
    FROM device_command_queue dcq
    WHERE dcq.device_id = p_device_id
      AND dcq.status = 'pending'
      AND (dcq.expires_at IS NULL OR dcq.expires_at > NOW())
    ORDER BY dcq.priority ASC, dcq.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to mark command as sent
CREATE OR REPLACE FUNCTION mark_command_sent(p_command_id BIGINT)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE device_command_queue
    SET status = 'sent',
        sent_at = NOW()
    WHERE pk_command_id = p_command_id
      AND status = 'pending';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to acknowledge command (device received it)
CREATE OR REPLACE FUNCTION acknowledge_command(p_command_id BIGINT)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE device_command_queue
    SET status = 'acknowledged',
        acknowledged_at = NOW()
    WHERE pk_command_id = p_command_id
      AND status = 'sent';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to complete command with result
CREATE OR REPLACE FUNCTION complete_command(
    p_command_id BIGINT,
    p_result JSONB DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_error_message IS NULL THEN
        -- Success
        UPDATE device_command_queue
        SET status = 'completed',
            completed_at = NOW(),
            result = p_result
        WHERE pk_command_id = p_command_id
          AND status IN ('sent', 'acknowledged');
    ELSE
        -- Failure
        UPDATE device_command_queue
        SET status = 'failed',
            completed_at = NOW(),
            error_message = p_error_message,
            retry_count = retry_count + 1
        WHERE pk_command_id = p_command_id
          AND status IN ('sent', 'acknowledged');
        
        -- Check if should retry
        UPDATE device_command_queue
        SET status = 'pending',
            sent_at = NULL,
            acknowledged_at = NULL
        WHERE pk_command_id = p_command_id
          AND status = 'failed'
          AND retry_count < max_retries;
    END IF;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to timeout expired commands (run by scheduled job)
CREATE OR REPLACE FUNCTION timeout_expired_commands()
RETURNS INTEGER AS $$
DECLARE
    timeout_count INTEGER;
BEGIN
    WITH updated AS (
        UPDATE device_command_queue
        SET status = 'timeout',
            completed_at = NOW(),
            error_message = 'Command expired before device could execute'
        WHERE status IN ('pending', 'sent')
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
        RETURNING pk_command_id
    )
    SELECT COUNT(*) INTO timeout_count FROM updated;
    
    RETURN timeout_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger to publish command to Kafka when inserted
CREATE OR REPLACE FUNCTION publish_command_to_kafka()
RETURNS TRIGGER AS $$
DECLARE
    device_code VARCHAR(255);
BEGIN
    -- Get device code
    SELECT external_device_id INTO device_code
    FROM facility_device
    WHERE pk_device_id = NEW.device_id;
    
    -- Note: Actual Kafka publishing happens in application code (Node.js)
    -- This trigger just logs the intent
    -- The backend will listen for INSERT events and publish to Kafka
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_publish_command_to_kafka
    AFTER INSERT ON device_command_queue
    FOR EACH ROW
    WHEN (NEW.status = 'pending')
    EXECUTE FUNCTION publish_command_to_kafka();

-- Add comments
COMMENT ON TABLE device_command_queue IS 'Queue for sending commands to devices via hybrid API+Kafka model. Commands are published to Kafka and tracked here for acknowledgment.';
COMMENT ON COLUMN device_command_queue.command_type IS 'Type of command: reboot, update_config, sync_embeddings, remove_employee, change_threshold, etc.';
COMMENT ON COLUMN device_command_queue.priority IS '1=highest (emergency shutdown), 5=normal, 10=lowest (routine maintenance)';
COMMENT ON COLUMN device_command_queue.status IS 'Lifecycle: pending -> sent -> acknowledged -> completed/failed/timeout';

COMMIT;