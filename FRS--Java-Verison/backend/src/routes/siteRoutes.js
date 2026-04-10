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
  const tenantId = scope.tenantId;

  if (!tenantId) return res.status(400).json({ message: 'tenantId is required in scope' });

  const { rows } = await pool.query(
    `SELECT s.pk_site_id as id, s.site_name as name, s.timezone, s.timezone_label,
     s.location_address as address, c.customer_name 
     FROM frs_site s 
     JOIN frs_customer c ON s.fk_customer_id = c.pk_customer_id
     WHERE c.fk_tenant_id = $1 ORDER BY s.site_name`,
    [Number(tenantId)]
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
  const { name, timezone, address, customerId } = req.body;
  if (!customerId) return res.status(400).json({ message: 'customerId is required' });
  
  const creatorId = req.auth.user.id;
  const currentMembership = req.auth.memberships[0]; // Active membership used for this request
  const tenantId = req.auth.scope.tenantId;

  await pool.query('BEGIN');
  try {
    const { rows: siteRows } = await pool.query(
      `INSERT INTO frs_site (site_name, fk_customer_id, timezone, timezone_label, location_address, status) 
       VALUES ($1, $2, $3, $3, $4, 'active') RETURNING pk_site_id as id, site_name as name`,
      [name, Number(customerId), timezone || 'UTC', address || '']
    );
    const newSiteId = siteRows[0].id;

    // AUTO-GRANT MEMBERSHIP: Link the creator to the new site if they don't have global access
    const isGlobalAdmin = !currentMembership.site_id;
    if (!isGlobalAdmin) {
      await pool.query(
        `INSERT INTO frs_user_membership (fk_user_id, role, tenant_id, customer_id, site_id, permissions)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [
          Number(creatorId),
          currentMembership.role,
          Number(tenantId),
          Number(customerId),
          Number(newSiteId),
          currentMembership.permissions
        ]
      );
    }

    await pool.query('COMMIT');
    res.status(201).json(siteRows[0]);
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
}));

// 4. UPDATE SITE (Timezone + Metadata + Status)
router.patch('/settings', requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const siteId = req.headers['x-site-id'] || req.body.siteId;
  const { name, timezone, timezone_label, address, status } = req.body;
  
  if (!siteId) return res.status(400).json({ message: 'Site ID is required' });

  const { rows } = await pool.query(
    `UPDATE frs_site SET
        site_name = COALESCE($1, site_name),
        timezone = COALESCE($2, timezone),
        timezone_label = COALESCE($3, timezone_label),
        location_address = COALESCE($4, location_address),
        status = COALESCE($5, status)
     WHERE pk_site_id = $6
     RETURNING pk_site_id, site_name, timezone, timezone_label, location_address, status`,
    [name, timezone, timezone_label, address, status, Number(siteId)]
  );
  if (!rows.length) return res.status(404).json({ message: 'Site not found' });

  await writeAudit({ req, action: 'site.update',
    details: `Site updated: ${rows[0].site_name} (Status: ${rows[0].status})`,
    entityType: 'site', entityId: String(siteId), source: 'ui',
    after_data: JSON.stringify(rows[0])
  }).catch(() => {});
  return res.json(rows[0]);
}));

// 5. DELETE SITE
router.post('/delete', requirePermission('devices.write'), asyncHandler(async (req, res) => {
  const { siteId } = req.body;
  if (!siteId) return res.status(400).json({ message: 'siteId is required' });

  await pool.query('BEGIN');
  try {
    // 1. Delete dependent data that doesn't cascade
    await pool.query(`DELETE FROM frs_user_membership WHERE site_id = $1`, [Number(siteId)]);
    await pool.query(`DELETE FROM frs_unit WHERE fk_site_id = $1`, [Number(siteId)]);
    
    // 2. Delete buildings (if they don't cascade to floors/zones, this might still fail)
    // Actually Buildings in 009 have CASCADE for floors, so deleting building is enough.
    await pool.query(`DELETE FROM frs_building WHERE fk_site_id = $1`, [Number(siteId)]);
    
    // 3. Delete the site itself
    const { rowCount } = await pool.query(`DELETE FROM frs_site WHERE pk_site_id = $1`, [Number(siteId)]);
    
    if (!rowCount) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ message: 'Site not found' });
    }

    await writeAudit({ req, action: 'site.delete',
      details: `Site deleted ID: ${siteId}`,
      entityType: 'site', entityId: String(siteId), source: 'ui'
    }).catch(() => {});

    await pool.query('COMMIT');
    res.json({ success: true, message: 'Site deleted successfully' });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('[site.delete] Error:', err);
    res.status(500).json({ 
      message: 'Failed to delete site. Some active resources may still be attached.' 
    });
  }
}));

import { writeAudit } from '../middleware/auditLog.js';
export { router as siteRoutes };
