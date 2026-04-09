-- Migration 010: Add angle metadata to face embeddings
ALTER TABLE employee_face_embeddings
  ADD COLUMN IF NOT EXISTS angle VARCHAR(20);

COMMENT ON COLUMN employee_face_embeddings.angle IS
  'Pose angle captured: front, left, right, up, down';
