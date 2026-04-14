/**
 * siteManagementRoutes.js — Site Management APIs
 * Phase 2, Task 2.5-2.7: Complete CRUD for sites
 */
import express from 'express';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { pool } from '../db/pool.js';

const router = express.Router();

// ============================================================================
// POST /api/site-management/sites - Create New Site
// ============================================================================
router.post('/sites', requireAuth, requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const {
    site_name,
    city,
    country,
    timezone_offset = 'Asia/Dubai',
    latitude,
    longitude,
    location_address,
    site_config
  } = req.body;

  // Validation
  if (!site_name) {
    return res.status(400).json({ error: 'site_name is required' });
  }

  const customerId = req.auth?.scope?.customerId || 1;
  const userId = req.auth?.user?.id;

  // Default site config with all required fields
  const defaultConfig = {
    attendance_rules: {
      work_hours_start: "09:00",
      work_hours_end: "18:00",
      grace_period_minutes: 15,
      auto_checkout_enabled: true,
      auto_checkout_time: "20:00"
    },
    recognition_settings: {
      match_threshold: 0.38,
      confidence_threshold: 0.40,
      cooldown_seconds: 30
    },
    direction_detection: {
      enabled: true,
      entry_direction: "y_increasing",
      y_threshold_pixels: 45,
      tracking_window_frames: 4
    },
    unauthorized_access_policy: {
      action: "block_with_override",
      notify_employee: true,
      allow_override: true,
      flag_for_review: true,
      escalation_threshold: 3,
      escalation_recipients: ["admin@company.com"]
    }
  };

  // Merge user-provided config with defaults
  const mergedConfig = {
    ...defaultConfig,
    ...(site_config || {})
  };

  try {
    const result = await pool.query(`
      INSERT INTO frs_site (
        site_name, fk_customer_id, city, country, timezone_offset,
        latitude, longitude, location_address, site_config, 
        site_status, created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)
      RETURNING pk_site_id, site_name, city, country, timezone_offset, site_status
    `, [
      site_name, customerId, city, country, timezone_offset,
      latitude, longitude, location_address, 
      JSON.stringify(mergedConfig), userId
    ]);

    res.status(201).json({
      success: true,
      message: 'Site created successfully',
      site: result.rows[0]
    });

  } catch (error) {
    console.error('Create site error:', error);
    res.status(500).json({ error: 'Failed to create site' });
  }
}));

// ============================================================================
// GET /api/site-management/sites - List All Sites
// ============================================================================
router.get('/sites', requireAuth, requirePermission('devices.read'), asyncHandler(async (req, res) => {
  const { status, search } = req.query;
  const tenantId = req.auth?.scope?.tenantId || 1;

  try {
    let query = `
      SELECT 
        s.pk_site_id,
        s.site_name,
        s.city,
        s.country,
        s.timezone_offset,
        s.latitude,
        s.longitude,
        s.location_address,
        s.site_status,
        s.enhanced_at as created_at,
        c.customer_name,
        COUNT(DISTINCT sda.device_id) FILTER (WHERE sda.is_active = TRUE) as device_count
      FROM frs_site s
      JOIN frs_customer c ON c.pk_customer_id = s.fk_customer_id
      LEFT JOIN site_device_assignment sda ON sda.site_id = s.pk_site_id
      WHERE c.fk_tenant_id = $1
    `;

    const params = [tenantId];
    let paramIndex = 2;

    // Filter by status
    if (status) {
      query += ` AND s.site_status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Search by name or city
    if (search) {
      query += ` AND (s.site_name ILIKE $${paramIndex} OR s.city ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += `
      GROUP BY s.pk_site_id, s.site_name, s.city, s.country, s.timezone_offset,
               s.latitude, s.longitude, s.location_address, s.site_status, 
               s.enhanced_at, c.customer_name
      ORDER BY s.site_name ASC
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      sites: result.rows
    });

  } catch (error) {
    console.error('List sites error:', error);
    res.status(500).json({ error: 'Failed to list sites' });
  }
}));


// ============================================================================
// GET /api/site-management/sites/:siteId - Get Site Details
// ============================================================================
router.get('/sites/:siteId', requireAuth, requirePermission('devices.read'), asyncHandler(async (req, res) => {
  const { siteId } = req.params;

  try {
    // Get site with config
    const site = await pool.query(`
      SELECT 
        s.*,
        c.customer_name,
        jsonb_pretty(s.site_config) as site_config_formatted
      FROM frs_site s
      JOIN frs_customer c ON c.pk_customer_id = s.fk_customer_id
      WHERE s.pk_site_id = $1
    `, [siteId]);

    if (site.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // Get device count and list
    const devices = await pool.query(`
      SELECT 
        fd.pk_device_id,
        fd.external_device_id,
        fd.name,
        fd.status,
        dt.type_name,
        sda.device_role,
        sda.zone_name
      FROM site_device_assignment sda
      JOIN facility_device fd ON fd.pk_device_id = sda.device_id
      LEFT JOIN device_type dt ON dt.pk_device_type_id = fd.device_type_id
      WHERE sda.site_id = $1 AND sda.is_active = TRUE
      ORDER BY sda.assigned_at DESC
    `, [siteId]);

    res.json({
      success: true,
      site: site.rows[0],
      devices: devices.rows,
      device_count: devices.rows.length
    });

  } catch (error) {
    console.error('Get site details error:', error);
    res.status(500).json({ error: 'Failed to get site details' });
  }
}));

// ============================================================================
// PATCH /api/site-management/sites/:siteId - Update Site Config
// ============================================================================
router.patch('/sites/:siteId', requireAuth, requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const { siteId } = req.params;
  const { 
    site_name, 
    city, 
    country, 
    timezone_offset, 
    latitude, 
    longitude, 
    location_address,
    site_config 
  } = req.body;

  try {
    // Check if site exists
    const existing = await pool.query(
      'SELECT pk_site_id FROM frs_site WHERE pk_site_id = $1',
      [siteId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (site_name !== undefined) {
      updates.push(`site_name = $${paramIndex}`);
      params.push(site_name);
      paramIndex++;
    }

    if (city !== undefined) {
      updates.push(`city = $${paramIndex}`);
      params.push(city);
      paramIndex++;
    }

    if (country !== undefined) {
      updates.push(`country = $${paramIndex}`);
      params.push(country);
      paramIndex++;
    }

    if (timezone_offset !== undefined) {
      updates.push(`timezone_offset = $${paramIndex}`);
      params.push(timezone_offset);
      paramIndex++;
    }

    if (latitude !== undefined) {
      updates.push(`latitude = $${paramIndex}`);
      params.push(latitude);
      paramIndex++;
    }

    if (longitude !== undefined) {
      updates.push(`longitude = $${paramIndex}`);
      params.push(longitude);
      paramIndex++;
    }

    if (location_address !== undefined) {
      updates.push(`location_address = $${paramIndex}`);
      params.push(location_address);
      paramIndex++;
    }

    if (site_config !== undefined) {
      updates.push(`site_config = $${paramIndex}::jsonb`);
      params.push(JSON.stringify(site_config));
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Add WHERE clause param
    params.push(siteId);

    const query = `
      UPDATE frs_site
      SET ${updates.join(', ')}
      WHERE pk_site_id = $${paramIndex}
      RETURNING pk_site_id, site_name, city, country, site_status
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      message: 'Site updated successfully',
      site: result.rows[0]
    });

  } catch (error) {
    console.error('Update site error:', error);
    res.status(500).json({ error: 'Failed to update site' });
  }
}));


// ============================================================================
// DELETE /api/site-management/sites/:siteId - Decommission Site
// ============================================================================
router.delete('/sites/:siteId', requireAuth, requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const { siteId } = req.params;

  try {
    // Check if site exists
    const site = await pool.query(
      'SELECT pk_site_id, site_name FROM frs_site WHERE pk_site_id = $1',
      [siteId]
    );

    if (site.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // Check if site has active devices
    const devices = await pool.query(
      'SELECT COUNT(*) as count FROM site_device_assignment WHERE site_id = $1 AND is_active = TRUE',
      [siteId]
    );

    if (parseInt(devices.rows[0].count) > 0) {
      return res.status(409).json({ 
        error: 'Cannot decommission site with active device assignments',
        active_devices: parseInt(devices.rows[0].count)
      });
    }

    // Soft delete - mark as inactive
    await pool.query(`
      UPDATE frs_site
      SET site_status = 'inactive'
      WHERE pk_site_id = $1
    `, [siteId]);

    res.json({
      success: true,
      message: 'Site decommissioned successfully',
      site_id: siteId,
      site_name: site.rows[0].site_name
    });

  } catch (error) {
    console.error('Decommission site error:', error);
    res.status(500).json({ error: 'Failed to decommission site' });
  }
}));

export default router;
