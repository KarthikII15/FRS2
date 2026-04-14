-- Migration 003: Create device_type reference table
-- Purpose: Define device types (Jetson, cameras, etc.) with capabilities

BEGIN;

CREATE TABLE IF NOT EXISTS device_type (
    pk_device_type_id SERIAL PRIMARY KEY,
    type_code VARCHAR(50) UNIQUE NOT NULL,      -- 'jetson_orin_nx', 'hikvision_camera'
    type_name VARCHAR(100) NOT NULL,            -- 'Jetson Orin NX', 'Hikvision IP Camera'
    category VARCHAR(50) NOT NULL,              -- 'edge_processor', 'camera', 'controller'
    manufacturer VARCHAR(100),
    model VARCHAR(100),
    capabilities JSONB DEFAULT '[]'::JSONB,     -- ["face_recognition", "direction_detection", "tracking"]
    default_config JSONB DEFAULT '{}'::JSONB,   -- Default configuration for this device type
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_device_type_code ON device_type(type_code);
CREATE INDEX idx_device_type_category ON device_type(category);

-- Seed initial device types
INSERT INTO device_type (type_code, type_name, category, manufacturer, model, capabilities, default_config) VALUES
(
    'jetson_orin_nx', 
    'Jetson Orin NX', 
    'edge_processor', 
    'NVIDIA', 
    'Orin NX',
    '["face_recognition", "direction_detection", "tracking", "multi_stream"]'::JSONB,
    '{
        "processing_config": {
            "fps_target": 15,
            "max_parallel_streams": 2
        },
        "health_monitoring": {
            "heartbeat_interval_seconds": 15,
            "timeout_threshold_seconds": 60,
            "metrics_enabled": true
        }
    }'::JSONB
),
(
    'jetson_xavier_nx',
    'Jetson Xavier NX',
    'edge_processor',
    'NVIDIA',
    'Xavier NX',
    '["face_recognition", "direction_detection", "tracking"]'::JSONB,
    '{
        "processing_config": {
            "fps_target": 12,
            "max_parallel_streams": 1
        }
    }'::JSONB
),
(
    'hikvision_camera', 
    'Hikvision IP Camera', 
    'camera', 
    'Hikvision', 
    'DS-2CD2xxx',
    '["rtsp_stream", "h264_encoding", "poe", "night_vision"]'::JSONB,
    '{
        "rtsp_config": {
            "port": 554,
            "stream_path": "/h264",
            "encoding": "h264"
        },
        "video_settings": {
            "resolution": "1920x1080",
            "fps": 15
        }
    }'::JSONB
),
(
    'dahua_camera',
    'Dahua IP Camera',
    'camera',
    'Dahua',
    'IPC-HFW',
    '["rtsp_stream", "h265_encoding", "poe", "night_vision"]'::JSONB,
    '{
        "rtsp_config": {
            "port": 554,
            "stream_path": "/cam/realmonitor",
            "encoding": "h265"
        }
    }'::JSONB
),
(
    'generic_onvif_camera',
    'Generic ONVIF Camera',
    'camera',
    'Generic',
    'ONVIF Compatible',
    '["rtsp_stream", "onvif_protocol"]'::JSONB,
    '{
        "rtsp_config": {
            "port": 554,
            "onvif_enabled": true
        }
    }'::JSONB
);

-- Add trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_device_type_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_device_type_updated_at
    BEFORE UPDATE ON device_type
    FOR EACH ROW
    EXECUTE FUNCTION update_device_type_updated_at();

-- Add comments
COMMENT ON TABLE device_type IS 'Reference table for device types with capabilities and default configurations';
COMMENT ON COLUMN device_type.capabilities IS 'Array of device capabilities (e.g., face_recognition, tracking)';
COMMENT ON COLUMN device_type.default_config IS 'Default JSONB configuration for devices of this type';

COMMIT;