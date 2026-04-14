-- Migration 007: Create device_heartbeat table
-- Purpose: Time-series data for device health monitoring (from Question 17 - store everything)

BEGIN;

CREATE TABLE IF NOT EXISTS device_heartbeat (
    pk_heartbeat_id BIGSERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES facility_device(pk_device_id) ON DELETE CASCADE,
    
    -- Heartbeat data
    timestamp TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'online',        -- 'online', 'warning', 'error'
    
    -- Device metrics (comprehensive from Question 16 - Option G: All)
    metrics JSONB,
    /* Example metrics structure:
    {
      "system": {
        "cpu_percent": 45.2,
        "memory_percent": 62.1,
        "memory_used_mb": 3200,
        "memory_total_mb": 5120,
        "disk_percent": 38.5,
        "disk_used_gb": 45.2,
        "disk_total_gb": 120,
        "temperature_celsius": 52.3,
        "uptime_seconds": 604800
      },
      "recognition": {
        "faces_detected_last_minute": 3,
        "faces_recognized_last_minute": 2,
        "recognition_success_rate": 0.92,
        "avg_processing_latency_ms": 120,
        "false_positives": 0
      },
      "performance": {
        "frames_processed_last_minute": 900,
        "avg_fps": 14.8,
        "queue_depth": 2,
        "dropped_frames": 3
      },
      "network": {
        "bandwidth_mbps": 5.2,
        "packet_loss_percent": 0.1,
        "latency_ms": 15
      },
      "camera": {
        "stream_active": true,
        "fps_actual": 14.8,
        "frame_drops": 2,
        "connection_quality": "good"
      }
    }
    */
    
    response_time_ms INTEGER,                  -- How long backend took to receive heartbeat
    ip_address INET,                            -- Source IP of heartbeat
    
    -- Retention: Default 7 days (configurable via system_settings)
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast queries (time-series optimized)
CREATE INDEX idx_heartbeat_device_time ON device_heartbeat(device_id, timestamp DESC);
CREATE INDEX idx_heartbeat_timestamp ON device_heartbeat(timestamp DESC);
CREATE INDEX idx_heartbeat_status ON device_heartbeat(status, timestamp DESC);

-- Trigger to auto-update device last_heartbeat and status
CREATE OR REPLACE FUNCTION update_device_on_heartbeat()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE facility_device
    SET 
        last_heartbeat = NEW.timestamp,
        last_active = NEW.timestamp,
        status = CASE 
            -- If device was offline, bring it back online
            WHEN status = 'offline' THEN 'active'
            -- If device was created/registered, mark as active on first heartbeat
            WHEN status IN ('created', 'registered') THEN 'active'
            -- Otherwise keep current status (might be in maintenance)
            ELSE status
        END,
        offline_since = NULL,  -- Clear offline timestamp
        updated_at = NOW()
    WHERE pk_device_id = NEW.device_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_device_on_heartbeat
    AFTER INSERT ON device_heartbeat
    FOR EACH ROW
    EXECUTE FUNCTION update_device_on_heartbeat();

-- Function to get latest metrics for a device
CREATE OR REPLACE FUNCTION get_latest_device_metrics(p_device_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    latest_metrics JSONB;
BEGIN
    SELECT metrics INTO latest_metrics
    FROM device_heartbeat
    WHERE device_id = p_device_id
    ORDER BY timestamp DESC
    LIMIT 1;
    
    RETURN COALESCE(latest_metrics, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql;

-- Function to get device uptime percentage (last 24 hours)
CREATE OR REPLACE FUNCTION get_device_uptime_percentage(p_device_id INTEGER, p_hours INTEGER DEFAULT 24)
RETURNS DECIMAL AS $$
DECLARE
    total_heartbeats INTEGER;
    expected_heartbeats INTEGER;
    heartbeat_interval INTEGER;
    uptime_percentage DECIMAL;
BEGIN
    -- Get heartbeat interval from settings (default 15 seconds)
    SELECT COALESCE(setting_value::INTEGER, 15) INTO heartbeat_interval
    FROM system_settings
    WHERE setting_key = 'heartbeat_interval_seconds';
    
    -- Calculate expected heartbeats
    expected_heartbeats := (p_hours * 3600) / heartbeat_interval;
    
    -- Count actual heartbeats
    SELECT COUNT(*) INTO total_heartbeats
    FROM device_heartbeat
    WHERE device_id = p_device_id
      AND timestamp > NOW() - (p_hours || ' hours')::INTERVAL;
    
    -- Calculate uptime percentage
    IF expected_heartbeats > 0 THEN
        uptime_percentage := (total_heartbeats::DECIMAL / expected_heartbeats::DECIMAL) * 100;
    ELSE
        uptime_percentage := 0;
    END IF;
    
    RETURN ROUND(uptime_percentage, 2);
END;
$$ LANGUAGE plpgsql;

-- Partitioning preparation (optional - for very high volume)
-- Uncomment if you expect millions of heartbeats
-- ALTER TABLE device_heartbeat PARTITION BY RANGE (timestamp);
-- CREATE TABLE device_heartbeat_2026_04 PARTITION OF device_heartbeat
--     FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Add comments
COMMENT ON TABLE device_heartbeat IS 'Time-series heartbeat data from devices. Retention: 7 days (configurable). Contains comprehensive system, recognition, performance, and camera metrics.';
COMMENT ON COLUMN device_heartbeat.metrics IS 'JSONB containing all device metrics: system health, recognition stats, performance, network, camera status';

COMMIT;