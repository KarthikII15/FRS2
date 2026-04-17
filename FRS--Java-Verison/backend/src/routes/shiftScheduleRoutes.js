import express from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = express.Router();
router.use(requireAuth);

function getTenantId(req) {
  return Number(req.auth?.scope?.tenantId || 1);
}

// ── Get employee's shift schedule (for calendar view) ──────────────────────
router.get('/employees/:employeeId/schedule', 
  requirePermission('shifts.read'), 
  asyncHandler(async (req, res) => {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;

    // Get rotating shifts
    const { rows } = await pool.query(`
      SELECT 
        es.pk_employee_shift_id as id,
        es.pattern_type,
        es.day_of_week,
        es.effective_date,
        es.end_date,
        s.pk_shift_id as shift_id,
        s.name as shift_name,
        s.shift_type,
        s.start_time,
        s.end_time,
        s.grace_period_minutes,
        s.break_duration_minutes
      FROM employee_shifts es
      JOIN hr_shift s ON es.fk_shift_id = s.pk_shift_id
      WHERE es.fk_employee_id = $1 
        AND es.is_active = true
        AND (es.end_date IS NULL OR es.end_date >= $2)
        AND (es.effective_date IS NULL OR es.effective_date <= $3)
      ORDER BY es.effective_date DESC, es.day_of_week
    `, [employeeId, startDate || 'now', endDate || 'now']);

    res.json({ success: true, schedule: rows });
  })
);

// ── Assign rotating shift to employee ──────────────────────────────────────
router.post('/employees/:employeeId/schedule',
  requirePermission('shifts.assign'),
  asyncHandler(async (req, res) => {
    const { employeeId } = req.params;
    const { shift_id, pattern_type, day_of_week, effective_date, end_date } = req.body;

    if (!shift_id || !pattern_type) {
      return res.status(400).json({ message: 'shift_id and pattern_type required' });
    }

    // Validate pattern_type
    const validPatterns = ['fixed', 'daily', 'weekly', 'monthly'];
    if (!validPatterns.includes(pattern_type)) {
      return res.status(400).json({ message: 'Invalid pattern_type. Must be: fixed, daily, weekly, or monthly' });
    }

    // For weekly pattern, day_of_week is required
    if (pattern_type === 'weekly' && day_of_week === undefined) {
      return res.status(400).json({ message: 'day_of_week required for weekly pattern (0-6)' });
    }

    const { rows } = await pool.query(`
      INSERT INTO employee_shifts (
        fk_employee_id, fk_shift_id, pattern_type, day_of_week, 
        effective_date, end_date
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (fk_employee_id, fk_shift_id, day_of_week, effective_date) 
      DO UPDATE SET 
        end_date = EXCLUDED.end_date,
        is_active = true,
        updated_at = NOW()
      RETURNING *
    `, [
      employeeId, 
      shift_id, 
      pattern_type, 
      day_of_week || null,
      effective_date || null,
      end_date || null
    ]);

    res.json({ success: true, assignment: rows[0] });
  })
);

// ── Delete shift assignment ─────────────────────────────────────────────────
router.delete('/employees/:employeeId/schedule/:assignmentId',
  requirePermission('shifts.assign'),
  asyncHandler(async (req, res) => {
    const { assignmentId } = req.params;

    await pool.query(`
      UPDATE employee_shifts 
      SET is_active = false, updated_at = NOW()
      WHERE pk_employee_shift_id = $1
    `, [assignmentId]);

    res.json({ success: true, message: 'Shift assignment removed' });
  })
);

// ── Get shift for a specific date/employee (used by attendance engine) ──────
router.get('/employees/:employeeId/shift-for-date',
  requirePermission('shifts.read'),
  asyncHandler(async (req, res) => {
    const { employeeId } = req.params;
    const { date } = req.query; // YYYY-MM-DD

    if (!date) {
      return res.status(400).json({ message: 'date required (YYYY-MM-DD)' });
    }

    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay(); // 0-6

    // Priority: weekly > daily > monthly > fixed
    const { rows } = await pool.query(`
      SELECT 
        s.pk_shift_id as shift_id,
        s.name,
        s.shift_type,
        s.start_time,
        s.end_time,
        s.grace_period_minutes,
        s.break_duration_minutes,
        es.pattern_type
      FROM employee_shifts es
      JOIN hr_shift s ON es.fk_shift_id = s.pk_shift_id
      WHERE es.fk_employee_id = $1
        AND es.is_active = true
        AND (es.effective_date IS NULL OR es.effective_date <= $2)
        AND (es.end_date IS NULL OR es.end_date >= $2)
        AND (
          (es.pattern_type = 'weekly' AND es.day_of_week = $3) OR
          (es.pattern_type = 'daily' AND es.effective_date = $2) OR
          (es.pattern_type = 'monthly') OR
          (es.pattern_type = 'fixed')
        )
      ORDER BY 
        CASE es.pattern_type
          WHEN 'weekly' THEN 1
          WHEN 'daily' THEN 2
          WHEN 'monthly' THEN 3
          WHEN 'fixed' THEN 4
        END
      LIMIT 1
    `, [employeeId, date, dayOfWeek]);

    if (rows.length === 0) {
      // Fallback to old fk_shift_id in hr_employee
      const { rows: fallback } = await pool.query(`
        SELECT 
          s.pk_shift_id as shift_id,
          s.name,
          s.shift_type,
          s.start_time,
          s.end_time,
          s.grace_period_minutes,
          s.break_duration_minutes,
          'legacy' as pattern_type
        FROM hr_employee e
        JOIN hr_shift s ON e.fk_shift_id = s.pk_shift_id
        WHERE e.pk_employee_id = $1
      `, [employeeId]);

      return res.json({ success: true, shift: fallback[0] || null });
    }

    res.json({ success: true, shift: rows[0] });
  })
);

export default router;
