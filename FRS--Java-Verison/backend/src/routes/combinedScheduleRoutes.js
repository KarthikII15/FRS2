import express from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = express.Router();
router.use(requireAuth);

// Get combined schedule: rotating shifts + manual roster overrides
router.get('/schedule',
  requirePermission('shifts.read'),
  asyncHandler(async (req, res) => {
    const { start, end } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({ message: 'start and end dates required (YYYY-MM-DD)' });
    }

    // Get all employees
    const { rows: employees } = await pool.query(`
      SELECT pk_employee_id, full_name, employee_code, fk_department_id
      FROM hr_employee 
      WHERE status = 'active'
    `);

    const schedule = [];

    // For each employee, for each date in range, determine their shift
    for (const emp of employees) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        const dayOfWeek = d.getDay();

        // 1. Check manual roster first (highest priority)
        const { rows: manualRoster } = await pool.query(`
          SELECT r.*, s.name as shift_name, s.shift_type, s.start_time, s.end_time
          FROM hr_roster r
          JOIN hr_shift s ON r.fk_shift_id = s.pk_shift_id
          WHERE r.fk_employee_id = $1 AND r.roster_date = $2
        `, [emp.pk_employee_id, dateStr]);

        if (manualRoster.length > 0) {
          schedule.push({
            employee_id: emp.pk_employee_id,
            full_name: emp.full_name,
            employee_code: emp.employee_code,
            date: dateStr,
            day_of_week: dayOfWeek,
            shift: manualRoster[0],
            source: 'manual_roster'
          });
          continue;
        }

        // 2. Check rotating shifts (weekly pattern)
        const { rows: weeklyShift } = await pool.query(`
          SELECT es.*, s.name as shift_name, s.shift_type, s.start_time, s.end_time,
                 s.grace_period_minutes, s.break_duration_minutes
          FROM employee_shifts es
          JOIN hr_shift s ON es.fk_shift_id = s.pk_shift_id
          WHERE es.fk_employee_id = $1
            AND es.pattern_type = 'weekly'
            AND es.day_of_week = $2
            AND es.is_active = true
            AND (es.effective_date IS NULL OR es.effective_date <= $3)
            AND (es.end_date IS NULL OR es.end_date >= $3)
        `, [emp.pk_employee_id, dayOfWeek, dateStr]);

        if (weeklyShift.length > 0) {
          schedule.push({
            employee_id: emp.pk_employee_id,
            full_name: emp.full_name,
            employee_code: emp.employee_code,
            date: dateStr,
            day_of_week: dayOfWeek,
            shift: weeklyShift[0],
            source: 'rotating_shift'
          });
          continue;
        }

        // 3. Fallback to fixed shift (from hr_employee.fk_shift_id)
        const { rows: fixedShift } = await pool.query(`
          SELECT s.pk_shift_id, s.name as shift_name, s.shift_type, s.start_time, s.end_time,
                 s.grace_period_minutes, s.break_duration_minutes
          FROM hr_employee e
          JOIN hr_shift s ON e.fk_shift_id = s.pk_shift_id
          WHERE e.pk_employee_id = $1
        `, [emp.pk_employee_id]);

        if (fixedShift.length > 0) {
          schedule.push({
            employee_id: emp.pk_employee_id,
            full_name: emp.full_name,
            employee_code: emp.employee_code,
            date: dateStr,
            day_of_week: dayOfWeek,
            shift: fixedShift[0],
            source: 'fixed_shift'
          });
        }
      }
    }

    res.json({ success: true, schedule });
  })
);

export default router;
