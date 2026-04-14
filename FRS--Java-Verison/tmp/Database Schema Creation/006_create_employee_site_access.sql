-- Migration 006: Create employee_site_access table
-- Purpose: Access Control List for employee-site access (from Question 3, 16, 31)
-- Hybrid model: Department/role defaults + individual exceptions (Question 31)

BEGIN;

CREATE TABLE IF NOT EXISTS employee_site_access (
    pk_access_id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES hr_employee(pk_employee_id) ON DELETE CASCADE,
    site_id INTEGER NOT NULL REFERENCES frs_site(pk_site_id) ON DELETE CASCADE,
    
    -- Access details
    access_type VARCHAR(50) DEFAULT 'standard',     -- 'standard', 'temporary', 'restricted', 'vip'
    granted_by VARCHAR(50) NOT NULL,                -- 'department', 'role', 'manual', 'exception'
    
    -- Validity period
    valid_from DATE DEFAULT CURRENT_DATE,
    valid_until DATE,                               -- NULL = indefinite
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    granted_by_user_id INTEGER REFERENCES frs_user(pk_user_id),
    granted_at TIMESTAMP DEFAULT NOW(),
    revoked_at TIMESTAMP,
    revoked_by INTEGER REFERENCES frs_user(pk_user_id),
    revoke_reason TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Partial unique index: Only one active access record per employee-site pair
CREATE UNIQUE INDEX unique_active_employee_site_access 
ON employee_site_access (employee_id, site_id) 
WHERE is_active = TRUE;

-- Regular indexes
CREATE INDEX idx_employee_access ON employee_site_access(employee_id, is_active);
CREATE INDEX idx_site_access ON employee_site_access(site_id, is_active);
CREATE INDEX idx_access_validity ON employee_site_access(valid_from, valid_until);
CREATE INDEX idx_access_granted_by ON employee_site_access(granted_by);
CREATE INDEX idx_access_type ON employee_site_access(access_type);

-- Function to automatically revoke expired access
CREATE OR REPLACE FUNCTION revoke_expired_access()
RETURNS INTEGER AS $$
DECLARE
    revoked_count INTEGER;
BEGIN
    WITH updated AS (
        UPDATE employee_site_access
        SET is_active = FALSE,
            revoked_at = NOW(),
            revoke_reason = 'Access expired'
        WHERE is_active = TRUE
          AND valid_until IS NOT NULL
          AND valid_until < CURRENT_DATE
        RETURNING pk_access_id
    )
    SELECT COUNT(*) INTO revoked_count FROM updated;
    
    RETURN revoked_count;
END;
$$ LANGUAGE plpgsql;

-- This function will be called by a scheduled job (node-cron)

-- Function to grant default site access based on department/role
CREATE OR REPLACE FUNCTION grant_default_site_access(p_employee_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    emp_department VARCHAR(100);
    emp_designation VARCHAR(100);
    site_record RECORD;
    granted_count INTEGER := 0;
BEGIN
    -- Get employee details
    SELECT department, designation INTO emp_department, emp_designation
    FROM hr_employee
    WHERE pk_employee_id = p_employee_id;
    
    -- Grant access to all sites for certain roles (from Question 31 - hybrid model)
    -- Example: Executives get access to all sites
    IF emp_designation ILIKE '%CEO%' OR emp_designation ILIKE '%Director%' OR emp_designation ILIKE '%VP%' THEN
        FOR site_record IN SELECT pk_site_id FROM frs_site WHERE status = 'active'
        LOOP
            INSERT INTO employee_site_access (employee_id, site_id, granted_by, access_type)
            VALUES (p_employee_id, site_record.pk_site_id, 'role', 'standard')
            ON CONFLICT DO NOTHING;
            granted_count := granted_count + 1;
        END LOOP;
    
    -- Grant access based on department
    -- Example: Engineering gets access to all sites, HR gets HQ only
    ELSIF emp_department = 'Engineering' THEN
        FOR site_record IN SELECT pk_site_id FROM frs_site WHERE status = 'active'
        LOOP
            INSERT INTO employee_site_access (employee_id, site_id, granted_by, access_type)
            VALUES (p_employee_id, site_record.pk_site_id, 'department', 'standard')
            ON CONFLICT DO NOTHING;
            granted_count := granted_count + 1;
        END LOOP;
    
    ELSE
        -- Default: Grant access to HQ only for other departments
        INSERT INTO employee_site_access (employee_id, site_id, granted_by, access_type)
        SELECT p_employee_id, pk_site_id, 'department', 'standard'
        FROM site
        WHERE site_code = 'motivity-hq'  -- Adjust this to your HQ site code
        ON CONFLICT DO NOTHING;
        granted_count := 1;
    END IF;
    
    RETURN granted_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-grant default access when employee is created
CREATE OR REPLACE FUNCTION auto_grant_site_access_on_employee_create()
RETURNS TRIGGER AS $$
BEGIN
    -- Only grant if employee is active
    IF NEW.status = 'active' THEN
        PERFORM grant_default_site_access(NEW.pk_employee_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger will be created after testing to avoid affecting existing employees
-- Uncomment when ready:
-- CREATE TRIGGER trigger_auto_grant_site_access
--     AFTER INSERT ON employee
--     FOR EACH ROW
--     EXECUTE FUNCTION auto_grant_site_access_on_employee_create();

-- Grant access to existing employees (run once during migration)
DO $$
DECLARE
    emp_record RECORD;
BEGIN
    FOR emp_record IN SELECT pk_employee_id FROM employee WHERE status = 'active'
    LOOP
        PERFORM grant_default_site_access(emp_record.pk_employee_id);
    END LOOP;
END $$;

-- Add comments
COMMENT ON TABLE employee_site_access IS 'Access Control List: which employees can access which sites. Supports department/role-based defaults and manual exceptions.';
COMMENT ON COLUMN employee_site_access.granted_by IS 'How access was granted: department (auto), role (auto), manual (admin), exception (override)';
COMMENT ON COLUMN employee_site_access.access_type IS 'Type of access: standard, temporary, restricted, vip';
COMMENT ON COLUMN employee_site_access.valid_until IS 'Access expires on this date. NULL means indefinite access.';

COMMIT;