import express from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = express.Router();
router.use(requireAuth);

function getUserId(req) {
  return Number(req.auth?.user?.id || 1);
}

// ── Get roster entries for date range ──────────────────────────────────────
router.get('/', 
  requirePermission('shifts.read'),
  asyncHandler(async (req, res) => {
    const { start, end } = req.query;

    const { rows } = await pool.query(`
      SELECT 
        r.*,
        e.full_name,
        e.employee_code,
        d.name as department_name,
        s.name as shift_name,
        s.shift_type,
        s.start_time,
        s.end_time,
        swap_emp.full_name as swapped_with_name
      FROM hr_roster r
      JOIN hr_employee e ON r.fk_employee_id = e.pk_employee_id
      LEFT JOIN hr_department d ON e.fk_department_id = d.pk_department_id
      JOIN hr_shift s ON r.fk_shift_id = s.pk_shift_id
      LEFT JOIN hr_employee swap_emp ON r.swapped_with = swap_emp.pk_employee_id
      WHERE r.roster_date >= $1 AND r.roster_date <= $2
      ORDER BY r.roster_date, e.full_name
    `, [start, end]);

    res.json({ success: true, data: rows });
  })
);

// ── Create roster entries (bulk) ────────────────────────────────────────────
router.post('/',
  requirePermission('shifts.assign'),
  asyncHandler(async (req, res) => {
    const { entries } = req.body;  // Array of { employee_id, shift_id, date, notes }
    const userId = getUserId(req);

    if (!entries || !Array.isArray(entries)) {
      return res.status(400).json({ message: 'entries array required' });
    }

    const results = [];
    for (const entry of entries) {
      const { employee_id, shift_id, date, notes } = entry;

      const { rows } = await pool.query(`
        INSERT INTO hr_roster (
          fk_employee_id, fk_shift_id, roster_date, notes, created_by
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (fk_employee_id, roster_date) 
        DO UPDATE SET 
          fk_shift_id = EXCLUDED.fk_shift_id,
          notes = EXCLUDED.notes,
          updated_at = NOW()
        RETURNING *
      `, [employee_id, shift_id, date, notes || null, userId]);

      results.push(rows[0]);
    }

    res.json({ success: true, created: results.length, data: results });
  })
);

// ── Create recurring roster (e.g., every Monday for next N weeks) ───────────
router.post('/recurring',
  requirePermission('shifts.assign'),
  asyncHandler(async (req, res) => {
    const { employee_id, shift_id, day_of_week, weeks_ahead = 4 } = req.body;
    const userId = getUserId(req);

    if (!employee_id || !shift_id || day_of_week === undefined) {
      return res.status(400).json({ message: 'employee_id, shift_id, and day_of_week required' });
    }

    // Generate dates for next N weeks
    const dates = [];
    const today = new Date();
    const targetDay = Number(day_of_week);

    for (let week = 0; week < weeks_ahead; week++) {
      const d = new Date(today);
      d.setDate(d.getDate() + (targetDay - d.getDay() + 7) % 7 + (week * 7));
      dates.push(d.toISOString().slice(0, 10));
    }

    // Insert all dates
    const results = [];
    for (const date of dates) {
      const { rows } = await pool.query(`
        INSERT INTO hr_roster (
          fk_employee_id, fk_shift_id, roster_date, is_recurring, 
          recur_day_of_week, created_by
        )
        VALUES ($1, $2, $3, true, $4, $5)
        ON CONFLICT (fk_employee_id, roster_date) DO NOTHING
        RETURNING *
      `, [employee_id, shift_id, date, day_of_week, userId]);

      if (rows.length > 0) results.push(rows[0]);
    }

    res.json({ success: true, created: results.length, dates });
  })
);

// ── Request shift swap ──────────────────────────────────────────────────────
router.patch('/:rosterId/swap',
  requirePermission('shifts.assign'),
  asyncHandler(async (req, res) => {
    const { rosterId } = req.params;
    const { swap_with_employee_id } = req.body;

    const { rows } = await pool.query(`
      UPDATE hr_roster 
      SET 
        swapped_with = $2,
        swap_approved = false,
        updated_at = NOW()
      WHERE pk_roster_id = $1
      RETURNING *
    `, [rosterId, swap_with_employee_id]);

    res.json({ success: true, data: rows[0] });
  })
);

// ── Approve shift swap ──────────────────────────────────────────────────────
router.patch('/:rosterId/approve-swap',
  requirePermission('shifts.assign'),
  asyncHandler(async (req, res) => {
    const { rosterId } = req.params;
    const userId = getUserId(req);

    const { rows } = await pool.query(`
      UPDATE hr_roster 
      SET 
        swap_approved = true,
        swap_approved_by = $2,
        swap_approved_at = NOW(),
        updated_at = NOW()
      WHERE pk_roster_id = $1
      RETURNING *
    `, [rosterId, userId]);

    res.json({ success: true, data: rows[0] });
  })
);

// ── Delete roster entry ─────────────────────────────────────────────────────
router.delete('/:rosterId',
  requirePermission('shifts.assign'),
  asyncHandler(async (req, res) => {
    const { rosterId } = req.params;

    await pool.query(`
      DELETE FROM hr_roster WHERE pk_roster_id = $1
    `, [rosterId]);

    res.json({ success: true, message: 'Roster entry deleted' });
  })
);

export default router;
