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
  // Cameras — authoritative real-time data from frs_camera
  const { rows: cams } = await query(`
    SELECT
      c.pk_camera_id::text  AS pk_device_id,
      c.cam_id              AS external_device_id,
      c.name,
      c.model,
      c.ip_address,
      c.recognition_accuracy,
      c.total_scans,
      c.error_rate,
      c.last_active,
      COALESCE(z.zone_name, f.floor_name, n.name) AS location_label,
      'Camera'              AS device_type,
      CASE
        WHEN c.last_active IS NULL OR c.last_active <= NOW() - INTERVAL '90 seconds' THEN 'offline'
        WHEN c.status = 'error' THEN 'error'
        ELSE 'online'
      END AS status
    FROM frs_camera c
    LEFT JOIN frs_nug_box n ON n.pk_nug_id = c.fk_nug_id
    LEFT JOIN frs_floor f ON f.pk_floor_id = c.fk_floor_id
    LEFT JOIN frs_zone z ON z.pk_zone_id = c.fk_zone_id
    WHERE n.fk_site_id IN (
      SELECT s.pk_site_id FROM frs_site s
      JOIN frs_customer c ON c.pk_customer_id = s.fk_customer_id
      WHERE c.fk_tenant_id = CAST($1 AS BIGINT)
    )
  `, [Number(tenantId)]);

  // NUG boxes — AI edge nodes
  const { rows: nugs } = await query(`
    SELECT
      n.pk_nug_id::text    AS pk_device_id,
      n.device_code        AS external_device_id,
      n.name,
      'Jetson Orin'        AS model,
      n.ip_address,
      NULL::numeric        AS recognition_accuracy,
      NULL::int            AS total_scans,
      NULL::numeric        AS error_rate,
      n.last_heartbeat     AS last_active,
      COALESCE(z.zone_name, f.floor_name) AS location_label,
      'AI'                 AS device_type,
      CASE
        WHEN n.last_heartbeat IS NULL OR n.last_heartbeat <= NOW() - INTERVAL '90 seconds' THEN 'offline'
        ELSE 'online'
      END AS status
    FROM frs_nug_box n
    LEFT JOIN frs_floor f ON f.pk_floor_id = n.fk_floor_id
    LEFT JOIN frs_zone z ON z.pk_zone_id = n.fk_zone_id
    WHERE n.fk_site_id IN (
      SELECT s.pk_site_id FROM frs_site s
      JOIN frs_customer c ON c.pk_customer_id = s.fk_customer_id
      WHERE c.fk_tenant_id = CAST($1 AS BIGINT)
    )
  `, [Number(tenantId)]);

  return [...cams, ...nugs];
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

export async function getHourlyActivity(siteId) {
  const tz = await getSiteTimezone(siteId || '1');
  const { rows } = await query(`
    WITH hours AS (
      SELECT generate_series(
        date_trunc('hour', NOW() AT TIME ZONE $1) - INTERVAL '23 hours',
        date_trunc('hour', NOW() AT TIME ZONE $1),
        '1 hour'::interval
      ) AS hr
    )
    SELECT
      to_char(h.hr AT TIME ZONE $1, 'HH24:00') as label,
      COUNT(a.pk_attendance_id)::int as value
    FROM hours h
    LEFT JOIN attendance_record a
      ON date_trunc('hour', a.check_in AT TIME ZONE $1) = h.hr
    GROUP BY h.hr
    ORDER BY h.hr ASC
  `, [tz]);
  return rows;
}

// In-memory cache for holidays (TTL: 24 hours)
const holidayCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Google Calendar ID for Indian public holidays
const GOOGLE_CALENDAR_ID = 'en.indian#holiday@group.v.calendar.google.com';

// Comprehensive Indian festivals and holidays fallback (covers 2025-2027)
// These are used when Google Calendar API fails or returns limited results
const INDIAN_FESTIVALS_FALLBACK = {
  // 2025
  '2025-01-01': 'New Year\'s Day',
  '2025-01-14': 'Makar Sankranti',
  '2025-01-26': 'Republic Day',
  '2025-02-14': 'Vasant Panchami',
  '2025-02-26': 'Maha Shivaratri',
  '2025-03-14': 'Holi',
  '2025-03-15': 'Holi Holiday',
  '2025-03-31': 'Eid al-Fitr',
  '2025-04-06': 'Ram Navami',
  '2025-04-10': 'Mahavir Jayanti',
  '2025-04-14': 'Ambedkar Jayanti',
  '2025-04-18': 'Good Friday',
  '2025-05-01': 'Labour Day',
  '2025-05-12': 'Buddha Purnima',
  '2025-06-07': 'Eid al-Adha (Bakrid)',
  '2025-07-06': 'Muharram',
  '2025-08-09': 'Raksha Bandhan',
  '2025-08-15': 'Independence Day',
  '2025-08-16': 'Janmashtami',
  '2025-08-28': 'Ganesh Chaturthi',
  '2025-09-05': 'Milad un-Nabi',
  '2025-10-02': 'Gandhi Jayanti',
  '2025-10-02': 'Dussehra',
  '2025-10-21': 'Diwali',
  '2025-10-22': 'Diwali Holiday',
  '2025-11-05': 'Guru Nanak Jayanti',
  '2025-12-25': 'Christmas',

  // 2026
  '2026-01-01': 'New Year\'s Day',
  '2026-01-14': 'Makar Sankranti',
  '2026-01-26': 'Republic Day',
  '2026-02-03': 'Vasant Panchami',
  '2026-02-15': 'Maha Shivaratri',
  '2026-03-03': 'Holi',
  '2026-03-04': 'Holi Holiday',
  '2026-03-20': 'Eid al-Fitr',
  '2026-03-26': 'Ram Navami',
  '2026-03-30': 'Mahavir Jayanti',
  '2026-04-14': 'Ambedkar Jayanti',
  '2026-04-03': 'Good Friday',
  '2026-05-01': 'Labour Day',
  '2026-05-01': 'Buddha Purnima',
  '2026-05-27': 'Eid al-Adha (Bakrid)',
  '2026-06-25': 'Muharram',
  '2026-08-03': 'Raksha Bandhan',
  '2026-08-15': 'Independence Day',
  '2026-08-26': 'Janmashtami',
  '2026-09-06': 'Ganesh Chaturthi',
  '2026-09-26': 'Milad un-Nabi',
  '2026-10-02': 'Gandhi Jayanti',
  '2026-10-20': 'Dussehra',
  '2026-11-08': 'Diwali',
  '2026-11-09': 'Diwali Holiday',
  '2026-11-25': 'Guru Nanak Jayanti',
  '2026-12-25': 'Christmas',

  // 2027
  '2027-01-01': 'New Year\'s Day',
  '2027-01-14': 'Makar Sankranti',
  '2027-01-26': 'Republic Day',
  '2027-01-23': 'Vasant Panchami',
  '2027-03-05': 'Maha Shivaratri',
  '2027-03-22': 'Holi',
  '2027-03-23': 'Holi Holiday',
  '2027-03-10': 'Eid al-Fitr',
  '2027-03-15': 'Ram Navami',
  '2027-04-09': 'Mahavir Jayanti',
  '2027-04-14': 'Ambedkar Jayanti',
  '2027-03-26': 'Good Friday',
  '2027-05-01': 'Labour Day',
  '2027-05-20': 'Buddha Purnima',
  '2027-05-17': 'Eid al-Adha (Bakrid)',
  '2027-06-15': 'Muharram',
  '2027-07-24': 'Raksha Bandhan',
  '2027-08-15': 'Independence Day',
  '2027-08-14': 'Janmashtami',
  '2027-08-25': 'Ganesh Chaturthi',
  '2027-09-16': 'Milad un-Nabi',
  '2027-10-02': 'Gandhi Jayanti',
  '2027-10-09': 'Dussehra',
  '2027-10-28': 'Diwali',
  '2027-10-29': 'Diwali Holiday',
  '2027-11-14': 'Guru Nanak Jayanti',
  '2027-12-25': 'Christmas',
};

export async function getCalendarEvents(year, month) {
  const cacheKey = `events_${year}_${month}`;
  const cached = holidayCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5 min cache
    return cached.data;
  }

  try {
    const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
    const companyCalendarId = process.env.COMPANY_CALENDAR_ID;
    const holidayCalendarId = process.env.HOLIDAY_CALENDAR_ID || GOOGLE_CALENDAR_ID;

    const startStr = month < 10 ? `0${month}` : `${month}`;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextMonthStr = nextMonth < 10 ? `0${nextMonth}` : `${nextMonth}`;

    const startDate = `${year}-${startStr}-01T00:00:00Z`;
    const endDate = `${nextYear}-${nextMonthStr}-01T00:00:00Z`;

    let holidays = {};
    let events = {}; // { 'YYYY-MM-DD': [ { summary, time } ] }

    // Helper to fetch calendar
    const fetchCalendar = async (calId, isHoliday) => {
      let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?` +
                `timeMin=${startDate}&timeMax=${endDate}&singleEvents=true&orderBy=startTime&maxResults=100`;
      
      if (apiKey) url += `&key=${apiKey}`;
      
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (response.ok) {
        const data = await response.json();
        if (data.items && Array.isArray(data.items)) {
          data.items.forEach((event) => {
            const date = event.start?.date || event.start?.dateTime?.split('T')[0];
            if (date) {
              if (isHoliday) {
                if (!holidays[date]) holidays[date] = event.summary;
              } else {
                if (!events[date]) events[date] = [];
                let time = null;
                if (event.start?.dateTime) {
                  const d = new Date(event.start.dateTime);
                  time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                }
                events[date].push({ summary: event.summary, time });
              }
            }
          });
        }
      }
    };

    // 1. Fetch holidays
    await fetchCalendar(holidayCalendarId, true);
    
    // 2. Fetch company events (if configured)
    if (companyCalendarId) {
      await fetchCalendar(companyCalendarId, false);
    }

    // Merge with fallback list for holidays
    for (const [date, name] of Object.entries(INDIAN_FESTIVALS_FALLBACK)) {
      if (date.startsWith(`${year}-${startStr}`) && !holidays[date]) {
        holidays[date] = name;
      }
    }

    const result = { holidays, events };
    holidayCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    // Return fallback holidays for this month
    const startStr = month < 10 ? `0${month}` : `${month}`;
    const monthFallback = {};
    for (const [date, name] of Object.entries(INDIAN_FESTIVALS_FALLBACK)) {
      if (date.startsWith(`${year}-${startStr}`)) {
        monthFallback[date] = name;
      }
    }
    return { holidays: monthFallback, events: {} };
  }
}






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
