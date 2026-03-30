import express from 'express';
import { requireAuth } from '../middleware/authz.js';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/site/settings
router.get('/settings', asyncHandler(async (req, res) => {
  const siteId = req.headers['x-site-id'] || '1';
  const { rows } = await pool.query(
    `SELECT pk_site_id, site_name, timezone, timezone_label FROM frs_site WHERE pk_site_id = $1`,
    [Number(siteId)]
  );
  if (!rows.length) return res.status(404).json({ message: 'Site not found' });
  return res.json(rows[0]);
}));

// PATCH /api/site/settings
router.patch('/settings', asyncHandler(async (req, res) => {
  const siteId = req.headers['x-site-id'] || '1';
  const { timezone, timezone_label } = req.body;
  if (!timezone) return res.status(400).json({ message: 'timezone is required' });
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    return res.status(400).json({ message: 'Invalid IANA timezone' });
  }
  const { rows } = await pool.query(
    `UPDATE frs_site SET timezone = $1, timezone_label = $2 WHERE pk_site_id = $3
     RETURNING pk_site_id, site_name, timezone, timezone_label`,
    [timezone, timezone_label || timezone, Number(siteId)]
  );
  return res.json(rows[0]);
}));

export { router as siteRoutes };
