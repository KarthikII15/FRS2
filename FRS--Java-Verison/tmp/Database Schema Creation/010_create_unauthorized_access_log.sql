-- Migration 010: Create unauthorized_access_log table
-- Purpose: Track unauthorized access attempts (3-tier model from Question 32)

BEGIN;

CREATE TABLE IF NOT EXISTS unauthorized_access_log (
    pk_log_id BIGSERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES hr_employee(pk_employee_id),
    site_id INTEGER REFERENCES frs_site(pk_site_id),
    device_id INTEGER REFERENCES facility_device(pk_device_id),
    
    -- Event details
    attempt_timestamp TIMESTAMP DEFAULT NOW(),
    action_taken VARCHAR(50) NOT NULL,         -- 'blocked', 'flagged', 'escalated', 'allowed_override'
    tier_level INTEGER NOT NULL,                -- 1 (first attempt), 2 (repeated), 3 (high-security site)
    
    -- Employee response (Tier 1: block + notify with override option)
    override_requested BOOLEAN DEFAULT FALSE,
    override_reason TEXT,
    override_approved BOOLEAN,
    override_approved_by INTEGER REFERENCES users(pk_user_id),
    override_approved_at TIMESTAMP,
    
    -- Escalation (Tier 2 & 3)
    escalated BOOLEAN DEFAULT FALSE,
    escalated_at TIMESTAMP,
    escalation_recipients TEXT[],              -- Array of email addresses notified
    escalation_acknowledged BOOLEAN DEFAULT FALSE,
    escalation_acknowledged_by INTEGER REFERENCES frs_user(pk_user_id),
    escalation_acknowledged_at TIMESTAMP,
    
    -- Context
    face_image_path TEXT,                      -- Path to captured face image (for investigation)
    confidence_score DECIMAL(10,5),            -- Face recognition confidence (0.0 to 99999.0)
    additional_context JSONB DEFAULT '{}'::JSONB,
    
    -- Resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolved_by INTEGER REFERENCES frs_user(pk_user_id),
    resolution_notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT chk_action_taken CHECK (action_taken IN ('blocked', 'flagged', 'escalated', 'allowed_override', 'blocked_strict')),
    CONSTRAINT chk_tier_level CHECK (tier_level IN (1, 2, 3))
);

-- Indexes
CREATE INDEX idx_unauth_employee ON unauthorized_access_log(employee_id, attempt_timestamp DESC);
CREATE INDEX idx_unauth_site ON unauthorized_access_log(site_id, attempt_timestamp DESC);
CREATE INDEX idx_unauth_device ON unauthorized_access_log(device_id, attempt_timestamp DESC);
CREATE INDEX idx_unauth_timestamp ON unauthorized_access_log(attempt_timestamp DESC);
CREATE INDEX idx_unauth_escalated ON unauthorized_access_log(escalated, escalated_at) WHERE escalated = TRUE;
CREATE INDEX idx_unauth_unresolved ON unauthorized_access_log(resolved, attempt_timestamp) WHERE resolved = FALSE;

-- Function to count recent unauthorized attempts for an employee at a site
CREATE OR REPLACE FUNCTION count_recent_unauthorized_attempts(
    p_employee_id INTEGER,
    p_site_id INTEGER,
    p_days INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
    attempt_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO attempt_count
    FROM unauthorized_access_log
    WHERE employee_id = p_employee_id
      AND site_id = p_site_id
      AND attempt_timestamp > NOW() - (p_days || ' days')::INTERVAL;
    
    RETURN attempt_count;
END;
$$ LANGUAGE plpgsql;

-- Function to determine tier level based on attempt count and site security
CREATE OR REPLACE FUNCTION determine_unauthorized_access_tier(
    p_employee_id INTEGER,
    p_site_id INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    recent_attempts INTEGER;
    escalation_threshold INTEGER;
    site_security_level VARCHAR(50);
BEGIN
    -- Get site security level from config
    SELECT config->>'security_level' INTO site_security_level
    FROM site
    WHERE pk_site_id = p_site_id;
    
    -- High-security sites always use Tier 3 (strict block + immediate escalation)
    IF site_security_level = 'high' OR site_security_level = 'restricted' THEN
        RETURN 3;
    END IF;
    
    -- Count recent attempts
    recent_attempts := count_recent_unauthorized_attempts(p_employee_id, p_site_id, 30);
    
    -- Get escalation threshold from settings
    SELECT COALESCE(setting_value::INTEGER, 3) INTO escalation_threshold
    FROM system_settings
    WHERE setting_key = 'unauthorized_access_escalation_threshold';
    
    -- Determine tier
    IF recent_attempts >= escalation_threshold THEN
        RETURN 2;  -- Tier 2: Repeated attempts -> Escalate
    ELSE
        RETURN 1;  -- Tier 1: First attempt -> Block + Notify + Allow Override
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to log unauthorized access attempt
CREATE OR REPLACE FUNCTION log_unauthorized_access(
    p_employee_id INTEGER,
    p_site_id INTEGER,
    p_device_id INTEGER,
    p_face_image_path TEXT DEFAULT NULL,
    p_confidence_score DECIMAL DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    tier_level INTEGER;
    action_taken VARCHAR(50);
    should_escalate BOOLEAN := FALSE;
    escalation_recipients TEXT[];
    log_id BIGINT;
BEGIN
    -- Determine tier level
    tier_level := determine_unauthorized_access_tier(p_employee_id, p_site_id);
    
    -- Determine action based on tier
    CASE tier_level
        WHEN 1 THEN
            action_taken := 'blocked';  -- Block but allow override request
        WHEN 2 THEN
            action_taken := 'escalated';  -- Block and escalate to admin
            should_escalate := TRUE;
        WHEN 3 THEN
            action_taken := 'blocked_strict';  -- Block without override, immediate escalation
            should_escalate := TRUE;
    END CASE;
    
    -- Get escalation recipients from site config or system settings
    IF should_escalate THEN
        SELECT ARRAY(
            SELECT jsonb_array_elements_text(
                COALESCE(
                    config->'unauthorized_access_policy'->'escalation_recipients',
                    (SELECT setting_value::JSONB FROM system_settings WHERE setting_key = 'device_offline_alert_recipients')
                )
            )
        ) INTO escalation_recipients
        FROM site
        WHERE pk_site_id = p_site_id;
    END IF;
    
    -- Insert log entry
    INSERT INTO unauthorized_access_log (
        employee_id,
        site_id,
        device_id,
        action_taken,
        tier_level,
        escalated,
        escalated_at,
        escalation_recipients,
        face_image_path,
        confidence_score
    ) VALUES (
        p_employee_id,
        p_site_id,
        p_device_id,
        action_taken,
        tier_level,
        should_escalate,
        CASE WHEN should_escalate THEN NOW() ELSE NULL END,
        escalation_recipients,
        p_face_image_path,
        p_confidence_score
    )
    RETURNING pk_log_id INTO log_id;
    
    -- Return result for backend to process (send notifications, etc.)
    RETURN jsonb_build_object(
        'log_id', log_id,
        'tier_level', tier_level,
        'action_taken', action_taken,
        'escalated', should_escalate,
        'escalation_recipients', escalation_recipients,
        'allow_override', CASE WHEN tier_level = 1 THEN TRUE ELSE FALSE END
    );
END;
$$ LANGUAGE plpgsql;

-- Function to approve override request
CREATE OR REPLACE FUNCTION approve_access_override(
    p_log_id BIGINT,
    p_approved_by INTEGER,
    p_approval_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE unauthorized_access_log
    SET override_approved = TRUE,
        override_approved_by = p_approved_by,
        override_approved_at = NOW(),
        resolved = TRUE,
        resolved_at = NOW(),
        resolved_by = p_approved_by,
        resolution_notes = COALESCE(p_approval_notes, 'Override approved - one-time access granted')
    WHERE pk_log_id = p_log_id
      AND tier_level = 1  -- Only Tier 1 allows overrides
      AND override_requested = TRUE;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE unauthorized_access_log IS '3-tier unauthorized access tracking: Tier 1 (block+notify+override), Tier 2 (escalate after threshold), Tier 3 (strict block+immediate escalation for high-security sites)';
COMMENT ON COLUMN unauthorized_access_log.tier_level IS '1=first attempt (allow override), 2=repeated attempts (escalate), 3=high-security site (strict block)';
COMMENT ON COLUMN unauthorized_access_log.action_taken IS 'blocked (can override), flagged (allowed with flag), escalated (admin notified), allowed_override (override approved), blocked_strict (no override)';

COMMIT;