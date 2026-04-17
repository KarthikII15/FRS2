-- Migration: Create hr_roster table for manual shift assignments
-- Date: 2026-04-17
-- Phase: 2A - Shift Management (Manual Roster Overrides)

CREATE TABLE IF NOT EXISTS hr_roster (
  pk_roster_id SERIAL PRIMARY KEY,
  fk_employee_id INT NOT NULL REFERENCES hr_employee(pk_employee_id) ON DELETE CASCADE,
  fk_shift_id INT NOT NULL REFERENCES hr_shift(pk_shift_id) ON DELETE CASCADE,
  roster_date DATE NOT NULL,
  
  -- Recurring support
  is_recurring BOOLEAN DEFAULT false,
  recur_day_of_week INT CHECK (recur_day_of_week >= 0 AND recur_day_of_week <= 6),
  
  -- Shift swap support
  swapped_with INT REFERENCES hr_employee(pk_employee_id),
  swap_approved BOOLEAN DEFAULT false,
  swap_approved_by INT REFERENCES frs_user(pk_user_id),
  swap_approved_at TIMESTAMP,
  
  -- Status
  status VARCHAR(20) DEFAULT 'scheduled',  -- 'scheduled', 'completed', 'cancelled', 'no_show'
  
  -- Notes
  notes TEXT,
  
  -- Audit
  created_by INT REFERENCES frs_user(pk_user_id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure no duplicate assignments for same date
  UNIQUE(fk_employee_id, roster_date)
);

-- Indexes
CREATE INDEX idx_roster_employee ON hr_roster(fk_employee_id);
CREATE INDEX idx_roster_date ON hr_roster(roster_date);
CREATE INDEX idx_roster_shift ON hr_roster(fk_shift_id);
CREATE INDEX idx_roster_active ON hr_roster(fk_employee_id, roster_date, status);

-- Comment
COMMENT ON TABLE hr_roster IS 'Manual shift roster assignments and overrides - takes priority over rotating shifts';
COMMENT ON COLUMN hr_roster.swapped_with IS 'Employee ID if this is a shift swap';
COMMENT ON COLUMN hr_roster.is_recurring IS 'If true, recur_day_of_week specifies which day of week';
