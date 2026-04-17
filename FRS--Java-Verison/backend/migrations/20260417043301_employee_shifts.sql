-- Migration: Create employee_shifts table for rotating shift schedules
-- Date: 2026-04-16
-- Phase: 2A - Shift Management

CREATE TABLE IF NOT EXISTS employee_shifts (
  pk_employee_shift_id SERIAL PRIMARY KEY,
  fk_employee_id INT NOT NULL REFERENCES hr_employee(pk_employee_id) ON DELETE CASCADE,
  fk_shift_id INT NOT NULL REFERENCES hr_shift(pk_shift_id) ON DELETE CASCADE,
  
  -- Rotation pattern: 'fixed', 'daily', 'weekly', 'monthly'
  pattern_type VARCHAR(20) NOT NULL DEFAULT 'fixed',
  
  -- For weekly rotation (0=Sunday, 1=Monday, ..., 6=Saturday)
  day_of_week INT CHECK (day_of_week >= 0 AND day_of_week <= 6),
  
  -- For daily/monthly rotation
  effective_date DATE,
  end_date DATE,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(fk_employee_id, fk_shift_id, day_of_week, effective_date)
);

-- Indexes for performance
CREATE INDEX idx_employee_shifts_employee ON employee_shifts(fk_employee_id);
CREATE INDEX idx_employee_shifts_active ON employee_shifts(fk_employee_id, is_active);
CREATE INDEX idx_employee_shifts_date ON employee_shifts(effective_date, end_date);

-- Add break_duration_minutes to hr_shift
ALTER TABLE hr_shift ADD COLUMN IF NOT EXISTS break_duration_minutes INT DEFAULT 0;

-- Comment
COMMENT ON TABLE employee_shifts IS 'Supports rotating shift schedules (daily, weekly, monthly patterns)';
