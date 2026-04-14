-- Migration 002: Enhance site table
-- Purpose: Add configuration, timezone, location fields for multi-site support

BEGIN;

-- Add new columns to existing frs_site table
ALTER TABLE frs_frs_site ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE frs_site ADD COLUMN IF NOT EXISTS country VARCHAR(100);
ALTER TABLE frs_site ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Asia/Dubai';
ALTER TABLE frs_site ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);
ALTER TABLE frs_site ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
ALTER TABLE frs_site ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::JSONB;
ALTER TABLE frs_site ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE frs_site ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES frs_user(pk_user_id);
ALTER TABLE frs_site ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add constraint for status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_site_status'
    ) THEN
        ALTER TABLE frs_site ADD CONSTRAINT chk_site_status 
        CHECK (status IN ('active', 'inactive', 'maintenance'));
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_site_code ON frs_site(site_code);
CREATE INDEX IF NOT EXISTS idx_site_status ON frs_site(status);
CREATE INDEX IF NOT EXISTS idx_site_customer ON frs_site(fk_customer_id);

-- Update existing frs_site with default config (if exists)
UPDATE frs_site 
SET config = '{
  "attendance_rules": {
    "work_hours_start": "09:00",
    "work_hours_end": "18:00",
    "grace_period_minutes": 15,
    "auto_checkout_enabled": true,
    "auto_checkout_time": "20:00"
  },
  "recognition_settings": {
    "match_threshold": 0.38,
    "confidence_threshold": 0.40,
    "cooldown_seconds": 30
  },
  "direction_detection": {
    "enabled": true,
    "entry_direction": "y_increasing",
    "y_threshold_pixels": 45,
    "tracking_window_frames": 4
  },
  "unauthorized_access_policy": {
    "action": "block_with_override",
    "notify_employee": true,
    "allow_override": true,
    "flag_for_review": true,
    "escalation_threshold": 3,
    "escalation_recipients": ["admin@company.com"]
  }
}'::JSONB
WHERE config IS NULL OR config = '{}'::JSONB;

-- Add trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_site_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_site_updated_at ON site;
CREATE TRIGGER trigger_site_updated_at
    BEFORE UPDATE ON site
    FOR EACH ROW
    EXECUTE FUNCTION update_site_updated_at();

-- Add comment
COMMENT ON COLUMN site.config IS 'Site-specific configuration in JSONB format: attendance rules, recognition settings, access policies';
COMMENT ON COLUMN site.timezone IS 'Site timezone for correct attendance timestamps (e.g., Asia/Dubai, Asia/Kolkata)';

COMMIT;