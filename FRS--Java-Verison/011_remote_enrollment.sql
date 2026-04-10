cd ~/FRS_/FRS--Java-Verison/
docker compose restart backend
sleep 5
docker compose logs backend --tail 30 | grep -E "011_remote|Migration|completed"-- Remote enrollment invitation system

-- enrollment_invitations table
CREATE TABLE IF NOT EXISTS enrollment_invitations (
  pk_invitation_id SERIAL PRIMARY KEY,
  fk_employee_id INT NOT NULL REFERENCES hr_employee(pk_employee_id) ON DELETE CASCADE,
  tenant_id INT NOT NULL,
  customer_id INT,
  site_id INT,
  
  invitation_token TEXT UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', 
  -- pending: link sent, not opened
  -- opened: employee clicked link
  -- in_progress: started capturing photos
  -- completed: all 5 photos captured
  -- approved: HR approved (or auto-approved)
  -- rejected: HR rejected
  -- expired: token expired
  
  sent_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  opened_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  device_info JSONB, -- {browser, os, ip, userAgent, location}
  quality_scores JSONB, -- {front: 0.85, left: 0.72, right: 0.78, up: 0.68, down: 0.75}
  photo_paths JSONB, -- {front: '/path/to/front.jpg', left: ...}
  
  approval_status VARCHAR(50) DEFAULT 'pending', 
  -- pending: awaiting approval
  -- auto_approved: quality > 75%, auto-approved
  -- manually_approved: HR manually approved
  -- rejected: HR rejected
  
  average_quality DECIMAL(5,2), -- Calculated average of 5 angles
  approved_by INT REFERENCES frs_user(pk_user_id),
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_invitation_token ON enrollment_invitations(invitation_token);
CREATE INDEX idx_invitation_employee ON enrollment_invitations(fk_employee_id);
CREATE INDEX idx_invitation_status ON enrollment_invitations(status);
CREATE INDEX idx_invitation_approval ON enrollment_invitations(approval_status);

-- enrollment_session_progress table (for tracking partial completions)
CREATE TABLE IF NOT EXISTS enrollment_session_progress (
  pk_session_id SERIAL PRIMARY KEY,
  fk_invitation_id INT NOT NULL REFERENCES enrollment_invitations(pk_invitation_id) ON DELETE CASCADE,
  
  started_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP DEFAULT NOW(),
  
  angles_captured JSONB DEFAULT '{"front": false, "left": false, "right": false, "up": false, "down": false}',
  current_angle VARCHAR(20), -- front/left/right/up/down
  
  temp_photo_paths JSONB, -- {front: '/temp/abc123_front.jpg', ...}
  temp_quality_scores JSONB, -- {front: 0.85, left: 0.72, ...}
  
  retry_count INT DEFAULT 0,
  last_error TEXT
);

CREATE INDEX idx_session_invitation ON enrollment_session_progress(fk_invitation_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_enrollment_invitation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_enrollment_invitation_timestamp
  BEFORE UPDATE ON enrollment_invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_enrollment_invitation_timestamp();
