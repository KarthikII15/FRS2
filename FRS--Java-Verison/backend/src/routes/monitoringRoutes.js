/**
 * monitoringRoutes.js — Monitoring & Metrics APIs
 * Phase 2, Task 2.9-2.10: Real-time status and historical metrics
 */
import express from 'express';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { pool } from '../db/pool.js';

const router = express.Router();

// ============================================================================
// GET /api/monitoring/devices/status - Real-time Device Status Dashboard
// ============================================================================
router.get('/devices/status', requireAuth, requirePermission('devices.read'), asyncHandler(async (req, res) => {
  const tenantId = req.auth?.scope?.tenantId || 1;
  const siteId = req.query.site_id; // Optional filter

  try {
    // Summary counts
    const summary = await pool.query(`
      SELECT 
        COUNT(*) as total_devices,
        COUNT(*) FILTER (WHERE status = 'online') as online_count,
        COUNT(*) FILTER (WHERE status = 'offline') as offline_count,
        COUNT(*) FILTER (WHERE status = 'error') as error_count,
        COUNT(*) FILTER (WHERE decommissioned_at IS NOT NULL) as decommissioned_count
      FROM facility_device
      WHERE tenant_id = $1
    `, [tenantId]);

    // Per-device status with health metrics
    let deviceQuery = `
      SELECT 
        fd.pk_device_id,
        fd.external_device_id,
        fd.name,
        fd.status,
        fd.ip_address,
        fd.last_active,
        fd.last_heartbeat,
        fd.recognition_accuracy,
        fd.total_scans,
        fd.error_rate,
        dt.type_name as device_type,
        dt.category as device_category,
        s.site_name,
        s.pk_site_id as site_id,
        sda.device_role,
        sda.zone_name,
        CASE 
          WHEN fd.last_heartbeat IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (NOW() - fd.last_heartbeat))::INTEGER
          ELSE NULL
        END as seconds_since_heartbeat,
        CASE 
          WHEN fd.last_heartbeat IS NOT NULL AND fd.last_heartbeat > NOW() - INTERVAL '60 seconds'
          THEN 'healthy'
          WHEN fd.last_heartbeat IS NOT NULL AND fd.last_heartbeat > NOW() - INTERVAL '5 minutes'
          THEN 'degraded'
          WHEN fd.status = 'online'
          THEN 'no_heartbeat'
          ELSE 'offline'
        END as health_status
      FROM facility_device fd
      LEFT JOIN device_type dt ON dt.pk_device_type_id = fd.device_type_id
      LEFT JOIN site_device_assignment sda ON sda.device_id = fd.pk_device_id AND sda.is_active = TRUE
      LEFT JOIN frs_site s ON s.pk_site_id = sda.site_id
      WHERE fd.tenant_id = $1
        AND fd.decommissioned_at IS NULL
    `;

    const params = [tenantId];
    if (siteId) {
      deviceQuery += ' AND sda.site_id = $2';
      params.push(siteId);
    }

    deviceQuery += ' ORDER BY fd.status ASC, fd.last_active DESC';

    const devices = await pool.query(deviceQuery, params);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: summary.rows[0],
      devices: devices.rows,
      refresh_interval_seconds: 10
    });

  } catch (error) {
    console.error('Get device status error:', error);
    res.status(500).json({ error: 'Failed to get device status' });
  }
}));




// ============================================================================
// GET /api/monitoring/devices/:code/metrics - Historical Device Metrics
// ============================================================================
router.get('/devices/:code/metrics', requireAuth, requirePermission('devices.read'), asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { hours = 24 } = req.query;
  const tenantId = req.auth?.scope?.tenantId || 1;

  try {
    // Get device
    const device = await pool.query(
      'SELECT pk_device_id FROM facility_device WHERE tenant_id = $1 AND external_device_id = $2',
      [tenantId, code]
    );

    if (device.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceId = device.rows[0].pk_device_id;
    const heartbeats = await pool.query(`
      SELECT 
        timestamp as heartbeat_time,
        status,
        metrics,
        response_time_ms,
        ip_address,
        created_at
      FROM device_heartbeat
      WHERE device_id = $1
        AND timestamp > NOW() - INTERVAL '${parseInt(hours)} hours'
      ORDER BY timestamp DESC
      LIMIT 1000
    `, [deviceId]);

    // Get status change history
    const statusHistory = await pool.query(`
      SELECT 
        changed_at,
        old_status,
        new_status,
        transition_reason
      FROM device_status_history
      WHERE device_id = $1
        AND changed_at > NOW() - INTERVAL '${parseInt(hours)} hours'
      ORDER BY changed_at DESC
      LIMIT 100
    `, [deviceId]);

    res.json({
      success: true,
      device_code: code,
      time_range_hours: parseInt(hours),
      heartbeat_count: heartbeats.rows.length,
      heartbeats: heartbeats.rows,
      status_changes: statusHistory.rows
    });

  } catch (error) {
    console.error('Get device metrics error:', error);
    res.status(500).json({ error: 'Failed to get device metrics' });
  }
}));




// ============================================================================
// GET /api/monitoring/alerts - Active Alerts
// ============================================================================
router.get('/alerts', requireAuth, requirePermission('devices.read'), asyncHandler(async (req, res) => {
  const tenantId = req.auth?.scope?.tenantId || 1;
  const { severity, acknowledged } = req.query;

  try {
    let query = `
      SELECT 
        ua.pk_log_id as alert_id,
        ua.attempt_timestamp as alert_time,
        ua.employee_id,
        e.full_name as employee_name,
        ua.device_id,
        fd.external_device_id,
        fd.name as device_name,
        s.site_name,
        ua.confidence_score as detection_confidence,
        ua.face_image_path as snapshot_path,
        'unauthorized_access' as alert_type,
        CASE 
          WHEN ua.confidence_score < 0.3 THEN 'high'
          WHEN ua.confidence_score < 0.35 THEN 'medium'
          ELSE 'low'
        END as severity,
        ua.resolved_at IS NOT NULL as is_acknowledged,
        ua.resolved_by as acknowledged_by,
        ua.resolution_notes
      FROM unauthorized_access_log ua
      LEFT JOIN hr_employee e ON e.pk_employee_id = ua.employee_id
      LEFT JOIN facility_device fd ON fd.pk_device_id = ua.device_id
      LEFT JOIN site_device_assignment sda ON sda.device_id = fd.pk_device_id AND sda.is_active = TRUE
      LEFT JOIN frs_site s ON s.pk_site_id = sda.site_id
      WHERE fd.tenant_id = $1
    `;

    const params = [tenantId];
    let paramIndex = 2;

    if (acknowledged === 'false') {
      query += ` AND ua.resolved_at IS NULL`;
    } else if (acknowledged === 'true') {
      query += ` AND ua.resolved_at IS NOT NULL`;
    }

    query += ` ORDER BY ua.attempt_timestamp DESC LIMIT 100`;

    const alerts = await pool.query(query, params);

    // Count by severity
    const counts = {
      total: alerts.rows.length,
      high: alerts.rows.filter(a => a.severity === 'high').length,
      medium: alerts.rows.filter(a => a.severity === 'medium').length,
      low: alerts.rows.filter(a => a.severity === 'low').length,
      unacknowledged: alerts.rows.filter(a => !a.is_acknowledged).length
    };

    res.json({
      success: true,
      counts,
      alerts: alerts.rows
    });

  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
}));

// ============================================================================
// POST /api/monitoring/alerts/:alertId/acknowledge - Acknowledge Alert
// ============================================================================
router.post('/alerts/:alertId/acknowledge', requireAuth, requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const { alertId } = req.params;
  const { resolution_notes } = req.body;
  const userId = req.auth?.user?.id;

  try {
    const result = await pool.query(`
      UPDATE unauthorized_access_log
      SET resolved = TRUE,
          resolved_at = NOW(),
          resolved_by = $1,
          resolution_notes = $2
      WHERE pk_log_id = $3
      RETURNING pk_log_id, resolved_at as acknowledged_at
    `, [userId, resolution_notes, alertId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({
      success: true,
      message: 'Alert acknowledged successfully',
      alert_id: alertId,
      acknowledged_at: result.rows[0].acknowledged_at
    });

  } catch (error) {
    console.error('Acknowledge alert error:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
}));

export default router;
