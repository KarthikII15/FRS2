import express from 'express';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { buildScopeWhere } from '../repositories/scopeSql.js';

const router = express.Router();
router.use(requireAuth);

// 1. GET ALL SITES (Registry List)
router.get('/', requirePermission('devices.read'), asyncHandler(async (req, res) => {
  const scope = req.auth?.scope || {};

  // SECURITY FIX: Apply scope filtering
  const { whereSql, values } = buildScopeWhere(scope, 's');

  const { rows } = await pool.query(
    `SELECT s.pk_site_id as id, s.site_name as name, s.timezone, s.timezone_label,
     s.location_address as address FROM frs_site s WHERE ${whereSql} ORDER BY s.site_name`,
    values
  );
  return res.json({ data: rows, scope });
}));

// 2. GET CURRENT SITE SETTINGS
router.get('/settings', asyncHandler(async (req, res) => {
  const siteId = req.headers['x-site-id'] || '1';
  const { rows } = await pool.query(
    `SELECT pk_site_id, site_name, timezone, timezone_label, location_address FROM frs_site WHERE pk_site_id = $1`,
    [Number(siteId)]
  );
  if (!rows.length) return res.status(404).json({ message: 'Site not found' });
  return res.json(rows[0]);
}));

// 3. CREATE NEW SITE
router.post('/', requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const { name, timezone, address } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO frs_site (site_name, timezone, timezone_label, location_address) 
     VALUES ($1, $2, $2, $3) RETURNING *`,
    [name, timezone || 'UTC', address || '']
  );
  res.status(201).json(rows[0]);
}));

// 4. UPDATE SITE (Timezone + Metadata)
router.patch('/settings', requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const siteId = req.headers['x-site-id'] || '1';
  const { name, timezone, timezone_label, address } = req.body;
  
  const { rows } = await pool.query(
    `UPDATE frs_site SET
        site_name = COALESCE($1, site_name),
        timezone = COALESCE($2, timezone),
        timezone_label = COALESCE($3, timezone_label),
        location_address = COALESCE($4, location_address)
     WHERE pk_site_id = $5
     RETURNING pk_site_id, site_name, timezone, timezone_label, location_address`,
    [name, timezone, timezone_label, address, Number(siteId)]
  );
  await writeAudit({ req, action: 'settings.update',
    details: `Site settings updated: name=${name || rows[0]?.site_name}, timezone=${timezone || rows[0]?.timezone}`,
    entityType: 'site', entityId: String(siteId), source: 'ui',
    after_data: JSON.stringify({ name, timezone, timezone_label, address })
  }).catch(() => {});
  return res.json(rows[0]);
}));

import { writeAudit } from '../middleware/auditLog.js';
export { router as siteRoutes };
