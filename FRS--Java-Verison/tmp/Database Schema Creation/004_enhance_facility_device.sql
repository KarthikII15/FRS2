-- Migration 004: Enhance facility_device table
-- Purpose: Add device authentication, hardware tracking, replacement linking

BEGIN;

-- Add new columns for device management
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS device_type_id INTEGER REFERENCES device_type(pk_device_type_id);
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS serial_number VARCHAR(255);
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS mac_address VARCHAR(17);
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS hardware_version VARCHAR(50);
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(50);
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS hostname VARCHAR(255);

-- Device authentication
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS device_secret_hash TEXT;
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS token_issued_at TIMESTAMP;
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP;

-- Configuration
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::JSONB;

-- Enhanced status tracking
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP;
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS offline_since TIMESTAMP;

-- Replacement tracking (hybrid model from Question 8)
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS replaces_device_id INTEGER REFERENCES facility_device(pk_device_id);
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS replaced_at TIMESTAMP;
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS replacement_reason TEXT;

-- Metadata
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES frs_user(pk_user_id);
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS decommissioned_at TIMESTAMP;
ALTER TABLE facility_device ADD COLUMN IF NOT EXISTS decommissioned_by INTEGER REFERENCES frs_user(pk_user_id);

-- Update status column to use new state machine values
-- State machine: created -> registered -> active -> offline -> decommissioned
DO $$
BEGIN
    -- Drop old constraint if exists
    ALTER TABLE facility_device DROP CONSTRAINT IF EXISTS chk_device_status;
    
    -- Add new constraint
    ALTER TABLE facility_device ADD CONSTRAINT chk_device_status 
    CHECK (status IN ('created', 'registered', 'active', 'offline', 'maintenance', 'decommissioned'));
END $$;

-- Create unique constraint on external_device_id (required for upsert operations)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_external_device_id'
    ) THEN
        ALTER TABLE facility_device 
        ADD CONSTRAINT unique_external_device_id UNIQUE (external_device_id);
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_device_external_id ON facility_device(external_device_id);
CREATE INDEX IF NOT EXISTS idx_device_status ON facility_device(status);
CREATE INDEX IF NOT EXISTS idx_device_type ON facility_device(device_type_id);
CREATE INDEX IF NOT EXISTS idx_device_last_active ON facility_device(last_active);
CREATE INDEX IF NOT EXISTS idx_device_last_heartbeat ON facility_device(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_device_replaces ON facility_device(replaces_device_id);
CREATE INDEX IF NOT EXISTS idx_device_serial ON facility_device(serial_number);
CREATE INDEX IF NOT EXISTS idx_device_mac ON facility_device(mac_address);

-- Migrate existing devices to have device_type
-- Assume existing devices are Jetson Orin NX (you can adjust this)
UPDATE facility_device 
SET device_type_id = (SELECT pk_device_type_id FROM device_type WHERE type_code = 'jetson_orin_nx')
WHERE device_type_id IS NULL;

-- Set default config for devices without config
UPDATE facility_device
SET config = '{}'::JSONB
WHERE config IS NULL;

-- Add trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_facility_device_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_facility_device_updated_at ON facility_device;
CREATE TRIGGER trigger_facility_device_updated_at
    BEFORE UPDATE ON facility_device
    FOR EACH ROW
    EXECUTE FUNCTION update_facility_device_updated_at();

-- Add comments
COMMENT ON COLUMN facility_device.external_device_id IS 'Logical device identifier (follows location/role, not hardware)';
COMMENT ON COLUMN facility_device.serial_number IS 'Physical hardware serial number';
COMMENT ON COLUMN facility_device.device_secret_hash IS 'Bcrypt hash of device-specific JWT secret (per-device authentication)';
COMMENT ON COLUMN facility_device.replaces_device_id IS 'Links to previous hardware for replacement tracking (hybrid model)';
COMMENT ON COLUMN facility_device.config IS 'Device-specific configuration overrides (highest priority in hierarchy)';

COMMIT;