/**
 * deviceManagementRoutes.js — Phase 2: Device & Site Management
 * New endpoints for device lifecycle, provisioning, heartbeat
 */
import express from 'express';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { pool } from '../db/pool.js';
import authenticateDevice from '../middleware/authenticateDevice.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Device JWT secret (should match what's in .env)
const DEVICE_JWT_SECRET = process.env.DEVICE_JWT_SECRET || 'CHANGE_THIS_IN_PRODUCTION_DEVICE_SECRET_2026';

// ============================================================================
// POST /api/device-management/devices - Register New Device
// ============================================================================
router.post('/devices', requireAuth, requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const {
    external_device_id,
    device_type_code,
    name,
    location_label,
    ip_address,
    serial_number,
    mac_address,
    notes
  } = req.body;

  // Validation
  if (!external_device_id || !device_type_code || !name || !ip_address) {
    return res.status(400).json({ 
      error: 'Missing required fields: external_device_id, device_type_code, name, ip_address' 
    });
  }

  const tenantId = req.auth?.scope?.tenantId || 1;
  const userId = req.auth?.user?.id;

  await pool.query('BEGIN');
  
  try {
    // Check if device already exists
    const existing = await pool.query(
      'SELECT pk_device_id FROM facility_device WHERE tenant_id = $1 AND external_device_id = $2',
      [tenantId, external_device_id]
    );

    if (existing.rows.length > 0) {
      await pool.query('ROLLBACK');
      return res.status(409).json({ error: 'Device with this ID already exists' });
    }

    // Get device type
    const deviceType = await pool.query(
      'SELECT pk_device_type_id FROM device_type WHERE type_code = $1',
      [device_type_code]
    );

    if (deviceType.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid device type code' });
    }

    // Insert device
    const result = await pool.query(`
      INSERT INTO facility_device (
        tenant_id, external_device_id, name, location_label, ip_address,
        device_type_id, serial_number, mac_address, device_notes,
        status, created_by, device_config
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'offline', $10, '{}'::jsonb)
      RETURNING pk_device_id, external_device_id, name, status, ip_address
    `, [
      tenantId, external_device_id, name, location_label || 'Not set', ip_address,
      deviceType.rows[0].pk_device_type_id, serial_number, mac_address, notes, userId
    ]);

    await pool.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Device registered successfully',
      device: result.rows[0],
      next_step: 'provision_device'
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Device registration error:', error);
    res.status(500).json({ error: 'Failed to register device' });
  }
}));


// ============================================================================
// POST /api/device-management/devices/:code/provision - Generate Device Token
// ============================================================================
router.post('/devices/:code/provision', requireAuth, requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { token_validity_days = 365 } = req.body;

  const tenantId = req.auth?.scope?.tenantId || 1;

  try {
    // Get device
    const device = await pool.query(
      'SELECT pk_device_id, external_device_id, name, status FROM facility_device WHERE tenant_id = $1 AND external_device_id = $2',
      [tenantId, code]
    );

    if (device.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceData = device.rows[0];

    // Generate unique secret for this device
    const deviceSecret = crypto.randomBytes(32).toString('hex');
    const deviceSecretHash = await bcrypt.hash(deviceSecret, 10);

    // Generate JWT token
    const expiresInSeconds = token_validity_days * 24 * 60 * 60;
    const tokenPayload = {
      device_id: deviceData.pk_device_id,
      device_code: deviceData.external_device_id,
      tenant_id: tenantId,
      iss: 'frs2-backend',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds
    };

    const deviceToken = jwt.sign(tokenPayload, deviceSecret);

    // Store secret hash in database
    await pool.query(`
      UPDATE facility_device
      SET device_secret_hash = $1,
          token_issued_at = NOW(),
          token_expires_at = NOW() + INTERVAL '${token_validity_days} days',
          status = 'offline'
      WHERE pk_device_id = $2
    `, [deviceSecretHash, deviceData.pk_device_id]);

    res.json({
      success: true,
      message: 'Device token generated successfully',
      device_token: deviceToken,
      token_expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      installation_instructions: {
        step_1: `SSH to device: ssh user@${device.rows[0].ip_address || 'DEVICE_IP'}`,
        step_2: `Save token: echo '${deviceToken}' > /opt/frs/device_token.txt`,
        step_3: 'Restart service: sudo systemctl restart frs-runner',
        step_4: 'Verify: Device should appear online within 15 seconds'
      }
    });

  } catch (error) {
    console.error('Device provisioning error:', error);
    res.status(500).json({ error: 'Failed to provision device' });
  }
}));


// ============================================================================
// POST /api/device-management/devices/:code/heartbeat - Device Heartbeat
// ============================================================================
router.post('/devices/:code/heartbeat', authenticateDevice, asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { status = 'online', metrics = {} } = req.body;
  const deviceId = req.device?.device_id; // From authenticateDevice middleware

  try {
    // Insert heartbeat record
    await pool.query(`
      INSERT INTO device_heartbeat (device_id, status, metrics, ip_address, timestamp)
      VALUES ($1, $2, $3, $4, NOW())
    `, [deviceId, status, JSON.stringify(metrics), req.ip]);

    // The trigger will auto-update facility_device.last_heartbeat and status

    // Check for pending commands
    const pendingCommands = await pool.query(`
      SELECT pk_command_id, command_type, command_payload, priority
      FROM device_command_queue
      WHERE device_id = $1 AND status = 'pending'
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY priority ASC, created_at ASC
      LIMIT 5
    `, [deviceId]);

    res.json({
      success: true,
      acknowledged_at: new Date().toISOString(),
      next_heartbeat_seconds: 15,
      commands_pending: pendingCommands.rows.length,
      commands: pendingCommands.rows
    });

  } catch (error) {
    console.error('Heartbeat processing error:', error);
    res.status(500).json({ error: 'Heartbeat processing failed' });
  }
}));



// ============================================================================
// GET /api/device-management/devices - List All Devices
// ============================================================================
router.get('/devices', requireAuth, requirePermission('devices.read'), asyncHandler(async (req, res) => {
  const { status, device_type, site_id, search } = req.query;
  const tenantId = req.auth?.scope?.tenantId || 1;

  try {
    let query = `
      SELECT 
        fd.pk_device_id,
        fd.external_device_id,
        fd.name,
        fd.location_label,
        fd.ip_address,
        fd.status,
        fd.last_active,
        fd.last_heartbeat,
        fd.serial_number,
        fd.mac_address,
        dt.type_name as device_type,
        dt.category as device_category,
        s.site_name,
        sda.device_role,
        sda.zone_name,
        CASE 
          WHEN fd.last_heartbeat IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (NOW() - fd.last_heartbeat))::INTEGER
          ELSE NULL
        END as seconds_since_heartbeat
      FROM facility_device fd
      LEFT JOIN device_type dt ON dt.pk_device_type_id = fd.device_type_id
      LEFT JOIN site_device_assignment sda ON sda.device_id = fd.pk_device_id AND sda.is_active = TRUE
      LEFT JOIN frs_site s ON s.pk_site_id = sda.site_id
      WHERE fd.tenant_id = $1
      AND fd.decommissioned_at IS NULL
    `;

    const params = [tenantId];
    let paramIndex = 2;

    // Filter by status
    if (status) {
      query += ` AND fd.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Filter by device type
    if (device_type) {
      query += ` AND dt.type_code = $${paramIndex}`;
      params.push(device_type);
      paramIndex++;
    }

    // Filter by site
    if (site_id) {
      query += ` AND sda.site_id = $${paramIndex}`;
      params.push(site_id);
      paramIndex++;
    }

    // Search by name or external_device_id
    if (search) {
      query += ` AND (fd.external_device_id ILIKE $${paramIndex} OR fd.name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY fd.pk_device_id DESC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      devices: result.rows
    });

  } catch (error) {
    console.error('List devices error:', error);
    res.status(500).json({ error: 'Failed to list devices' });
  }
}));


// ============================================================================
// GET /api/device-management/devices/:code - Get Device Details
// ============================================================================
router.get('/devices/:code', requireAuth, requirePermission('devices.read'), asyncHandler(async (req, res) => {
  const { code } = req.params;
  const tenantId = req.auth?.scope?.tenantId || 1;

  try {
    // Get device with full details
    const device = await pool.query(`
      SELECT 
        fd.*,
        dt.type_name as device_type,
        dt.type_code as device_type_code,
        dt.category as device_category,
        dt.manufacturer,
        dt.model,
        s.site_name,
        s.pk_site_id as site_id,
        sda.device_role,
        sda.zone_name,
        sda.assigned_at,
        parent.external_device_id as parent_device_code,
        parent.name as parent_device_name
      FROM facility_device fd
      LEFT JOIN device_type dt ON dt.pk_device_type_id = fd.device_type_id
      LEFT JOIN site_device_assignment sda ON sda.device_id = fd.pk_device_id AND sda.is_active = TRUE
      LEFT JOIN frs_site s ON s.pk_site_id = sda.site_id
      LEFT JOIN facility_device parent ON parent.pk_device_id = fd.parent_device_id
      WHERE fd.tenant_id = $1 AND fd.external_device_id = $2
      AND fd.decommissioned_at IS NULL
    `, [tenantId, code]);

    if (device.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Get latest heartbeat
    const latestHeartbeat = await pool.query(`
      SELECT timestamp, status, metrics
      FROM device_heartbeat
      WHERE device_id = $1
      ORDER BY timestamp DESC
      LIMIT 1
    `, [device.rows[0].pk_device_id]);

    // Get status history (last 10 changes)
    const statusHistory = await pool.query(`
      SELECT old_status, new_status, transition_reason, changed_at, duration_seconds
      FROM device_status_history
      WHERE device_id = $1
      ORDER BY changed_at DESC
      LIMIT 10
    `, [device.rows[0].pk_device_id]);

    // Get child devices (if this is a parent like Jetson)
    const childDevices = await pool.query(`
      SELECT external_device_id, name, status, ip_address
      FROM facility_device
      WHERE parent_device_id = $1
    `, [device.rows[0].pk_device_id]);

    res.json({
      success: true,
      device: device.rows[0],
      latest_heartbeat: latestHeartbeat.rows[0] || null,
      status_history: statusHistory.rows,
      child_devices: childDevices.rows
    });

  } catch (error) {
    console.error('Get device details error:', error);
    res.status(500).json({ error: 'Failed to get device details' });
  }
}));


// ============================================================================
// PATCH /api/device-management/devices/:code - Update Device Config
// ============================================================================
router.patch('/devices/:code', requireAuth, requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { name, location_label, ip_address, device_config, notes } = req.body;
  const tenantId = req.auth?.scope?.tenantId || 1;

  try {
    // Check if device exists
    const existing = await pool.query(
      'SELECT pk_device_id FROM facility_device WHERE tenant_id = $1 AND external_device_id = $2',
      [tenantId, code]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceId = existing.rows[0].pk_device_id;

    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }

    if (location_label !== undefined) {
      updates.push(`location_label = $${paramIndex}`);
      params.push(location_label);
      paramIndex++;
    }

    if (ip_address !== undefined) {
      updates.push(`ip_address = $${paramIndex}`);
      params.push(ip_address);
      paramIndex++;
    }

    if (device_config !== undefined) {
      updates.push(`device_config = $${paramIndex}::jsonb`);
      params.push(JSON.stringify(device_config));
      paramIndex++;
    }

    if (notes !== undefined) {
      updates.push(`device_notes = $${paramIndex}`);
      params.push(notes);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Add WHERE clause params
    params.push(deviceId);

    const query = `
      UPDATE facility_device
      SET ${updates.join(', ')}
      WHERE pk_device_id = $${paramIndex}
      RETURNING pk_device_id, external_device_id, name, location_label, ip_address, status
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      message: 'Device updated successfully',
      device: result.rows[0]
    });

  } catch (error) {
    console.error('Update device error:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
}));


// ============================================================================
// DELETE /api/device-management/devices/:code - Decommission Device
// ============================================================================
router.delete('/devices/:code', requireAuth, requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const { code } = req.params;
  const tenantId = req.auth?.scope?.tenantId || 1;
  const userId = req.auth?.user?.id;

  try {
    const device = await pool.query(
      'SELECT pk_device_id, status FROM facility_device WHERE tenant_id = $1 AND external_device_id = $2',
      [tenantId, code]
    );

    if (device.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceId = device.rows[0].pk_device_id;

    // Decommission (soft delete)
    await pool.query(`
      UPDATE facility_device
      SET status = 'offline',
          decommissioned_at = NOW(),
          decommissioned_by = $1
      WHERE pk_device_id = $2
    `, [userId, deviceId]);

    // Deactivate site assignments
    await pool.query(`
      UPDATE site_device_assignment
      SET is_active = FALSE,
          unassigned_at = NOW(),
          unassignment_reason = 'Device decommissioned'
      WHERE device_id = $1 AND is_active = TRUE
    `, [deviceId]);

    res.json({
      success: true,
      message: 'Device decommissioned successfully',
      device_id: deviceId,
      external_device_id: code
    });

  } catch (error) {
    console.error('Decommission device error:', error);
    res.status(500).json({ error: 'Failed to decommission device' });
  }
}));


// ============================================================================
// POST /api/device-management/devices/:code/reboot - Send Reboot Command
// ============================================================================
router.post('/devices/:code/reboot', requireAuth, requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { priority = 5, reason } = req.body;
  const tenantId = req.auth?.scope?.tenantId || 1;
  const userId = req.auth?.user?.id;

  try {
    const device = await pool.query(
      'SELECT pk_device_id, status FROM facility_device WHERE tenant_id = $1 AND external_device_id = $2',
      [tenantId, code]
    );

    if (device.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceId = device.rows[0].pk_device_id;

    if (device.rows[0].status === 'offline') {
      return res.status(400).json({ error: 'Cannot reboot offline device' });
    }

    // Insert command into queue
    const command = await pool.query(`
      INSERT INTO device_command_queue (
        device_id, command_type, command_payload, priority, created_by, expires_at
      ) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '5 minutes')
      RETURNING pk_command_id, command_type, created_at, expires_at
    `, [
      deviceId,
      'reboot',
      JSON.stringify({ reason: reason || 'Manual reboot requested' }),
      priority,
      userId
    ]);

    res.json({
      success: true,
      message: 'Reboot command queued successfully',
      command: command.rows[0],
      note: 'Device will execute reboot on next heartbeat (within 15 seconds)'
    });

  } catch (error) {
    console.error('Reboot device error:', error);
    res.status(500).json({ error: 'Failed to queue reboot command' });
  }
}));


// ============================================================================
// POST /api/device-management/sites/:siteId/devices - Assign Device to Site
// ============================================================================
router.post('/sites/:siteId/devices', requireAuth, requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const { siteId } = req.params;
  const { device_code, device_role, zone_name } = req.body;
  const tenantId = req.auth?.scope?.tenantId || 1;
  const userId = req.auth?.user?.id;

  if (!device_code || !device_role) {
    return res.status(400).json({ error: 'device_code and device_role are required' });
  }

  await pool.query('BEGIN');

  try {
    // Verify site exists
    const site = await pool.query(
      'SELECT pk_site_id, site_name FROM frs_site WHERE pk_site_id = $1',
      [siteId]
    );

    if (site.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Site not found' });
    }

    // Get device
    const device = await pool.query(
      'SELECT pk_device_id, external_device_id, name, status FROM facility_device WHERE tenant_id = $1 AND external_device_id = $2',
      [tenantId, device_code]
    );

    if (device.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceId = device.rows[0].pk_device_id;

    // Check if device is already assigned to another site
    const existingAssignment = await pool.query(
      'SELECT site_id, is_active FROM site_device_assignment WHERE device_id = $1 AND is_active = TRUE',
      [deviceId]
    );

    if (existingAssignment.rows.length > 0 && existingAssignment.rows[0].site_id != siteId) {
      await pool.query('ROLLBACK');
      return res.status(409).json({ 
        error: 'Device is already assigned to another site',
        current_site_id: existingAssignment.rows[0].site_id
      });
    }

    // If already assigned to this site, just update the assignment
    if (existingAssignment.rows.length > 0 && existingAssignment.rows[0].site_id == siteId) {
      const updated = await pool.query(`
        UPDATE site_device_assignment
        SET device_role = $1, zone_name = $2
        WHERE device_id = $3 AND site_id = $4 AND is_active = TRUE
        RETURNING pk_assignment_id, device_role, zone_name, assigned_at
      `, [device_role, zone_name, deviceId, siteId]);

      await pool.query('COMMIT');

      return res.json({
        success: true,
        message: 'Device assignment updated',
        assignment: {
          ...updated.rows[0],
          site_name: site.rows[0].site_name,
          device_code: device.rows[0].external_device_id,
          device_name: device.rows[0].name
        }
      });
    }

    // Create new assignment
    const assignment = await pool.query(`
      INSERT INTO site_device_assignment (
        site_id, device_id, device_role, zone_name, is_active, assigned_by
      ) VALUES ($1, $2, $3, $4, TRUE, $5)
      RETURNING pk_assignment_id, device_role, zone_name, assigned_at
    `, [siteId, deviceId, device_role, zone_name, userId]);

    await pool.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Device assigned to site successfully',
      assignment: {
        ...assignment.rows[0],
        site_name: site.rows[0].site_name,
        device_code: device.rows[0].external_device_id,
        device_name: device.rows[0].name
      }
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Assign device to site error:', error);
    res.status(500).json({ error: 'Failed to assign device to site' });
  }
}));


// ============================================================================
// GET /api/device-management/sites/:siteId/devices - List Site's Devices
// ============================================================================
router.get('/sites/:siteId/devices', requireAuth, requirePermission('devices.read'), asyncHandler(async (req, res) => {
  const { siteId } = req.params;

  try {
    const devices = await pool.query(`
      SELECT 
        fd.pk_device_id,
        fd.external_device_id,
        fd.name as device_name,
        fd.status,
        fd.ip_address,
        fd.last_active,
        fd.last_heartbeat,
        dt.type_name as device_type,
        dt.category as device_category,
        sda.device_role,
        sda.zone_name,
        sda.assigned_at,
        sda.pk_assignment_id,
        s.site_name,
        CASE 
          WHEN fd.last_heartbeat IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (NOW() - fd.last_heartbeat))::INTEGER
          ELSE NULL
        END as seconds_since_heartbeat
      FROM site_device_assignment sda
      JOIN facility_device fd ON fd.pk_device_id = sda.device_id
      LEFT JOIN device_type dt ON dt.pk_device_type_id = fd.device_type_id
      JOIN frs_site s ON s.pk_site_id = sda.site_id
      WHERE sda.site_id = $1 
        AND sda.is_active = TRUE
        AND fd.decommissioned_at IS NULL
      ORDER BY sda.assigned_at DESC
    `, [siteId]);

    res.json({
      success: true,
      site_id: siteId,
      count: devices.rows.length,
      devices: devices.rows
    });

  } catch (error) {
    console.error('List site devices error:', error);
    res.status(500).json({ error: 'Failed to list site devices' });
  }
}));


// ============================================================================
// DELETE /api/device-management/sites/:siteId/devices/:deviceCode - Unassign
// ============================================================================
router.delete('/sites/:siteId/devices/:deviceCode', requireAuth, requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const { siteId, deviceCode } = req.params;
  const { reason } = req.body;
  const tenantId = req.auth?.scope?.tenantId || 1;
  const userId = req.auth?.user?.id;

  try {
    // Get device
    const device = await pool.query(
      'SELECT pk_device_id FROM facility_device WHERE tenant_id = $1 AND external_device_id = $2',
      [tenantId, deviceCode]
    );

    if (device.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceId = device.rows[0].pk_device_id;

    // Unassign (deactivate assignment)
    const result = await pool.query(`
      UPDATE site_device_assignment
      SET is_active = FALSE,
          unassigned_at = NOW(),
          unassigned_by = $1,
          unassignment_reason = $2
      WHERE site_id = $3 AND device_id = $4 AND is_active = TRUE
      RETURNING pk_assignment_id, device_role, zone_name
    `, [userId, reason || 'Manual unassignment', siteId, deviceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device is not assigned to this site' });
    }

    res.json({
      success: true,
      message: 'Device unassigned from site successfully',
      assignment_id: result.rows[0].pk_assignment_id,
      device_code: deviceCode
    });

  } catch (error) {
    console.error('Unassign device error:', error);
    res.status(500).json({ error: 'Failed to unassign device' });
  }
}));


// ============================================================================
// GET /api/device-management/config/effective/:deviceCode - Get Merged Config
// ============================================================================
router.get('/config/effective/:deviceCode', requireAuth, requirePermission('devices.read'), asyncHandler(async (req, res) => {
  const { deviceCode } = req.params;
  const tenantId = req.auth?.scope?.tenantId || 1;

  try {
    // Get device
    const device = await pool.query(
      'SELECT pk_device_id FROM facility_device WHERE tenant_id = $1 AND external_device_id = $2',
      [tenantId, deviceCode]
    );

    if (device.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceId = device.rows[0].pk_device_id;

    // Get effective config using the DB function
    const config = await pool.query(
      'SELECT get_effective_device_config($1) as config',
      [deviceId]
    );

    res.json({
      success: true,
      device_code: deviceCode,
      device_id: deviceId,
      effective_config: config.rows[0].config,
      note: 'Config merged from: Global → Site → Device (Device overrides win)'
    });

  } catch (error) {
    console.error('Get effective config error:', error);
    res.status(500).json({ error: 'Failed to get effective config' });
  }
}));

export default router;
