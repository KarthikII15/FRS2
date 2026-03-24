import { query } from '../db/pool.js';

// --- 1. CORE ANALYTICS (With Joining Date Fix) ---

export async function getDashboardMetrics(tenantId) {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM hr_employee WHERE tenant_id = CAST($1 AS BIGINT) AND status = 'active') as total,
      (SELECT COUNT(DISTINCT fk_employee_id)::int FROM attendance_record WHERE tenant_id = CAST($1 AS BIGINT) AND attendance_date = CURRENT_DATE) as present,
      (SELECT COUNT(DISTINCT fk_employee_id)::int FROM attendance_record WHERE tenant_id = CAST($1 AS BIGINT) AND attendance_date = CURRENT_DATE AND status = 'late') as late
  `, [Number(tenantId)]);
  const total = rows[0]?.total || 0;
  const present = rows[0]?.present || 0;
  return {
    totalEmployees: total,
    presentToday: present,
    lateToday: rows[0]?.late || 0,
    absentToday: Math.max(0, total - present),
    attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0
  };
}

export async function getAttendanceTrends(tenantId) {
  const { rows } = await query(`
    WITH dates AS (
      SELECT generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, '1 day')::date as date
    )
    SELECT 
      d.date as full_date,
      COUNT(a.pk_attendance_id)::int as present,
      (SELECT COUNT(*)::int FROM hr_employee WHERE tenant_id = CAST($1 AS BIGINT) AND status = 'active' AND (created_at IS NULL OR DATE(created_at) <= d.date)) as total
    FROM dates d
    LEFT JOIN attendance_record a ON a.attendance_date = d.date AND a.tenant_id = CAST($1 AS BIGINT)
    GROUP BY d.date ORDER BY d.date ASC
  `, [Number(tenantId)]);
  return rows.map(r => ({
    date: r.full_date,
    present: r.present,
    absent: r.total > 0 ? Math.max(0, r.total - r.present) : 0,
    rate: r.total > 0 ? Math.round((r.present / r.total) * 100) : 0
  }));
}

// --- 2. DATA LISTINGS (The current culprits) ---

export async function listEmployees(tenantId) {
  const { rows } = await query(`SELECT * FROM hr_employee WHERE tenant_id = CAST($1 AS BIGINT) AND status = 'active'`, [Number(tenantId)]);
  return rows;
}

export async function listDevices(tenantId) {
  const { rows } = await query(`SELECT * FROM facility_device WHERE tenant_id = CAST($1 AS BIGINT)`, [Number(tenantId)]);
  return rows;
}

export async function listAttendance(tenantId) {
  const { rows } = await query(`
    SELECT a.*, e.full_name, d.name as department_name
    FROM attendance_record a
    JOIN hr_employee e ON a.fk_employee_id = e.pk_employee_id
    LEFT JOIN hr_department d ON e.fk_department_id = d.pk_department_id
    WHERE a.tenant_id = CAST($1 AS BIGINT) AND a.attendance_date = CURRENT_DATE
    ORDER BY a.check_in DESC
  `, [Number(tenantId)]);
  return rows;
}

export async function listAlerts(tenantId) {
  const { rows } = await query(`
    SELECT * FROM system_alert WHERE tenant_id = CAST($1 AS BIGINT) ORDER BY created_at DESC LIMIT 20
  `, [Number(tenantId)]);
  return rows;
}

// --- 3. LIVE FEED & ADDITIONAL ANALYTICS ---

export async function getLiveFeed(tenantId) {
  return await listAttendance(tenantId);
}

export async function getDepartmentAnalytics(tenantId) {
  const { rows } = await query(`
    SELECT d.name, COUNT(e.pk_employee_id)::int as total, COUNT(a.pk_attendance_id)::int as present
    FROM hr_employee e
    JOIN hr_department d ON e.fk_department_id = d.pk_department_id
    LEFT JOIN attendance_record a ON a.fk_employee_id = e.pk_employee_id AND a.attendance_date = CURRENT_DATE
    WHERE e.tenant_id = CAST($1 AS BIGINT) GROUP BY d.name
  `, [Number(tenantId)]);
  return rows;
}

export async function getWeeklyAnalytics(tenantId) {
  const { rows } = await query(`
    WITH dates AS (SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day')::date as date)
    SELECT TO_CHAR(d.date, 'Dy') as name, COUNT(a.pk_attendance_id)::int as present
    FROM dates d
    LEFT JOIN attendance_record a ON a.attendance_date = d.date AND a.tenant_id = CAST($1 AS BIGINT)
    GROUP BY d.date ORDER BY d.date ASC
  `, [Number(tenantId)]);
  return rows;
}

// --- 4. ALIASES (Failsafes for different route versions) ---
export const getLiveStats = getDashboardMetrics;
export const getMonthlyAttendanceTrend = getAttendanceTrends;
export const listEvents = listAlerts;


export async function listShifts(tenantId) {
  const { rows } = await query(`
    SELECT * FROM hr_shift 
    WHERE tenant_id = CAST($1 AS BIGINT)
    ORDER BY start_time ASC
  `, [Number(tenantId)]);
  return rows;
}
