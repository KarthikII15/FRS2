-- Migration 005: Create site_device_assignment table
-- Purpose: Track device-to-site assignments with history (one-to-many with history from Question 28)

BEGIN;

CREATE TABLE IF NOT EXISTS site_device_assignment (
    pk_assignment_id SERIAL PRIMARY KEY,
    site_id INTEGER NOT NULL REFERENCES frs_site(pk_site_id) ON DELETE CASCADE,
    device_id INTEGER NOT NULL REFERENCES facility_device(pk_device_id) ON DELETE CASCADE,
    
    -- Assignment details
    device_role VARCHAR(100),                   -- 'entrance', 'exit', 'monitoring', 'vip_area'
    zone_name VARCHAR(100),                     -- 'Main Entrance', 'Parking', 'Lobby'
    
    -- Lifecycle tracking (detailed history from Question 30)
    is_active BOOLEAN DEFAULT TRUE,
    assigned_at TIMESTAMP DEFAULT NOW(),
    assigned_by INTEGER REFERENCES frs_user(pk_user_id),
    unassigned_at TIMESTAMP,
    unassigned_by INTEGER REFERENCES frs_user(pk_user_id),
    unassignment_reason TEXT,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Partial unique index: Only one active assignment per device
CREATE UNIQUE INDEX unique_active_device_assignment 
ON site_device_assignment (device_id) 
WHERE is_active = TRUE;

-- Regular indexes
CREATE INDEX idx_assignment_site ON site_device_assignment(site_id, is_active);
CREATE INDEX idx_assignment_device ON site_device_assignment(device_id);
CREATE INDEX idx_assignment_active ON site_device_assignment(is_active, assigned_at);
CREATE INDEX idx_assignment_dates ON site_device_assignment(assigned_at, unassigned_at);

-- Function to unassign device from previous site before assigning to new site
CREATE OR REPLACE FUNCTION prevent_multiple_active_assignments()
RETURNS TRIGGER AS $$
BEGIN
    -- If inserting a new active assignment, deactivate any existing active assignments for this device
    IF NEW.is_active = TRUE THEN
        UPDATE site_device_assignment
        SET is_active = FALSE,
            unassigned_at = NOW(),
            unassignment_reason = COALESCE(unassignment_reason, 'Reassigned to another site')
        WHERE device_id = NEW.device_id
          AND is_active = TRUE
          AND pk_assignment_id != COALESCE(NEW.pk_assignment_id, 0);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_multiple_active_assignments
    BEFORE INSERT OR UPDATE ON site_device_assignment
    FOR EACH ROW
    EXECUTE FUNCTION prevent_multiple_active_assignments();

-- Migrate existing device-site relationships (if any exist in facility_device table)
-- Assuming you might have a site_id column in facility_device that we're replacing
DO $$
DECLARE
    device_record RECORD;
BEGIN
    -- Check if site_id column exists in facility_device
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'facility_device' AND column_name = 'site_id'
    ) THEN
        -- Migrate existing assignments
        FOR device_record IN 
            SELECT pk_device_id, site_id 
            FROM facility_device 
            WHERE site_id IS NOT NULL
        LOOP
            INSERT INTO site_device_assignment (site_id, device_id, device_role, is_active, assigned_at)
            VALUES (device_record.site_id, device_record.pk_device_id, 'entrance', TRUE, NOW())
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;
END $$;

-- Add comments
COMMENT ON TABLE site_device_assignment IS 'Device-to-site assignment tracking with full history. One device can only be assigned to one site at a time (is_active=true).';
COMMENT ON COLUMN site_device_assignment.is_active IS 'Only one active assignment per device. Historical assignments have is_active=false.';
COMMENT ON COLUMN site_device_assignment.device_role IS 'Device role at this site: entrance, exit, monitoring, vip_area, etc.';
COMMENT ON COLUMN site_device_assignment.zone_name IS 'Physical zone/location name within the site';

COMMIT;