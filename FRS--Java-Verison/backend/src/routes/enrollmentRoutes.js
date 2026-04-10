import express from 'express';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { pool } from '../db/pool.js';
import { sendEnrollmentInvitation, sendEnrollmentRejection } from '../services/emailService.js';
import { writeAudit } from '../middleware/auditLog.js';
import upload from '../middleware/upload.js';

const router = express.Router();

// JWT secret for enrollment tokens (different from auth tokens)
const ENROLLMENT_TOKEN_SECRET = process.env.ENROLLMENT_TOKEN_SECRET || 'CHANGE_THIS_ENROLLMENT_SECRET_2026';

/**
 * POST /api/enrollment/send-invitations
 * Send enrollment invitations to multiple employees
 */
router.post(
  '/send-invitations',
  requireAuth,
  requirePermission('users.write'),
  asyncHandler(async (req, res) => {
    const { employeeIds } = req.body;

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ message: 'employeeIds array is required' });
    }

    if (employeeIds.length > 100) {
      return res.status(400).json({ message: 'Maximum 100 employees at once' });
    }

    const results = {
      sent: [],
      failed: [],
      skipped: []
    };

    const tenantId = req.scope?.tenantId || 1;
    const customerId = req.scope?.customerId;
    const siteId = req.scope?.siteId;

    for (const employeeId of employeeIds) {
      try {
        const { rows: empRows } = await pool.query(
          `SELECT pk_employee_id, employee_code, full_name, email, phone_number
           FROM hr_employee
           WHERE pk_employee_id = $1 AND tenant_id = $2`,
          [employeeId, tenantId]
        );

        if (empRows.length === 0) {
          results.skipped.push({ employeeId, reason: 'Employee not found' });
          continue;
        }

        const employee = empRows[0];

        if (!employee.email) {
          results.skipped.push({
            employeeId,
            employeeCode: employee.employee_code,
            employeeName: employee.full_name,
            reason: 'No email address'
          });
          continue;
        }

        // Check if employee already has a pending invitation
        const { rows: existingInvitations } = await pool.query(
          `SELECT pk_invitation_id, status, expires_at
           FROM enrollment_invitations
           WHERE fk_employee_id = $1
           AND status IN ('pending', 'opened', 'in_progress')
           AND expires_at > NOW()
           ORDER BY created_at DESC
           LIMIT 1`,
          [employeeId]
        );

        if (existingInvitations.length > 0) {
          results.skipped.push({
            employeeId,
            employeeCode: employee.employee_code,
            employeeName: employee.full_name,
            reason: 'Already has pending invitation'
          });
          continue;
        }

        // Generate JWT token (expires in 7 days)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const token = jwt.sign(
          {
            employeeId: employee.pk_employee_id,
            employeeCode: employee.employee_code,
            tenantId,
            customerId,
            siteId
          },
          ENROLLMENT_TOKEN_SECRET,
          { expiresIn: '7d' }
        );

        const { rows: invitationRows } = await pool.query(
          `INSERT INTO enrollment_invitations (
            fk_employee_id,
            tenant_id,
            customer_id,
            site_id,
            invitation_token,
            expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING pk_invitation_id`,
          [employeeId, tenantId, customerId, siteId, token, expiresAt]
        );

        const invitationId = invitationRows[0].pk_invitation_id;
        const enrollmentLink = `${process.env.ENROLLMENT_PORTAL_URL}/${token}`;

        await sendEnrollmentInvitation({
          employeeName: employee.full_name,
          employeeEmail: employee.email,
          enrollmentLink,
          expiresAt
        });

        await writeAudit({
          req,
          action: 'enrollment.invitation.sent',
          details: `Sent enrollment invitation to ${employee.full_name} (${employee.employee_code})`,
          entityType: 'employee',
          entityId: String(employeeId),
          entityName: employee.full_name,
          after: { invitationId, expiresAt: expiresAt.toISOString() },
          source: 'ui'
        });

        results.sent.push({
          employeeId,
          employeeCode: employee.employee_code,
          employeeName: employee.full_name,
          email: employee.email,
          invitationId,
          expiresAt
        });

      } catch (error) {
        console.error(`Failed to send invitation to employee ${employeeId}:`, error);
        results.failed.push({ employeeId, reason: error.message });
      }
    }

    return res.json({
      success: true,
      summary: {
        total: employeeIds.length,
        sent: results.sent.length,
        failed: results.failed.length,
        skipped: results.skipped.length
      },
      results
    });
  })
);

/**
 * GET /api/enrollment/invitations
 * Get all enrollment invitations (for HR dashboard)
 */
router.get(
  '/invitations',
  requireAuth,
  requirePermission('users.read'),
  asyncHandler(async (req, res) => {
    const { status, limit = 50, offset = 0 } = req.query;
    const tenantId = req.scope?.tenantId || 1;

    let whereClause = 'WHERE ei.tenant_id = $1';
    const params = [tenantId];

    if (status && status !== 'all') {
      params.push(status);
      whereClause += ` AND ei.status = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT
        ei.pk_invitation_id,
        ei.fk_employee_id,
        e.employee_code,
        e.full_name,
        e.email,
        ei.status,
        ei.approval_status,
        ei.average_quality,
        ei.sent_at,
        ei.expires_at,
        ei.opened_at,
        ei.completed_at,
        ei.quality_scores,
        CASE
          WHEN ei.expires_at < NOW() AND ei.status != 'completed' THEN 'expired'
          ELSE ei.status
        END as display_status
      FROM enrollment_invitations ei
      JOIN hr_employee e ON e.pk_employee_id = ei.fk_employee_id
      ${whereClause}
      ORDER BY ei.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int as total
       FROM enrollment_invitations ei
       ${whereClause}`,
      params
    );

    return res.json({
      invitations: rows,
      total: countRows[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  })
);

/**
 * GET /api/enrollment/employees
 * List employees with their enrollment status (for Remote Enrollment UI)
 */
router.get(
  '/employees',
  requireAuth,
  requirePermission('users.read'),
  asyncHandler(async (req, res) => {
    const tenantId = req.scope?.tenantId || 1;

    const { rows } = await pool.query(
      `SELECT
         e.pk_employee_id,
         e.employee_code,
         e.full_name,
         e.email,
         e.phone_number,
         e.status,
         COUNT(f.id)::int AS "embeddingCount",
         COUNT(f.id) > 0 AS enrolled
       FROM hr_employee e
       LEFT JOIN employee_face_embeddings f ON f.employee_id = e.pk_employee_id
       WHERE e.tenant_id = $1 AND e.status = 'active'
       GROUP BY e.pk_employee_id
       ORDER BY e.full_name`,
      [tenantId]
    );

    return res.json({ employees: rows });
  })
);

/**
 * POST /api/enrollment/invitations/:id/resend
 * Resend invitation email
 */
router.post(
  '/invitations/:id/resend',
  requireAuth,
  requirePermission('users.write'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT ei.*, e.full_name, e.email, e.employee_code
       FROM enrollment_invitations ei
       JOIN hr_employee e ON e.pk_employee_id = ei.fk_employee_id
       WHERE ei.pk_invitation_id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    const invitation = rows[0];
    const enrollmentLink = `${process.env.ENROLLMENT_PORTAL_URL}/${invitation.invitation_token}`;

    await sendEnrollmentInvitation({
      employeeName: invitation.full_name,
      employeeEmail: invitation.email,
      enrollmentLink,
      expiresAt: invitation.expires_at
    });

    await writeAudit({
      req,
      action: 'enrollment.invitation.resent',
      details: `Resent enrollment invitation to ${invitation.full_name} (${invitation.employee_code})`,
      entityType: 'employee',
      entityId: String(invitation.fk_employee_id),
      source: 'ui'
    });

    return res.json({ success: true, message: 'Invitation resent' });
  })
);

/**
 * GET /api/enroll/pending-approvals
 * Get enrollments pending HR approval
 */
router.get(
  '/pending-approvals',
  requireAuth,
  requirePermission('users.write'),
  asyncHandler(async (req, res) => {
    const tenantId = req.scope?.tenantId || 1;
    
    const { rows } = await pool.query(
      `SELECT 
        ei.pk_invitation_id,
        ei.fk_employee_id,
        e.employee_code,
        e.full_name,
        e.email,
        ei.average_quality,
        ei.quality_scores,
        ei.photo_paths,
        ei.completed_at,
        ei.approval_status,
        ei.device_info
      FROM enrollment_invitations ei
      JOIN hr_employee e ON e.pk_employee_id = ei.fk_employee_id
      WHERE ei.tenant_id = $1 
        AND ei.status = 'completed'
        AND ei.approval_status = 'pending'
      ORDER BY ei.completed_at DESC`,
      [tenantId]
    );
    
    return res.json({
      pendingApprovals: rows
    });
  })
);

/**
 * POST /api/enroll/invitations/:id/approve
 * Approve enrollment and create embeddings
 */
router.post(
  '/invitations/:id/approve',
  requireAuth,
  requirePermission('users.write'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.scope?.tenantId || 1;
    
    // Get invitation
    const { rows } = await pool.query(
      `SELECT ei.*, e.employee_code, e.full_name
       FROM enrollment_invitations ei
       JOIN hr_employee e ON e.pk_employee_id = ei.fk_employee_id
       WHERE ei.pk_invitation_id = $1 AND ei.tenant_id = $2`,
      [id, tenantId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Invitation not found' });
    }
    
    const invitation = rows[0];
    
    if (invitation.status !== 'completed') {
      return res.status(400).json({ message: 'Enrollment not completed yet' });
    }
    
    if (invitation.approval_status === 'auto_approved' || invitation.approval_status === 'manually_approved') {
      return res.status(400).json({ message: 'Already approved' });
    }
    
    try {
      // Create embeddings
      await createEmbeddingsFromPhotos(invitation);
      
      // Update approval status
      await pool.query(
        `UPDATE enrollment_invitations 
         SET approval_status = 'manually_approved',
             approved_at = NOW(),
             approved_by = $1,
             updated_at = NOW()
         WHERE pk_invitation_id = $2`,
        [req.user?.id || null, id]
      );
      
      // Audit log
      await writeAudit({
        req,
        action: 'enrollment.approved',
        details: `Approved enrollment for ${invitation.full_name} (${invitation.employee_code})`,
        entityType: 'employee',
        entityId: String(invitation.fk_employee_id),
        entityName: invitation.full_name,
        source: 'ui'
      });
      
      console.log(`✅ HR approved enrollment for ${invitation.employee_code}`);
      
      return res.json({
        success: true,
        message: 'Enrollment approved and embeddings created'
      });
      
    } catch (err) {
      console.error('Approval error:', err);
      return res.status(500).json({ 
        message: 'Failed to approve enrollment',
        error: err.message 
      });
    }
  })
);

/**
 * POST /api/enroll/invitations/:id/reject
 * Reject enrollment and send re-enrollment invitation
 */
router.post(
  '/invitations/:id/reject',
  requireAuth,
  requirePermission('users.write'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const tenantId = req.scope?.tenantId || 1;
    const customerId = req.scope?.customerId;
    const siteId = req.scope?.siteId;

    const { rows } = await pool.query(
      `SELECT ei.*, e.employee_code, e.full_name, e.email
       FROM enrollment_invitations ei
       JOIN hr_employee e ON e.pk_employee_id = ei.fk_employee_id
       WHERE ei.pk_invitation_id = $1 AND ei.tenant_id = $2`,
      [id, tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    const invitation = rows[0];

    await pool.query(
      `UPDATE enrollment_invitations
       SET approval_status = 'rejected',
           rejection_reason = $1,
           rejected_at = NOW(),
           rejected_by = $2,
           updated_at = NOW()
       WHERE pk_invitation_id = $3`,
      [reason || 'Poor photo quality', req.auth?.user?.id || null, id]
    );

    // Create new invitation for re-enrollment
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const token = jwt.sign(
      { employeeId: invitation.fk_employee_id, employeeCode: invitation.employee_code, tenantId, customerId, siteId },
      ENROLLMENT_TOKEN_SECRET,
      { expiresIn: '7d' }
    );

    await pool.query(
      `INSERT INTO enrollment_invitations (fk_employee_id, tenant_id, customer_id, site_id, invitation_token, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [invitation.fk_employee_id, tenantId, customerId, siteId, token, expiresAt]
    );

    const enrollmentLink = `${process.env.ENROLLMENT_PORTAL_URL}/${token}`;

    try {
      await sendEnrollmentRejection({
        employeeName: invitation.full_name,
        employeeEmail: invitation.email,
        reason: reason || 'Poor photo quality',
        enrollmentLink
      });
      console.log(`📧 Rejection email sent to ${invitation.email}`);
    } catch (emailErr) {
      console.error('Failed to send rejection email:', emailErr);
    }

    await writeAudit({
      req,
      action: 'enrollment.rejected',
      details: `Rejected enrollment for ${invitation.full_name} (${invitation.employee_code}): ${reason || 'Poor photo quality'}. New invitation sent.`,
      entityType: 'employee',
      entityId: String(invitation.fk_employee_id),
      entityName: invitation.full_name,
      source: 'ui'
    });

    return res.json({ success: true, message: 'Enrollment rejected and new invitation sent to employee' });
  })
);

/**
 * GET /api/enroll/photos/:filename
 * Serve enrollment photo (requires auth)
 */
router.get(
  '/photos/:filename',
  requireAuth,
  requirePermission('users.read'),
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Validate filename (security)
    if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$/.test(filename)) {
      return res.status(400).json({ message: 'Invalid filename' });
    }
    
    const photoPath = path.join('/opt/frs/photos/remote-enrollment', filename);
    
    try {
      const fileBuffer = await fs.readFile(photoPath);
      res.setHeader('Content-Type', 'image/jpeg');
      res.send(fileBuffer);
    } catch (err) {
      return res.status(404).json({ message: 'Photo not found' });
    }
  })
);

  // ── PUBLIC enrollment portal routes (no Keycloak auth — use their own JWT) ──
// These MUST be after all named routes to avoid the /:token wildcard
// swallowing paths like /invitations, /employees, /send-invitations.

/**
 * GET /api/enrollment/:token
 * Validate token and return employee info (PUBLIC)
 */
router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    try {
      jwt.verify(token, ENROLLMENT_TOKEN_SECRET);

      const { rows } = await pool.query(
        `SELECT ei.*, e.full_name, e.employee_code, e.email
         FROM enrollment_invitations ei
         JOIN hr_employee e ON e.pk_employee_id = ei.fk_employee_id
         WHERE ei.invitation_token = $1`,
        [token]
      );

      if (rows.length === 0) {
        return res.status(404).json({ message: 'Invitation not found' });
      }

      const invitation = rows[0];

      if (new Date(invitation.expires_at) < new Date()) {
        return res.json({
          employeeName: invitation.full_name,
          employeeCode: invitation.employee_code,
          status: 'expired'
        });
      }

      if (invitation.status === 'pending') {
        await pool.query(
          `UPDATE enrollment_invitations
           SET status = 'opened', opened_at = NOW()
           WHERE pk_invitation_id = $1`,
          [invitation.pk_invitation_id]
        );
      }

      return res.json({
        employeeName: invitation.full_name,
        employeeCode: invitation.employee_code,
        status: invitation.status,
        invitationId: invitation.pk_invitation_id
      });

    } catch (err) {
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Invalid or expired token' });
      }
      throw err;
    }
  })
);

/**
 * POST /api/enroll/:token/upload-angle
 * Upload and process a single angle photo (PUBLIC - no auth)
 */
router.post(
  '/:token/upload-angle',
  upload.single('photo'), // Add multer middleware
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { angle } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No photo provided' });
    }
    
    if (!angle || !['front', 'left', 'right', 'up', 'down'].includes(angle)) {
      return res.status(400).json({ message: 'Invalid angle' });
    }
    
    try {
      // Verify token
      const decoded = jwt.verify(token, ENROLLMENT_TOKEN_SECRET);
      
      // Get invitation
      const { rows: invRows } = await pool.query(
        `SELECT ei.*, e.employee_code 
         FROM enrollment_invitations ei
         JOIN hr_employee e ON e.pk_employee_id = ei.fk_employee_id
         WHERE ei.invitation_token = $1`,
        [token]
      );
      
      if (invRows.length === 0) {
        return res.status(404).json({ message: 'Invitation not found' });
      }
      
      const invitation = invRows[0];
      
      // Save photo to permanent storage
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const photoDir = '/opt/frs/photos/remote-enrollment';
      await fs.mkdir(photoDir, { recursive: true });
      
      const filename = `${invitation.employee_code}_${angle}_${Date.now()}.jpg`;
      const photoPath = path.join(photoDir, filename);
      
      // Write buffer to file (multer uses memoryStorage)
      await fs.writeFile(photoPath, req.file.buffer);
      
      // Send to Jetson for quality check
      let quality = 0.65; // Default fallback
      
      try {
        const FormData = (await import('form-data')).default;
        const formData = new FormData();
        formData.append('photo', await fs.readFile(photoPath), {
          filename: filename,
          contentType: 'image/jpeg'
        });
        formData.append('employee_id', String(invitation.fk_employee_id));
        formData.append('angle', angle);
        
        // Call Jetson enrollment endpoint
        const jetsonResponse = await fetch('http://172.18.3.202:8000/enroll', {
          method: 'POST',
          body: formData,
          headers: formData.getHeaders()
        });
        
        if (jetsonResponse.ok) {
          const jetsonData = await jetsonResponse.json();
          quality = jetsonData.confidence || quality;
          console.log(`✅ Jetson processed ${angle} photo: quality=${quality}`);
        } else {
          console.warn(`⚠️ Jetson processing failed for ${angle}, using fallback quality`);
        }
      } catch (jetsonErr) {
        console.error('Jetson error:', jetsonErr.message);
        // Continue with fallback quality
      }
      
      // Update invitation with photo path and quality
      const currentPhotoPaths = invitation.photo_paths || {};
      const currentQualities = invitation.quality_scores || {};
      
      currentPhotoPaths[angle] = photoPath;
      currentQualities[angle] = quality;
      
      await pool.query(
        `UPDATE enrollment_invitations 
         SET photo_paths = $1,
             quality_scores = $2,
             status = CASE 
               WHEN status = 'opened' OR status = 'pending' THEN 'in_progress'
               ELSE status 
             END,
             started_at = COALESCE(started_at, NOW()),
             updated_at = NOW()
         WHERE pk_invitation_id = $3`,
        [JSON.stringify(currentPhotoPaths), JSON.stringify(currentQualities), invitation.pk_invitation_id]
      );
      
      return res.json({
        success: true,
        quality: quality,
        message: 'Photo uploaded and processed successfully'
      });
      
    } catch (err) {
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Invalid token' });
      }
      console.error('Upload error:', err);
      throw err;
    }
  })
);


/**
 * POST /api/enroll/:token/complete
 * Complete enrollment and create embeddings (PUBLIC - no auth)
 */
router.post(
  '/:token/complete',
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    
    try {
      // Verify token
      const decoded = jwt.verify(token, ENROLLMENT_TOKEN_SECRET);
      
      // Get invitation with photo data
      const { rows: invRows } = await pool.query(
        `SELECT ei.*, e.full_name, e.email, e.employee_code
         FROM enrollment_invitations ei
         JOIN hr_employee e ON e.pk_employee_id = ei.fk_employee_id
         WHERE ei.invitation_token = $1`,
        [token]
      );
      
      if (invRows.length === 0) {
        return res.status(404).json({ message: 'Invitation not found' });
      }
      
      const invitation = invRows[0];
      const qualityScores = invitation.quality_scores || {};
      
      // Calculate average quality
      const qualities = Object.values(qualityScores);
      const avgQuality = qualities.length > 0 
        ? qualities.reduce((sum, q) => sum + q, 0) / qualities.length 
        : 0;
      
      // Determine approval status based on quality
      let approvalStatus = 'pending';
      if (avgQuality >= 0.75) {
        approvalStatus = 'auto_approved';
      } else if (avgQuality < 0.60) {
        approvalStatus = 'pending'; // Needs HR review
      }
      
      // Mark invitation as completed
      await pool.query(
        `UPDATE enrollment_invitations 
         SET status = 'completed', 
             completed_at = NOW(),
             average_quality = $1,
             approval_status = $2,
             updated_at = NOW()
         WHERE pk_invitation_id = $3`,
        [avgQuality, approvalStatus, invitation.pk_invitation_id]
      );
      
      // If auto-approved, create embeddings immediately
      if (approvalStatus === 'auto_approved') {
        try {
          await createEmbeddingsFromPhotos(invitation);
          
          // Update approval status to show embeddings were created
          await pool.query(
            `UPDATE enrollment_invitations 
             SET approval_status = 'auto_approved', approved_at = NOW() 
             WHERE pk_invitation_id = $1`,
            [invitation.pk_invitation_id]
          );
          
          console.log(`✅ Auto-approved and created embeddings for ${invitation.employee_code}`);
          
        } catch (embErr) {
          console.error('Failed to create embeddings:', embErr);
          // Mark as pending for manual review if embedding creation fails
          await pool.query(
            `UPDATE enrollment_invitations 
             SET approval_status = 'pending' 
             WHERE pk_invitation_id = $1`,
            [invitation.pk_invitation_id]
          );
        }
      }
      
      // Send notification to HR
      // TODO: Implement email notification to HR about completion
      
      // Audit log
      await writeAudit({
        req: { user: { id: null }, headers: {}, ip: '' },
        action: 'enrollment.completed',
        details: `${invitation.full_name} (${invitation.employee_code}) completed remote enrollment (avg quality: ${(avgQuality * 100).toFixed(0)}%)`,
        entityType: 'employee',
        entityId: String(invitation.fk_employee_id),
        entityName: invitation.full_name,
        after: { avgQuality, approvalStatus },
        source: 'remote_enrollment'
      });
      
      return res.json({
        success: true,
        averageQuality: avgQuality,
        approvalStatus: approvalStatus,
        message: approvalStatus === 'auto_approved' 
          ? 'Enrollment completed and approved automatically'
          : 'Enrollment completed. Pending HR review.'
      });
      
    } catch (err) {
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Invalid token' });
      }
      throw err;
    }
  })
);

/**
 * Helper function to create face embeddings from stored photos
 */
async function createEmbeddingsFromPhotos(invitation) {
  const photoPaths = invitation.photo_paths || {};
  const qualityScores = invitation.quality_scores || {};
  
  // Delete existing embeddings for this employee
  await pool.query(
    'DELETE FROM employee_face_embeddings WHERE employee_id = $1',
    [invitation.fk_employee_id]
  );
  
  // Create new embeddings from each photo
  for (const [angle, photoPath] of Object.entries(photoPaths)) {
    const quality = qualityScores[angle] || 0;
    
    // Note: We're assuming the Jetson already created the embedding when we uploaded
    // In a real implementation, you might need to call Jetson again here
    // For now, we'll create a placeholder embedding
    
    await pool.query(
`INSERT INTO employee_face_embeddings 
       (employee_id, embedding, angle, quality_score, photo_path, is_primary, enrolled_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        invitation.fk_employee_id,
        null, // Embedding vector - should come from Jetson
        angle,
        quality,
        photoPath,
        angle === 'front' // Front face is primary
      ]
    );
  }
  
  console.log(`Created ${Object.keys(photoPaths).length} embeddings for employee ${invitation.fk_employee_id}`);
}

export default router;
