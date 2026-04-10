-- Migration: Add approval tracking columns to enrollment_invitations
-- Date: 2026-04-10

ALTER TABLE enrollment_invitations
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS approved_by INTEGER,
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS rejected_by INTEGER,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add comments
COMMENT ON COLUMN enrollment_invitations.approved_at IS 'Timestamp when enrollment was approved';
COMMENT ON COLUMN enrollment_invitations.approved_by IS 'User ID who approved the enrollment';
COMMENT ON COLUMN enrollment_invitations.rejected_at IS 'Timestamp when enrollment was rejected';
COMMENT ON COLUMN enrollment_invitations.rejected_by IS 'User ID who rejected the enrollment';
COMMENT ON COLUMN enrollment_invitations.rejection_reason IS 'Reason for rejection';
