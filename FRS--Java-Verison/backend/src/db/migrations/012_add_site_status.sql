-- Add status column to frs_site table
ALTER TABLE frs_site 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' 
CHECK (status IN ('active', 'inactive'));

-- Create an index on status for filtering
CREATE INDEX IF NOT EXISTS idx_frs_site_status ON frs_site(status);
