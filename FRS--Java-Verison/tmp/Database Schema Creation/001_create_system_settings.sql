-- Migration 001: Create system_settings table
-- Purpose: Store configurable system settings (data retention, monitoring thresholds, etc.)

BEGIN;

CREATE TABLE IF NOT EXISTS system_settings (
    pk_setting_id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,              -- 'data_retention', 'security', 'notifications', 'monitoring'
    setting_key VARCHAR(100) UNIQUE NOT NULL,   -- 'device_status_history_days'
    setting_value TEXT NOT NULL,                -- '180'
    data_type VARCHAR(20) NOT NULL,             -- 'integer', 'boolean', 'json', 'string'
    description TEXT,
    min_value INTEGER,                          -- Validation: minimum allowed value (for integers)
    max_value INTEGER,                          -- Validation: maximum allowed value (for integers)
    default_value TEXT,
    is_editable BOOLEAN DEFAULT TRUE,
    updated_by INTEGER REFERENCES frs_user(pk_user_id),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_settings_category ON system_settings(category);
CREATE INDEX idx_settings_key ON system_settings(setting_key);

-- Seed initial settings
INSERT INTO system_settings (category, setting_key, setting_value, data_type, description, min_value, max_value, default_value) VALUES
-- Data Retention Settings
('data_retention', 'device_status_history_days', '180', 'integer', 'Device status history retention (days)', 7, 3650, '180'),
('data_retention', 'heartbeat_logs_days', '7', 'integer', 'Heartbeat logs retention (days)', 1, 365, '7'),
('data_retention', 'config_change_history_days', '1095', 'integer', 'Config change history retention (days)', 30, 3650, '1095'),
('data_retention', 'face_photos_hours', '24', 'integer', 'Face capture photos retention (hours)', 1, 720, '24'),
('data_retention', 'audit_logs_days', '2555', 'integer', 'Audit logs retention (7 years for compliance)', 365, 3650, '2555'),

-- Monitoring Settings
('monitoring', 'heartbeat_interval_seconds', '15', 'integer', 'Expected heartbeat interval from devices (seconds)', 5, 300, '15'),
('monitoring', 'heartbeat_timeout_seconds', '60', 'integer', 'Mark device offline after missing heartbeats (seconds)', 30, 600, '60'),
('monitoring', 'heartbeat_warning_threshold_seconds', '30', 'integer', 'Warn before marking offline (seconds)', 15, 300, '30'),
('monitoring', 'metrics_retention_detailed_days', '7', 'integer', 'Detailed metrics retention (days)', 1, 30, '7'),
('monitoring', 'metrics_retention_hourly_days', '90', 'integer', 'Hourly aggregate metrics retention (days)', 7, 365, '90'),
('monitoring', 'metrics_retention_daily_days', '365', 'integer', 'Daily aggregate metrics retention (days)', 30, 1825, '365'),

-- Security Settings
('security', 'device_token_validity_days', '365', 'integer', 'Default device JWT token validity (days)', 30, 730, '365'),
('security', 'session_timeout_minutes', '480', 'integer', 'User session timeout (8 hours)', 30, 1440, '480'),
('security', 'max_failed_login_attempts', '5', 'integer', 'Lock account after N failed attempts', 3, 10, '5'),

-- Notification Settings
('notifications', 'device_offline_alert_enabled', 'true', 'boolean', 'Send alerts when devices go offline', NULL, NULL, 'true'),
('notifications', 'device_offline_alert_recipients', '["admin@company.com"]', 'json', 'Email recipients for offline alerts', NULL, NULL, '["admin@company.com"]'),
('notifications', 'unauthorized_access_alert_enabled', 'true', 'boolean', 'Send alerts for unauthorized access attempts', NULL, NULL, 'true'),
('notifications', 'unauthorized_access_escalation_threshold', '3', 'integer', 'Escalate after N unauthorized attempts in 30 days', 1, 10, '3'),

-- Global Device Configuration Defaults
('device_config', 'global_device_config', '{"recognition_settings": {"match_threshold": 0.38, "confidence_threshold": 0.40, "cooldown_seconds": 30}}', 'json', 'Global default device configuration', NULL, NULL, '{}');

-- Add comment
COMMENT ON TABLE system_settings IS 'Configurable system settings for FRS2 - data retention, monitoring, security, notifications';

COMMIT;