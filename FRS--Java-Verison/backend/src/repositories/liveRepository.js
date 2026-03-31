import { query } from '../db/pool.js';

// --- 1. CORE ANALYTICS (With Joining Date Fix) ---

// Get site timezone from DB
export async function getSiteTimezone(siteId) {
  try {
    const { rows } = await query(
      `SELECT timezone FROM frs_site WHERE pk_site_id = $1`,
      [Number(siteId) || 1]
    );
    return rows[0]?.timezone || 'UTC';
  } catch { return 'UTC'; }
}

export async function getDashboardMetrics(tenantId, siteId) {
  const tz = await getSiteTimezone(siteId);
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM hr_employee WHERE tenant_id = CAST($1 AS BIGINT) AND status = 'active') as total,
      (SELECT COUNT(DISTINCT fk_employee_id)::int FROM attendance_record 
       WHERE tenant_id = CAST($1 AS BIGINT) 
       AND attendance_date = (NOW() AT TIME ZONE $2)::date) as present,
      (
        SELECT COUNT(DISTINCT a.fk_employee_id)::int
        FROM attendance_record a
        JOIN hr_employee e ON e.pk_employee_id = a.fk_employee_id
        JOIN hr_shift s ON s.pk_shift_id = e.fk_shift_id
        WHERE a.tenant_id = CAST($1 AS BIGINT)
          AND a.attendance_date = (NOW() AT TIME ZONE $2)::date
          AND s.is_flexible = false
          AND (a.check_in AT TIME ZONE $2)::time > (s.start_time + (COALESCE(s.grace_period_minutes,0) || ' minutes')::interval)
      ) as late,
      (
        SELECT ROUND(AVG(duration_minutes)::numeric / 60, 1)
        FROM attendance_record
        WHERE tenant_id = CAST($1 AS BIGINT)
          AND attendance_date = (NOW() AT TIME ZONE $2)::date
          AND duration_minutes > 0
      ) as avg_working_hours,
      (
        SELECT ROUND(AVG(overtime_hours)::numeric, 1)
        FROM attendance_record
        WHERE tenant_id = CAST($1 AS BIGINT)
          AND attendance_date = (NOW() AT TIME ZONE $2)::date
      ) as avg_overtime,
      (
        SELECT COUNT(DISTINCT a.fk_employee_id)::int
        FROM attendance_record a
        JOIN hr_employee e ON e.pk_employee_id = a.fk_employee_id
        JOIN hr_shift s ON s.pk_shift_id = e.fk_shift_id
        WHERE a.tenant_id = CAST($1 AS BIGINT)
          AND a.attendance_date = (NOW() AT TIME ZONE $2)::date
          AND s.is_flexible = false
          AND (a.check_in AT TIME ZONE $2)::time <= (s.start_time + (COALESCE(s.grace_period_minutes,0) || ' minutes')::interval)
      ) as on_time
  `, [Number(tenantId), tz]);
  const total   = rows[0]?.total   || 0;
  const present = rows[0]?.present || 0;
  const late    = rows[0]?.late    || 0;
  const onTime  = rows[0]?.on_time || 0;
  return {
    totalEmployees:    total,
    presentToday:      present,
    lateToday:         late,
    absentToday:       Math.max(0, total - present),
    attendanceRate:    total > 0 ? Math.round((present / total) * 100) : 0,
    avgWorkingHours:   parseFloat(rows[0]?.avg_working_hours || 0),
    totalOvertimeHours: parseFloat(rows[0]?.avg_overtime || 0),
    punctualityRate:   present > 0 ? Math.round((onTime / present) * 100) : 0,
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
  const { rows } = await query(`
    SELECT e.*, 
           d.name as department_name,
           s.name as shift_name,
           s.shift_type,
           s.start_time,
           s.end_time,
           s.grace_period_minutes,
           EXISTS(SELECT 1 FROM employee_face_embeddings ef WHERE ef.employee_id = e.pk_employee_id) as face_enrolled
    FROM hr_employee e
    LEFT JOIN hr_department d ON e.fk_department_id = d.pk_department_id
    LEFT JOIN hr_shift s ON s.pk_shift_id = e.fk_shift_id
    WHERE e.tenant_id = CAST($1 AS BIGINT)
    ORDER BY e.full_name ASC
  `, [Number(tenantId)]);
  return rows;
}

export async function listDevices(tenantId) {
  const { rows } = await query(`SELECT * FROM facility_device WHERE tenant_id = CAST($1 AS BIGINT)`, [Number(tenantId)]);
  return rows;
}

export async function listAttendance(tenantId, siteId) {
  const tz = await getSiteTimezone(siteId);
  const { rows } = await query(`
    SELECT 
      a.*,
      e.full_name,
      e.position_title,
      d.name as department_name,
      fd.location_label as floor,
      CASE
        WHEN s.is_flexible = true OR s.start_time IS NULL THEN false
        WHEN a.check_in IS NULL THEN false
        WHEN (a.check_in AT TIME ZONE $2)::time > (s.start_time + (COALESCE(s.grace_period_minutes,0) || ' minutes')::interval)
          THEN true
        ELSE false
      END as is_late_computed
    FROM attendance_record a
    JOIN hr_employee e ON a.fk_employee_id = e.pk_employee_id
    LEFT JOIN hr_shift s ON s.pk_shift_id = e.fk_shift_id
    LEFT JOIN hr_department d ON e.fk_department_id = d.pk_department_id
    LEFT JOIN facility_device fd ON a.device_id = fd.external_device_id
    WHERE a.tenant_id = CAST($1 AS BIGINT) 
    AND a.attendance_date = (NOW() AT TIME ZONE $2)::date
    ORDER BY a.check_in ASC
  `, [Number(tenantId), tz]);
  return rows.map(r => ({
    ...r,
    // Return raw TIMESTAMPTZ fields to let frontend handle localized display
    is_late: r.is_late_computed ?? r.is_late ?? false,
  }));
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

export async function getWeeklyAnalytics(tenantId, siteId) {
  const tz = await getSiteTimezone(siteId);
  const { rows } = await query(`
    WITH dates AS (
      SELECT generate_series(
        (NOW() AT TIME ZONE $2)::date - INTERVAL '6 days',
        (NOW() AT TIME ZONE $2)::date,
        '1 day'
      )::date as date
    ),
    total_employees AS (
      SELECT COUNT(*)::int as cnt FROM hr_employee 
      WHERE tenant_id = CAST($1 AS BIGINT) AND status = 'active'
    )
    SELECT 
      TO_CHAR(d.date, 'Dy') as name,
      d.date,
      COUNT(a.pk_attendance_id)::int as present,
      COUNT(CASE 
        WHEN a.pk_attendance_id IS NOT NULL 
          AND s.is_flexible = false
          AND (a.check_in AT TIME ZONE $2)::time > (s.start_time + (COALESCE(s.grace_period_minutes,0) || ' minutes')::interval)
        THEN 1 END
      )::int as late,
      GREATEST(0, (SELECT cnt FROM total_employees) - COUNT(a.pk_attendance_id)::int) as absent
    FROM dates d
    LEFT JOIN attendance_record a ON a.attendance_date = d.date AND a.tenant_id = CAST($1 AS BIGINT)
    LEFT JOIN hr_employee e ON e.pk_employee_id = a.fk_employee_id
    LEFT JOIN hr_shift s ON s.pk_shift_id = e.fk_shift_id
    GROUP BY d.date ORDER BY d.date ASC
  `, [Number(tenantId), tz]);
  return rows;
}

// --- 4. ALIASES (Failsafes for different route versions) ---
export const getLiveStats = getDashboardMetrics;
export const getMonthlyAttendanceTrend = getAttendanceTrends;
export const listEvents = listAlerts;






export async function listDepartments(tenantId) {
  const { rows } = await query(`
    SELECT pk_department_id, tenant_id, name, code, color 
    FROM hr_department 
    WHERE tenant_id = CAST($1 AS BIGINT)
    ORDER BY name ASC
  `, [Number(tenantId)]);
  return rows;
}

export async function listShifts(tenantId) {
  const { rows } = await query(`
    SELECT pk_shift_id, tenant_id, name, shift_type, start_time, end_time, grace_period_minutes 
    FROM hr_shift 
    WHERE tenant_id = CAST($1 AS BIGINT)
    ORDER BY start_time ASC
  `, [Number(tenantId)]);
  return rows;
}

export async function getMonthlyCalendar(tenantId, siteId, year, month) {
  const tz = await getSiteTimezone(siteId);
  const { rows } = await query(`
    WITH dates AS (
      SELECT generate_series(
        DATE_TRUNC('month', make_date($2::int, $3::int, 1)),
        DATE_TRUNC('month', make_date($2::int, $3::int, 1)) + INTERVAL '1 month' - INTERVAL '1 day',
        '1 day'
      )::date as date
    ),
    total_emp AS (
      SELECT COUNT(*)::int as cnt 
      FROM hr_employee 
      WHERE tenant_id = CAST($1 AS BIGINT) AND status = 'active'
    )
    SELECT 
      d.date,
      TO_CHAR(d.date, 'YYYY-MM-DD') as date_str,
      COUNT(a.pk_attendance_id)::int as present,
      COUNT(CASE 
        WHEN a.pk_attendance_id IS NOT NULL 
          AND s.is_flexible = false
          AND (a.check_in AT TIME ZONE $4)::time > (s.start_time + (COALESCE(s.grace_period_minutes,0) || ' minutes')::interval)
        THEN 1 END
      )::int as late,
      GREATEST(0, (SELECT cnt FROM total_emp) - COUNT(a.pk_attendance_id)::int) as absent,
      (SELECT cnt FROM total_emp) as total,
      CASE WHEN COUNT(a.pk_attendance_id) > 0 
        THEN ROUND((COUNT(a.pk_attendance_id)::numeric / (SELECT cnt FROM total_emp)) * 100)
        ELSE 0 
      END as rate
    FROM dates d
    LEFT JOIN attendance_record a ON a.attendance_date = d.date AND a.tenant_id = CAST($1 AS BIGINT)
    LEFT JOIN hr_employee e ON e.pk_employee_id = a.fk_employee_id
    LEFT JOIN hr_shift s ON s.pk_shift_id = e.fk_shift_id
    GROUP BY d.date
    ORDER BY d.date ASC
  `, [Number(tenantId), year, month, tz]);
  return rows;
}

export async function getDeptShiftAnalytics(tenantId, siteId) {
  const tz = await getSiteTimezone(siteId);
  const { rows } = await query(`
    SELECT 
      d.pk_department_id as dept_id,
      d.name as department,
      d.code,
      d.color,
      s.pk_shift_id as shift_id,
      s.name as shift_name,
      s.shift_type,
      s.start_time::text,
      s.end_time::text,
      s.grace_period_minutes,
      e.pk_employee_id,
      e.full_name,
      e.employee_code,
      e.status as emp_status,
      a.check_in AT TIME ZONE $2 as check_in_local,
      a.check_out AT TIME ZONE $2 as check_out_local,
      a.is_late,
      a.duration_minutes,
      CASE WHEN a.pk_attendance_id IS NOT NULL THEN 'present'
           ELSE 'absent' END as today_status
    FROM hr_employee e
    LEFT JOIN hr_department d ON d.pk_department_id = e.fk_department_id
    LEFT JOIN hr_shift s ON s.pk_shift_id = e.fk_shift_id
    LEFT JOIN attendance_record a ON a.fk_employee_id = e.pk_employee_id
      AND a.attendance_date = (NOW() AT TIME ZONE $2)::date
    WHERE e.tenant_id = CAST($1 AS BIGINT) AND e.status = 'active'
    ORDER BY d.name, s.start_time, e.full_name
  `, [Number(tenantId), tz]);
  return rows;
}
