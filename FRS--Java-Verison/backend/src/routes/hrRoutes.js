/**
 * hrRoutes.js — HR management: departments, shifts, leave
 */
import express from 'express';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { pool } from '../db/pool.js';

const router = express.Router();
router.use(requireAuth);

import { writeAudit } from '../middleware/auditLog.js';
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

router.post('/departments', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { name, code, color } = req.body;
  if (!name || !code) return res.status(400).json({ message: 'name and code required' });
  const { rows } = await pool.query(
    `INSERT INTO hr_department (tenant_id, name, code, color) VALUES ($1,$2,$3,$4)
     ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, color=EXCLUDED.color
     RETURNING pk_department_id as id, name, code, color`,
    [getTenant(req), name, code.toUpperCase(), color || null]
  );
  await writeAudit({ req, action: 'dept.create', details: `Department created: ${name} (${code})` });
  return res.status(201).json(rows[0]);
}));

router.put('/departments/:id', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { name, code, color } = req.body;
  const { rows } = await pool.query(
    `UPDATE hr_department SET name=COALESCE($2,name), code=COALESCE($3,code), color=COALESCE($4,color)
     WHERE pk_department_id=$1 AND tenant_id=$5 RETURNING pk_department_id as id, name, code, color`,
    [req.params.id, name, code, color, getTenant(req)]
  );
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  return res.json(rows[0]);
}));

router.delete('/departments/:id', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  await pool.query(
    `DELETE FROM hr_department WHERE pk_department_id=$1 AND tenant_id=$2`,
    [req.params.id, getTenant(req)]
  );
  await writeAudit({ req, action: 'dept.delete', details: `Department ${req.params.id} deleted` });
  return res.json({ success: true });
}));


// Assign employees to a department
router.post('/departments/:id/assign', requirePermission('users.write'), asyncHandler(async (req, res) => {
  const { employee_ids } = req.body;
  if (!Array.isArray(employee_ids)) return res.status(400).json({ message: 'employee_ids array required' });
  await pool.query(
    `UPDATE hr_employee SET fk_department_id=$1 WHERE pk_employee_id = ANY($2::bigint[]) AND tenant_id=$3`,
    [req.params.id, employee_ids, getTenant(req)]
  );
  await writeAudit({ req, action: 'dept.assign',
      details: `Department ${req.params.id} assigned to ${employee_ids.length} employee(s): [${employee_ids.join(',')}]` });
  return res.json({ success: true, updated: employee_ids.length });
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

router.post('/shifts', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { name, shift_type, start_time, end_time, grace_period_minutes = 10, is_flexible = false } = req.body;
  if (!name || !shift_type) return res.status(400).json({ message: 'name and shift_type required' });
  const { rows } = await pool.query(
    `INSERT INTO hr_shift (tenant_id, name, shift_type, start_time, end_time, grace_period_minutes, is_flexible)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [getTenant(req), name, shift_type, start_time || null, end_time || null, grace_period_minutes, is_flexible]
  );
  return res.status(201).json(rows[0]);
}));

router.put('/shifts/:id', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
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

router.delete('/shifts/:id', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  // Unassign employees from this shift before deleting
  await pool.query(`UPDATE hr_employee SET fk_shift_id=NULL WHERE fk_shift_id=$1`, [req.params.id]);
  await pool.query(`DELETE FROM hr_shift WHERE pk_shift_id=$1 AND tenant_id=$2`, [req.params.id, getTenant(req)]);
  return res.json({ success: true });
}));

// Assign shift to employees
router.post('/shifts/:id/assign', requirePermission('users.write'), asyncHandler(async (req, res) => {
  const { employee_ids } = req.body;
  if (!Array.isArray(employee_ids)) return res.status(400).json({ message: 'employee_ids array required' });
  await pool.query(
    `UPDATE hr_employee SET fk_shift_id=$1 WHERE pk_employee_id = ANY($2::bigint[]) AND tenant_id=$3`,
    [req.params.id, employee_ids, getTenant(req)]
  );
  await writeAudit({ req, action: 'shift.assign',
      details: `Shift ${req.params.id} assigned to ${employee_ids.length} employee(s): [${employee_ids.join(',')}]` });
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



// ── Roster Routes ──────────────────────────────────────────────
// GET /hr/roster?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/roster', requirePermission('users.read'), asyncHandler(async (req, res) => {
  const { start, end } = req.query;
  const tenantId = getTenant(req);
  if (!start || !end) return res.status(400).json({ message: 'start and end dates required' });
  const { rows } = await pool.query(`
    SELECT r.*, 
           e.full_name, e.employee_code,
           s.name as shift_name, s.shift_type, s.start_time, s.end_time,
           d.name as department_name,
           sw.full_name as swapped_with_name
    FROM hr_roster r
    JOIN hr_employee e ON e.pk_employee_id = r.fk_employee_id
    JOIN hr_shift s ON s.pk_shift_id = r.fk_shift_id
    LEFT JOIN hr_department d ON d.pk_department_id = e.fk_department_id
    LEFT JOIN hr_employee sw ON sw.pk_employee_id = r.swapped_with
    WHERE r.tenant_id = $1 AND r.roster_date BETWEEN $2 AND $3
    ORDER BY r.roster_date, e.full_name
  `, [tenantId, start, end]);
  return res.json({ data: rows });
}));

// POST /hr/roster — create single or bulk roster entries
router.post('/roster', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { entries } = req.body; // [{employee_id, shift_id, date, notes}]
  if (!Array.isArray(entries) || !entries.length) return res.status(400).json({ message: 'entries array required' });
  const tenantId = getTenant(req);
  const results = [];
  for (const entry of entries) {
    const { rows } = await pool.query(`
      INSERT INTO hr_roster (tenant_id, fk_employee_id, fk_shift_id, roster_date, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, fk_employee_id, roster_date) 
      DO UPDATE SET fk_shift_id = EXCLUDED.fk_shift_id, notes = EXCLUDED.notes
      RETURNING *
    `, [tenantId, entry.employee_id, entry.shift_id, entry.date, entry.notes || null, req.auth?.user?.id || null]);
    results.push(rows[0]);
  }
  await writeAudit({ req, action: 'roster.create',
    details: `Roster created: ${results.length} entries`,
    entityType: 'roster', source: 'ui'
  });
  return res.status(201).json({ data: results, count: results.length });
}));

// POST /hr/roster/recurring — set weekly recurring schedule
router.post('/roster/recurring', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { employee_id, shift_id, day_of_week, weeks_ahead = 4, notes } = req.body;
  if (!employee_id || !shift_id || day_of_week === undefined) return res.status(400).json({ message: 'employee_id, shift_id, day_of_week required' });
  const tenantId = getTenant(req);
  const entries = [];
  const today = new Date();
  for (let w = 0; w < weeks_ahead; w++) {
    const d = new Date(today);
    d.setDate(d.getDate() + (7 * w) + ((day_of_week - d.getDay() + 7) % 7));
    if (d < today) d.setDate(d.getDate() + 7);
    entries.push(d.toISOString().slice(0, 10));
  }
  const results = [];
  for (const date of entries) {
    const { rows } = await pool.query(`
      INSERT INTO hr_roster (tenant_id, fk_employee_id, fk_shift_id, roster_date, is_recurring, recur_day_of_week, notes, created_by)
      VALUES ($1, $2, $3, $4, true, $5, $6, $7)
      ON CONFLICT (tenant_id, fk_employee_id, roster_date)
      DO UPDATE SET fk_shift_id = EXCLUDED.fk_shift_id, is_recurring = true, recur_day_of_week = EXCLUDED.recur_day_of_week
      RETURNING *
    `, [tenantId, employee_id, shift_id, date, day_of_week, notes || null, req.auth?.user?.id || null]);
    results.push(rows[0]);
  }
  return res.status(201).json({ data: results, count: results.length });
}));

// PATCH /hr/roster/:id/swap — swap shift between employees
router.patch('/roster/:id/swap', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { swap_with_employee_id } = req.body;
  if (!swap_with_employee_id) return res.status(400).json({ message: 'swap_with_employee_id required' });
  const tenantId = getTenant(req);
  const { rows: original } = await pool.query('SELECT * FROM hr_roster WHERE pk_roster_id=$1 AND tenant_id=$2', [req.params.id, tenantId]);
  if (!original.length) return res.status(404).json({ message: 'Roster entry not found' });
  const orig = original[0];
  // Create swap entry for the other employee
  await pool.query(`
    INSERT INTO hr_roster (tenant_id, fk_employee_id, fk_shift_id, roster_date, status, swapped_with, notes)
    VALUES ($1, $2, $3, $4, 'swapped', $5, 'Swapped shift')
    ON CONFLICT (tenant_id, fk_employee_id, roster_date) DO UPDATE SET fk_shift_id=EXCLUDED.fk_shift_id, status='swapped', swapped_with=EXCLUDED.swapped_with
  `, [tenantId, swap_with_employee_id, orig.fk_shift_id, orig.roster_date, orig.fk_employee_id]);
  // Update original
  const { rows } = await pool.query('UPDATE hr_roster SET status=$1, swapped_with=$2 WHERE pk_roster_id=$3 RETURNING *', ['swapped', swap_with_employee_id, req.params.id]);
  return res.json(rows[0]);
}));

// DELETE /hr/roster/:id
router.delete('/roster/:id', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM hr_roster WHERE pk_roster_id=$1 AND tenant_id=$2', [req.params.id, getTenant(req)]);
  await writeAudit({ req, action: 'roster.delete',
    details: `Roster entry ${req.params.id} deleted`,
    entityType: 'roster', entityId: req.params.id, source: 'ui'
  });
  return res.json({ success: true });
}));
export { router as hrRoutes };
