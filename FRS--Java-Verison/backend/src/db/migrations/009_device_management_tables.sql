-- Device Management Tables: Buildings, Floors, Zones, NUG Boxes, Cameras, Telemetry
-- These tables support the physical device hierarchy:
-- Site → Building → Floor → Zone → NUG Box → Camera

CREATE TABLE IF NOT EXISTS frs_building (
  pk_building_id SERIAL PRIMARY KEY,
  fk_site_id     INTEGER,
  name           VARCHAR(100) NOT NULL,
  address        TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS frs_floor (
  pk_floor_id     SERIAL PRIMARY KEY,
  fk_building_id  INTEGER REFERENCES frs_building(pk_building_id) ON DELETE CASCADE,
  floor_number    INTEGER NOT NULL,
  floor_name      VARCHAR(100),
  floor_plan_url  TEXT,
  floor_plan_data JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS frs_zone (
  pk_zone_id     SERIAL PRIMARY KEY,
  fk_floor_id    INTEGER REFERENCES frs_floor(pk_floor_id) ON DELETE CASCADE,
  zone_name      VARCHAR(100) NOT NULL,
  zone_type      VARCHAR(50) DEFAULT 'common',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS frs_nug_box (
  pk_nug_id         SERIAL PRIMARY KEY,
  fk_site_id        INTEGER,
  fk_building_id    INTEGER REFERENCES frs_building(pk_building_id) ON DELETE SET NULL,
  fk_floor_id       INTEGER REFERENCES frs_floor(pk_floor_id) ON DELETE SET NULL,
  fk_zone_id        INTEGER REFERENCES frs_zone(pk_zone_id) ON DELETE SET NULL,
  name              VARCHAR(100) NOT NULL,
  device_code       VARCHAR(100) UNIQUE,
  ip_address        VARCHAR(50),
  port              INTEGER DEFAULT 5000,
  -- Recognition thresholds
  match_threshold   NUMERIC(4,3) DEFAULT 0.38,
  conf_threshold    NUMERIC(4,3) DEFAULT 0.35,
  cooldown_seconds  INTEGER DEFAULT 3,
  x_threshold       INTEGER DEFAULT 25,
  tracking_window   INTEGER DEFAULT 6,
  -- Health / status
  status            VARCHAR(20) DEFAULT 'offline',
  cpu_percent       NUMERIC(5,2),
  memory_used_mb    NUMERIC(10,2),
  memory_total_mb   NUMERIC(10,2),
  gpu_percent       NUMERIC(5,2),
  temperature_c     NUMERIC(5,2),
  disk_used_gb      NUMERIC(10,2),
  uptime_seconds    BIGINT,
  last_heartbeat    TIMESTAMPTZ,
  -- Floor map position
  map_x             NUMERIC(10,4),
  map_y             NUMERIC(10,4),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS frs_camera (
  pk_camera_id         SERIAL PRIMARY KEY,
  fk_nug_id            INTEGER REFERENCES frs_nug_box(pk_nug_id) ON DELETE SET NULL,
  fk_floor_id          INTEGER REFERENCES frs_floor(pk_floor_id) ON DELETE SET NULL,
  fk_zone_id           INTEGER REFERENCES frs_zone(pk_zone_id) ON DELETE SET NULL,
  name                 VARCHAR(100) NOT NULL,
  cam_id               VARCHAR(100) UNIQUE,
  rtsp_url             TEXT,
  ip_address           VARCHAR(50),
  model                VARCHAR(100),
  status               VARCHAR(20) DEFAULT 'offline',
  recognition_accuracy NUMERIC(5,4) DEFAULT 0,
  total_scans          INTEGER DEFAULT 0,
  error_rate           NUMERIC(5,4) DEFAULT 0,
  last_active          TIMESTAMPTZ,
  -- Floor map position
  map_x                NUMERIC(10,4),
  map_y                NUMERIC(10,4),
  map_angle            NUMERIC(6,2) DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS frs_telemetry_history (
  pk_history_id SERIAL PRIMARY KEY,
  fk_nug_id     INTEGER NOT NULL REFERENCES frs_nug_box(pk_nug_id) ON DELETE CASCADE,
  timestamp     TIMESTAMPTZ DEFAULT NOW(),
  cpu           NUMERIC(5,2),
  gpu           NUMERIC(5,2),
  ram           NUMERIC(5,2)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_frs_building_site   ON frs_building(fk_site_id);
CREATE INDEX IF NOT EXISTS idx_frs_floor_building  ON frs_floor(fk_building_id);
CREATE INDEX IF NOT EXISTS idx_frs_zone_floor       ON frs_zone(fk_floor_id);
CREATE INDEX IF NOT EXISTS idx_frs_nug_site         ON frs_nug_box(fk_site_id);
CREATE INDEX IF NOT EXISTS idx_frs_nug_status       ON frs_nug_box(status);
CREATE INDEX IF NOT EXISTS idx_frs_nug_device_code  ON frs_nug_box(device_code);
CREATE INDEX IF NOT EXISTS idx_frs_camera_nug       ON frs_camera(fk_nug_id);
CREATE INDEX IF NOT EXISTS idx_frs_camera_cam_id    ON frs_camera(cam_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_nug_time   ON frs_telemetry_history(fk_nug_id, timestamp DESC);
