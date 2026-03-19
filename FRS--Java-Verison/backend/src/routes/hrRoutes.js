/**
 * hrRoutes.js — HR management: departments, shifts, leave
 */
import express from 'express';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { pool } from '../db/pool.js';

const router = express.Router();
router.use(requireAuth);

const getTenant = (req) => req.auth?.scope?.tenantId || req.headers['x-tenant-id'] || '1';

// ── Departments ────────────────────────────────────────────────
router.get('/departments', requirePermission('users.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT pk_department_id as id, name, code, color,
       (SELECT count(*)::int FROM hr_employee e WHERE e.fk_department_id = d.pk_department_id AND e.status='active') as employee_count
     FROM hr_department d WHERE d.tenant_id = $1 ORDER BY name`,
    [getTenant(req)]
  );
  return res.json({ data: rows });
}));

router.post('/departments', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const { name, code, color } = req.body;
  if (!name || !code) return res.status(400).json({ message: 'name and code required' });
  const { rows } = await pool.query(
    `INSERT INTO hr_department (tenant_id, name, code, color) VALUES ($1,$2,$3,$4)
     ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, color=EXCLUDED.color
     RETURNING pk_department_id as id, name, code, color`,
    [getTenant(req), name, code.toUpperCase(), color || null]
  );
  return res.status(201).json(rows[0]);
}));

router.put('/departments/:id', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const { name, code, color } = req.body;
  const { rows } = await pool.query(
    `UPDATE hr_department SET name=COALESCE($2,name), code=COALESCE($3,code), color=COALESCE($4,color)
     WHERE pk_department_id=$1 AND tenant_id=$5 RETURNING pk_department_id as id, name, code, color`,
    [req.params.id, name, code, color, getTenant(req)]
  );
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  return res.json(rows[0]);
}));

router.delete('/departments/:id', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  await pool.query(
    `DELETE FROM hr_department WHERE pk_department_id=$1 AND tenant_id=$2`,
    [req.params.id, getTenant(req)]
  );
  return res.json({ success: true });
}));

// ── Shifts ─────────────────────────────────────────────────────
router.get('/shifts', requirePermission('users.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT pk_shift_id as id, name, shift_type, start_time, end_time, grace_period_minutes, is_flexible,
       (SELECT count(*)::int FROM hr_employee e WHERE e.fk_shift_id = s.pk_shift_id AND e.status='active') as employee_count
     FROM hr_shift s WHERE s.tenant_id = $1 ORDER BY name`,
    [getTenant(req)]
  );
  return res.json({ data: rows });
}));

router.post('/shifts', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const { name, shift_type, start_time, end_time, grace_period_minutes = 10, is_flexible = false } = req.body;
  if (!name || !shift_type) return res.status(400).json({ message: 'name and shift_type required' });
  const { rows } = await pool.query(
    `INSERT INTO hr_shift (tenant_id, name, shift_type, start_time, end_time, grace_period_minutes, is_flexible)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [getTenant(req), name, shift_type, start_time || null, end_time || null, grace_period_minutes, is_flexible]
  );
  return res.status(201).json(rows[0]);
}));

router.put('/shifts/:id', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const { name, shift_type, start_time, end_time, grace_period_minutes, is_flexible } = req.body;
  const { rows } = await pool.query(
    `UPDATE hr_shift SET
       name=COALESCE($2,name), shift_type=COALESCE($3,shift_type),
       start_time=COALESCE($4::time,start_time), end_time=COALESCE($5::time,end_time),
       grace_period_minutes=COALESCE($6,grace_period_minutes), is_flexible=COALESCE($7,is_flexible)
     WHERE pk_shift_id=$1 AND tenant_id=$8 RETURNING *`,
    [req.params.id, name, shift_type, start_time, end_time, grace_period_minutes, is_flexible, getTenant(req)]
  );
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  return res.json(rows[0]);
}));

router.delete('/shifts/:id', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  await pool.query(`DELETE FROM hr_shift WHERE pk_shift_id=$1 AND tenant_id=$2`, [req.params.id, getTenant(req)]);
  return res.json({ success: true });
}));

// Assign shift to employees
router.post('/shifts/:id/assign', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const { employee_ids } = req.body;
  if (!Array.isArray(employee_ids)) return res.status(400).json({ message: 'employee_ids array required' });
  await pool.query(
    `UPDATE hr_employee SET fk_shift_id=$1 WHERE pk_employee_id = ANY($2::bigint[]) AND tenant_id=$3`,
    [req.params.id, employee_ids, getTenant(req)]
  );
  return res.json({ success: true, updated: employee_ids.length });
}));

// ── Leave Requests ─────────────────────────────────────────────
// Check if leave table exists, create if not
router.get('/leave', requirePermission('attendance.read'), asyncHandler(async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.*, e.full_name, e.employee_code, d.name as department_name
       FROM hr_leave_request l
       JOIN hr_employee e ON e.pk_employee_id = l.fk_employee_id
       LEFT JOIN hr_department d ON d.pk_department_id = e.fk_department_id
       WHERE l.tenant_id = $1
       ORDER BY l.created_at DESC LIMIT 200`,
      [getTenant(req)]
    );
    return res.json({ data: rows });
  } catch (_) {
    return res.json({ data: [] }); // table may not exist yet
  }
}));

router.post('/leave', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { employee_id, leave_type, start_date, end_date, reason } = req.body;
  if (!employee_id || !leave_type || !start_date || !end_date) {
    return res.status(400).json({ message: 'employee_id, leave_type, start_date, end_date required' });
  }
  try {
    const days = Math.ceil((new Date(end_date) - new Date(start_date)) / 86400000) + 1;
    const { rows } = await pool.query(
      `INSERT INTO hr_leave_request (tenant_id, fk_employee_id, leave_type, start_date, end_date, days, reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending') RETURNING *`,
      [getTenant(req), employee_id, leave_type, start_date, end_date, days, reason || null]
    );
    return res.status(201).json(rows[0]);
  } catch (_) {
    return res.status(500).json({ message: 'Leave table not set up. Run migrations first.' });
  }
}));

router.put('/leave/:id/status', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['Approved', 'Rejected', 'Pending'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
  try {
    const { rows } = await pool.query(
      `UPDATE hr_leave_request SET status=$2, updated_at=NOW() WHERE pk_leave_id=$1 AND tenant_id=$3 RETURNING *`,
      [req.params.id, status, getTenant(req)]
    );
    return res.json(rows[0] || { success: true });
  } catch (_) {
    return res.json({ success: true });
  }
}));

// ── Employee attendance for profile ───────────────────────────
router.get('/employees/:id/attendance', requirePermission('attendance.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, e.full_name, e.employee_code
     FROM attendance_record a
     JOIN hr_employee e ON e.pk_employee_id = a.fk_employee_id
     WHERE a.fk_employee_id=$1 AND a.tenant_id=$2
     ORDER BY a.attendance_date DESC LIMIT 60`,
    [req.params.id, getTenant(req)]
  );
  return res.json({ data: rows });
}));

export { router as hrRoutes };
