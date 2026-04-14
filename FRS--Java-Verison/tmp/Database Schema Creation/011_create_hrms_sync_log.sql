-- Migration 011: Create hrms_sync_log table
-- Purpose: Track HRMS integration sync operations (from Question 36 - all 3 methods)

BEGIN;

CREATE TABLE IF NOT EXISTS hrms_sync_log (
    pk_sync_id BIGSERIAL PRIMARY KEY,
    
    -- Sync details
    sync_type VARCHAR(50) NOT NULL,             -- 'webhook', 'api_pull', 'csv_import', 'manual'
    sync_direction VARCHAR(20) NOT NULL,        -- 'inbound' (HRMS -> FRS2), 'outbound' (FRS2 -> HRMS)
    
    -- Timing
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    duration_seconds INTEGER,
    status VARCHAR(20) NOT NULL,                -- 'running', 'completed', 'failed', 'partial'
    
    -- Statistics
    records_processed INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,
    
    -- Details
    error_details JSONB,                        -- Array of errors: [{"row": 5, "error": "Invalid email", "data": {...}}]
    sync_summary JSONB,                         -- Summary of what was synced
    
    -- Source information
    source_system VARCHAR(100),                 -- 'zoho_people', 'bamboohr', 'csv_upload', 'manual_entry'
    source_identifier TEXT,                     -- Webhook ID, API endpoint, filename, user email
    
    -- Metadata
    triggered_by INTEGER REFERENCES frs_user(pk_user_id),
    triggered_by_system BOOLEAN DEFAULT FALSE,  -- TRUE if automated, FALSE if manual
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT chk_sync_status CHECK (status IN ('running', 'completed', 'failed', 'partial', 'cancelled')),
    CONSTRAINT chk_sync_direction CHECK (sync_direction IN ('inbound', 'outbound'))
);

-- Indexes
CREATE INDEX idx_hrms_sync_time ON hrms_sync_log(started_at DESC);
CREATE INDEX idx_hrms_sync_status ON hrms_sync_log(status, started_at);
CREATE INDEX idx_hrms_sync_type ON hrms_sync_log(sync_type, sync_direction);
CREATE INDEX idx_hrms_sync_source ON hrms_sync_log(source_system, started_at DESC);

-- Function to start a new sync
CREATE OR REPLACE FUNCTION start_hrms_sync(
    p_sync_type VARCHAR(50),
    p_sync_direction VARCHAR(20),
    p_source_system VARCHAR(100) DEFAULT NULL,
    p_source_identifier TEXT DEFAULT NULL,
    p_triggered_by INTEGER DEFAULT NULL,
    p_triggered_by_system BOOLEAN DEFAULT FALSE
)
RETURNS BIGINT AS $$
DECLARE
    sync_id BIGINT;
BEGIN
    INSERT INTO hrms_sync_log (
        sync_type,
        sync_direction,
        status,
        source_system,
        source_identifier,
        triggered_by,
        triggered_by_system
    ) VALUES (
        p_sync_type,
        p_sync_direction,
        'running',
        p_source_system,
        p_source_identifier,
        p_triggered_by,
        p_triggered_by_system
    )
    RETURNING pk_sync_id INTO sync_id;
    
    RETURN sync_id;
END;
$$ LANGUAGE plpgsql;

-- Function to complete a sync
CREATE OR REPLACE FUNCTION complete_hrms_sync(
    p_sync_id BIGINT,
    p_status VARCHAR(20),
    p_records_processed INTEGER DEFAULT 0,
    p_records_created INTEGER DEFAULT 0,
    p_records_updated INTEGER DEFAULT 0,
    p_records_failed INTEGER DEFAULT 0,
    p_records_skipped INTEGER DEFAULT 0,
    p_error_details JSONB DEFAULT NULL,
    p_sync_summary JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    start_time TIMESTAMP;
    duration INTEGER;
BEGIN
    -- Get start time
    SELECT started_at INTO start_time
    FROM hrms_sync_log
    WHERE pk_sync_id = p_sync_id;
    
    -- Calculate duration
    duration := EXTRACT(EPOCH FROM (NOW() - start_time))::INTEGER;
    
    -- Update sync log
    UPDATE hrms_sync_log
    SET completed_at = NOW(),
        duration_seconds = duration,
        status = p_status,
        records_processed = p_records_processed,
        records_created = p_records_created,
        records_updated = p_records_updated,
        records_failed = p_records_failed,
        records_skipped = p_records_skipped,
        error_details = p_error_details,
        sync_summary = p_sync_summary
    WHERE pk_sync_id = p_sync_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get last successful sync timestamp
CREATE OR REPLACE FUNCTION get_last_sync_timestamp(
    p_sync_type VARCHAR(50) DEFAULT NULL,
    p_source_system VARCHAR(100) DEFAULT NULL
)
RETURNS TIMESTAMP AS $$
DECLARE
    last_sync TIMESTAMP;
BEGIN
    SELECT MAX(completed_at) INTO last_sync
    FROM hrms_sync_log
    WHERE status = 'completed'
      AND (p_sync_type IS NULL OR sync_type = p_sync_type)
      AND (p_source_system IS NULL OR source_system = p_source_system);
    
    RETURN last_sync;
END;
$$ LANGUAGE plpgsql;

-- Function to get sync statistics (last 30 days)
CREATE OR REPLACE FUNCTION get_hrms_sync_statistics(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    sync_type VARCHAR(50),
    sync_direction VARCHAR(20),
    total_syncs BIGINT,
    successful_syncs BIGINT,
    failed_syncs BIGINT,
    total_records_processed BIGINT,
    total_records_created BIGINT,
    total_records_updated BIGINT,
    avg_duration_seconds INTEGER,
    last_sync_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        hsl.sync_type,
        hsl.sync_direction,
        COUNT(*) as total_syncs,
        COUNT(*) FILTER (WHERE hsl.status = 'completed') as successful_syncs,
        COUNT(*) FILTER (WHERE hsl.status = 'failed') as failed_syncs,
        SUM(hsl.records_processed) as total_records_processed,
        SUM(hsl.records_created) as total_records_created,
        SUM(hsl.records_updated) as total_records_updated,
        AVG(hsl.duration_seconds)::INTEGER as avg_duration_seconds,
        MAX(hsl.completed_at) as last_sync_at
    FROM hrms_sync_log hsl
    WHERE hsl.started_at > NOW() - (p_days || ' days')::INTERVAL
    GROUP BY hsl.sync_type, hsl.sync_direction
    ORDER BY total_syncs DESC;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate duration on completion
CREATE OR REPLACE FUNCTION update_sync_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
        NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at))::INTEGER;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sync_duration
    BEFORE UPDATE ON hrms_sync_log
    FOR EACH ROW
    EXECUTE FUNCTION update_sync_duration();

-- Add comments
COMMENT ON TABLE hrms_sync_log IS 'Tracks all HRMS integration sync operations: webhooks, API pulls, CSV imports. Supports 3 integration methods (from Question 36).';
COMMENT ON COLUMN hrms_sync_log.sync_type IS 'How the sync happened: webhook (real-time push), api_pull (scheduled fetch), csv_import (manual upload), manual (admin entry)';
COMMENT ON COLUMN hrms_sync_log.sync_direction IS 'inbound (HRMS -> FRS2 employee data), outbound (FRS2 -> HRMS attendance data for payroll)';
COMMENT ON COLUMN hrms_sync_log.error_details IS 'JSONB array of errors encountered during sync: [{"row": 5, "error": "Invalid email", "data": {...}}]';

COMMIT;