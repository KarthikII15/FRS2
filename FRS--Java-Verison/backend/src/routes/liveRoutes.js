import express from "express";
import { requireAuth, requirePermission } from "../middleware/authz.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateScopeAccess } from "../middleware/scopeExtractor.js";
import {
  getDashboardMetrics,
  getAttendanceTrends,
  getMonthlyAttendanceTrend,
  getDepartmentAnalytics,
  getWeeklyAnalytics,
  getDeptShiftAnalytics,
  getMonthlyCalendar,
  listAlerts,
  listAttendance,
  listDevices,
  listEmployees,
  listShifts,
  listDepartments,
  getSiteTimezone,
  getHourlyActivity,
} from "../repositories/liveRepository.js";
import {
  listEmployeesSchema,
  listAttendanceSchema,
  listDevicesSchema,
  listAlertsSchema,
  getMetricsSchema,
  validateQuery,
} from "../validators/schemas.js";

const router = express.Router();

// Apply auth first, then validate scope access against user's memberships
router.use(requireAuth);
router.use(validateScopeAccess);

router.get(
  "/employees",
  requirePermission("users.read"),
  validateQuery(listEmployeesSchema),
  asyncHandler(async (req, res) => {
    const { limit, department, status } = req.validatedQuery;
    // Use scope from headers (req.scope) or fall back to auth token scope
    const scope = req.scope || req.auth.scope;
    const tenantId = scope?.tenantId || req.headers['x-tenant-id'] || '1';
    const employees = await listEmployees(tenantId, { limit, department, status });
    return res.json({ data: employees });
  })
);


router.get("/departments", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  const tId = req.auth?.scope?.tenantId || req.headers['x-tenant-id'] || '1';
  console.log("[DEBUG] API Hit: /departments for tenant", tId);
  const rows = await listDepartments(tId);
  console.log("[DEBUG] API Found", rows?.length, "departments");
  return res.json({ data: rows || [] });
}));

router.get("/shifts", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  const scope = req.scope || req.auth.scope;
  const shifts = await listShifts(scope?.tenantId || req.headers['x-tenant-id'] || '1');
  return res.json({ data: shifts });
}));

router.get(
  "/attendance",
  requirePermission("attendance.read"),
  validateQuery(listAttendanceSchema),
  asyncHandler(async (req, res) => {
    const { fromDate, toDate, limit } = req.validatedQuery;
    const scope = req.scope || req.auth.scope;
    const tenantId2 = scope?.tenantId || req.headers['x-tenant-id'] || '1';
    const siteId2 = req.headers['x-site-id'] || '1';
    const records = await listAttendance(tenantId2, siteId2, { fromDate, toDate, limit });
    return res.json({ data: records });
  })
);

router.get(
  "/devices",
  requirePermission("devices.read"),
  validateQuery(listDevicesSchema),
  asyncHandler(async (req, res) => {
    const { limit } = req.validatedQuery;
    const scope = req.scope || req.auth.scope;
    const devices = await listDevices(scope?.tenantId || req.headers['x-tenant-id'] || '1', { limit });
    return res.json({ data: devices });
  })
);

router.get(
  "/alerts",
  requirePermission("attendance.read"),
  validateQuery(listAlertsSchema),
  asyncHandler(async (req, res) => {
    const { unreadOnly, limit } = req.validatedQuery;
    const scope = req.scope || req.auth.scope;
    const alerts = await listAlerts(scope?.tenantId || req.headers['x-tenant-id'] || '1', { unreadOnly, limit });
    return res.json({ data: alerts });
  })
);

router.get(
  "/metrics",
  requirePermission("attendance.read"),
  validateQuery(getMetricsSchema),
  asyncHandler(async (req, res) => {
    const { forDate } = req.validatedQuery;
    const scope = req.scope || req.auth?.scope;
    const tenantId = scope?.tenantId || req.headers['x-tenant-id'] || '1';
    const siteId = req.headers['x-site-id'] || '1';
    const metrics = await getDashboardMetrics(tenantId, siteId);
    return res.json(metrics);
  })
);


router.get("/audit", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  const scope = req.scope || req.auth.scope;
  const limit    = Math.min(Number(req.query.limit  || 50), 500);
  const offset   = Number(req.query.offset || 0);
  const search   = req.query.search || req.query.q || '';
  const action   = req.query.action || '';
  const category = req.query.category || '';
  const { pool } = await import("../db/pool.js");
  const categoryMap = {
    'Attendance': ['attendance.%'],
    'Enrollment': ['face.enroll%'],
    'Employee':   ['employee.%'],
    'User':       ['user.%'],
    'Auth':       ['user.login%','user.logout%'],
    'HR':         ['dept.%','shift.%'],
    'Roster':     ['roster.%'],
    'Device':     ['nug.%','camera.%','building.%'],
    'Settings':   ['settings.%'],
  };
  let whereClauses = ["a.tenant_id = $1"];
  let params = [Number(scope.tenantId)];
  if (search) {
    params.push(`%${search}%`);
    whereClauses.push(`(a.action ILIKE $${params.length} OR a.details ILIKE $${params.length} OR COALESCE(a.user_name,'') ILIKE $${params.length} OR COALESCE(a.entity_name,'') ILIKE $${params.length} OR COALESCE(a.ip_address,'') ILIKE $${params.length})`);
  }
  if (action) {
    params.push(action);
    whereClauses.push(`a.action = $${params.length}`);
  }
  if (category && categoryMap[category]) {
    const prefixes = categoryMap[category];
    const clauses = prefixes.map(p => { params.push(p); return `a.action ILIKE $${params.length}`; });
    whereClauses.push(`(${clauses.join(' OR ')})`);
  }
  if (req.query.from) {
    params.push(req.query.from);
    whereClauses.push(`a.created_at >= $${params.length}`);
  }
  if (req.query.to) {
    params.push(req.query.to);
    whereClauses.push(`a.created_at <= $${params.length}::date + interval '1 day'`);
  }
  const where = whereClauses.join(' AND ');

  const { rows } = await pool.query(
    `SELECT
       a.pk_audit_id,
       a.action,
       a.details,
       a.ip_address,
       a.created_at,
       a.user_agent,
       a.method,
       a.entity_type,
       a.entity_id,
       a.entity_name,
       a.before_data,
       a.after_data,
       a.source,
       a.tenant_id,
       COALESCE(a.user_name, u.email, u.username) AS user_name,
       COALESCE(a.user_role, u.role)               AS user_role
     FROM audit_log a
     LEFT JOIN frs_user u ON u.pk_user_id = a.fk_user_id
     WHERE ${where}
     ORDER BY a.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  // Count total
  const countRes = await pool.query(
    `SELECT count(*)::int as total FROM audit_log a WHERE ${where}`,
    params
  );

  return res.json({ data: rows, total: countRes.rows[0].total });
}));


// GET /api/live/audit/summary — count per category
router.get("/audit/summary", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  const tenantId = req.auth?.scope?.tenantId || '1';
  const { pool } = await import("../db/pool.js");
  let whereClauses = [`tenant_id = $1`];
  let params = [Number(tenantId)];
  if (req.query.from) {
    params.push(req.query.from);
    whereClauses.push(`created_at >= $${params.length}`);
  }
  if (req.query.to) {
    params.push(req.query.to);
    whereClauses.push(`created_at <= $${params.length}::date + interval '1 day'`);
  }
  const where = whereClauses.join(' AND ');
  const { rows } = await pool.query(`
    SELECT
      CASE
        WHEN action LIKE 'attendance.%' THEN 'Attendance'
        WHEN action LIKE 'face.enroll%' THEN 'Enrollment'
        WHEN action LIKE 'employee.%'   THEN 'Employee'
        WHEN action LIKE 'user.%'       THEN 'User'
        WHEN action LIKE 'dept.%' OR action LIKE 'shift.%' THEN 'HR'
        WHEN action LIKE 'roster.%'     THEN 'Roster'
        WHEN action LIKE 'nug.%' OR action LIKE 'camera.%' OR action LIKE 'building.%' THEN 'Device'
        WHEN action LIKE 'settings.%'   THEN 'Settings'
        ELSE 'Other'
      END as category,
      COUNT(*)::int as count
    FROM audit_log
    WHERE ${where}
    GROUP BY category
    ORDER BY count DESC
  `, params);
  return res.json({ data: rows });
}));

// POST /api/live/alerts/mark-read — mark alert(s) as read
router.post("/alerts/mark-read", requirePermission("devices.read"), asyncHandler(async (req, res) => {
  const { ids } = req.body; // array of alert IDs, or empty for all
  const tenantId = req.auth?.scope?.tenantId || '1';
  const { pool } = await import("../db/pool.js");
  if (ids?.length) {
    await pool.query(
      `UPDATE system_alert SET is_read = true WHERE pk_alert_id = ANY($1::bigint[]) AND tenant_id = $2`,
      [ids, Number(tenantId)]
    );
  } else {
    await pool.query(
      `UPDATE system_alert SET is_read = true WHERE tenant_id = $1`,
      [Number(tenantId)]
    );
  }
  return res.json({ success: true });
}));


// DELETE /api/live/alerts — clear all alerts
router.delete("/alerts", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  const tenantId = req.auth?.scope?.tenantId || '1';
  const { pool } = await import("../db/pool.js");
  await pool.query(
    `DELETE FROM system_alert WHERE tenant_id = $1`,
    [Number(tenantId)]
  );
  return res.json({ success: true, message: 'All alerts cleared' });
}));


// GET /api/live/accuracy-trend — daily recognition confidence for last 7 days
router.get("/accuracy-trend", requirePermission("devices.read"), asyncHandler(async (req, res) => {
  const tenantId = req.auth?.scope?.tenantId || '1';
  const { pool } = await import("../db/pool.js");
  const { rows } = await pool.query(
    `SELECT
       TO_CHAR(attendance_date, 'Dy') as day,
       attendance_date,
       ROUND(AVG(recognition_confidence)::numeric * 100, 1) as accuracy,
       COUNT(*) as scans
     FROM attendance_record
     WHERE tenant_id = $1
       AND attendance_date >= CURRENT_DATE - INTERVAL '7 days'
       AND recognition_confidence IS NOT NULL
     GROUP BY attendance_date
     ORDER BY attendance_date ASC`,
    [Number(tenantId)]
  );

  const siteTz = await getSiteTimezone(req.auth?.scope?.siteId || req.headers['x-site-id'] || '1');
  // Fill missing days with 0
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: siteTz }).format(d);
    const day = new Intl.DateTimeFormat('en-US', { timeZone: siteTz, weekday: 'short' }).format(d);
    const found = rows.find(r => r.attendance_date?.toISOString?.()?.slice(0,10) === dateStr
                               || String(r.attendance_date).slice(0,10) === dateStr);
    result.push({
      day,
      accuracy: found ? Number(found.accuracy) : 0,
      scans: found ? Number(found.scans) : 0,
    });
  }
  return res.json({ data: result });
}));

// GET /api/live/trends — hourly check-in counts for today
router.get("/trends", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  const rows = await getAttendanceTrends(req.auth?.scope?.tenantId || '1');
  return res.json({ data: rows });
}));


// GET /api/live/trends/monthly — Last 30 days attendance
router.get("/trends/monthly", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  const rows = await getMonthlyAttendanceTrend(req.auth?.scope?.tenantId || '1');
  return res.json({ data: rows });
}));


router.get("/trends/departments", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  const rows = await getDepartmentAnalytics(req.auth?.scope?.tenantId || '1');
  return res.json({ data: rows });
}));
router.get("/trends/weekly", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  const tenantId = req.auth?.scope?.tenantId || req.headers['x-tenant-id'] || '1';
  const siteId   = req.headers['x-site-id'] || '1';
  const rows = await getWeeklyAnalytics(tenantId, siteId);
  return res.json({ data: rows });
}));

router.get("/calendar", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  const tenantId = req.auth?.scope?.tenantId || req.headers['x-tenant-id'] || '1';
  const siteId   = req.headers['x-site-id'] || '1';
  const year  = Number(req.query.year  || new Date().getFullYear());
  const month = Number(req.query.month || new Date().getMonth() + 1);
  const rows = await getMonthlyCalendar(tenantId, siteId, year, month);
  return res.json({ data: rows, year, month });
}));

router.get("/dept-shift-analytics", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  const tenantId = req.auth?.scope?.tenantId || req.headers['x-tenant-id'] || '1';
  const siteId   = req.headers['x-site-id'] || '1';
  const rows = await getDeptShiftAnalytics(tenantId, siteId);
  return res.json({ data: rows });
}));


router.get("/activity/hourly", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  const siteId = req.auth?.scope?.siteId || req.headers['x-site-id'] || '1';
  const data = await getHourlyActivity(siteId);
  return res.json({ data });
}));

export { router as liveRoutes };
