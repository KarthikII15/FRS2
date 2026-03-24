-- Migration: 008_hybrid_attendance_modes.sql

-- 1. Add camera_mode to the devices table (defaulting to MIXED so existing cameras work immediately)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS camera_mode VARCHAR(10) DEFAULT 'MIXED';

-- 2. Add check_out and duration columns to the attendance record
ALTER TABLE attendance_record ADD COLUMN IF NOT EXISTS check_out TIMESTAMPTZ;
ALTER TABLE attendance_record ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- 3. Enforce the UNIQUE constraint strictly required for our UPSERT logic
-- This guarantees we never get duplicate rows for the same employee on the same day
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_record_emp_date_key') THEN
        ALTER TABLE attendance_record ADD CONSTRAINT attendance_record_emp_date_key UNIQUE (fk_employee_id, attendance_date);
    END IF;
END $$;

-- 4. Seed your existing entrance camera to MIXED mode explicitly
UPDATE devices SET camera_mode = 'MIXED' WHERE device_code = 'entrance-cam-01';
