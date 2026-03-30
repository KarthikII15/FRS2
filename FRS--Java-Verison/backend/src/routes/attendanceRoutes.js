import { pool } from "../db/pool.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getSiteTimezone } from "../repositories/liveRepository.js";
import express from "express";
import { requireAuth, requirePermission } from "../middleware/authz.js";
import AttendanceController from "../controllers/AttendanceController.js";
import attendanceService from "../services/business/AttendanceService.js";

const router = express.Router();
router.use(requireAuth);

router.post("/mark", requirePermission("attendance.write"), AttendanceController.markAttendance);
router.post("/batch", requirePermission("attendance.write"), AttendanceController.batchMarkAttendance);
router.get("/today", requirePermission("attendance.read"), AttendanceController.getTodayAttendance);
router.get("/employee/:employeeId", requirePermission("attendance.read"), AttendanceController.getEmployeeAttendance);
router.get("/date-range", requirePermission("attendance.read"), AttendanceController.getAttendanceByDateRange);
router.get("/current", requirePermission("attendance.read"), AttendanceController.getCurrentlyPresent);
router.get("/stats", requirePermission("analytics.read"), AttendanceController.getAttendanceStats);
router.get("/reports/daily", requirePermission("analytics.read"), AttendanceController.getDailyReport);
router.get("/reports/monthly", requirePermission("analytics.read"), AttendanceController.getMonthlyReport);
router.get("/reports/export", requirePermission("analytics.read"), AttendanceController.exportAttendance);
router.put("/:id/correct", requirePermission("attendance.write"), AttendanceController.correctAttendance);
router.delete("/:id", requirePermission("attendance.write"), AttendanceController.deleteAttendance);


// GET /api/attendance/export/csv — download attendance as CSV
router.get('/export/csv', requireAuth, requirePermission('attendance.read'), asyncHandler(async (req, res) => {
  const scope = req.auth?.scope || {};
  const { fromDate, toDate, status } = req.query;
  const tenantId = req.headers['x-tenant-id'] || scope.tenantId || '1';

  let where = ['a.tenant_id = $1'];
  let params = [Number(tenantId)];

  if (fromDate) { params.push(fromDate); where.push(`a.attendance_date >= $${params.length}`); }
  if (toDate)   { params.push(toDate);   where.push(`a.attendance_date <= $${params.length}`); }
  if (status)   { params.push(status);   where.push(`a.status = $${params.length}`); }

  const { rows } = await pool.query(
    `SELECT
       e.full_name, e.employee_code, d.name as department,
       a.attendance_date, a.check_in, a.check_out,
       a.status, a.working_hours, a.overtime_hours,
       a.is_late, a.recognition_confidence
     FROM attendance_record a
     JOIN hr_employee e ON e.pk_employee_id = a.fk_employee_id
     LEFT JOIN hr_department d ON d.pk_department_id = e.fk_department_id
     WHERE ${where.join(' AND ')}
     ORDER BY a.attendance_date DESC, e.full_name`,
    params
  );

  const siteTz = await getSiteTimezone(scope.siteId);
  const fmtTime = (iso) => iso
    ? new Date(iso).toLocaleTimeString('en-US', { timeZone: siteTz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '';

  const headers = ['Name','Code','Department','Date','Check In','Check Out','Status','Hours','Overtime','Late','Confidence'];
  const csvRows = rows.map(r => [
    r.full_name, r.employee_code, r.department || '',
    r.attendance_date?.slice(0,10) || '',
    fmtTime(r.check_in),
    fmtTime(r.check_out),
    r.status, r.working_hours || 0, r.overtime_hours || 0,
    r.is_late ? 'Yes' : 'No',
    r.recognition_confidence ? (r.recognition_confidence * 100).toFixed(1) + '%' : ''
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv = [headers.join(','), ...csvRows].join('\n');
  const filename = `attendance-${fromDate || 'all'}-to-${toDate || 'today'}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
}));


// POST /api/attendance/frame — called by Jetson to store proof photo URL
router.post('/frame', asyncHandler(async (req, res) => {
  const { frameUrl, employeeId, date, type } = req.body;
  if (!frameUrl || !employeeId) return res.status(400).json({ message: 'frameUrl and employeeId required' });
  const col = type === 'checkout' ? 'checkout_frame_url' : 'checkin_frame_url';
  await pool.query(
    `UPDATE attendance_record
     SET ${col} = $1, frame_url = COALESCE(frame_url, $1)
     WHERE fk_employee_id = $2
       AND attendance_date = $3
       AND tenant_id = $4`,
    [frameUrl, Number(employeeId), date || new Date().toISOString().slice(0,10),
     req.auth?.scope?.tenantId || 1]
  );
  return res.json({ ok: true });
}));


// POST /api/attendance/direction — called by Jetson after direction is determined
router.post('/direction', asyncHandler(async (req, res) => {
  const { employeeId, direction, trackId, deviceId, timestamp } = req.body;
  if (!employeeId || !direction) 
    return res.status(400).json({ message: 'employeeId and direction required' });

  const ts = timestamp || new Date().toISOString();
  const scope = {
    tenantId:   String(req.headers['x-tenant-id']   || req.auth?.scope?.tenantId   || '1'),
    customerId: req.headers['x-customer-id'] ? String(req.headers['x-customer-id']) : undefined,
    siteId:     req.headers['x-site-id']     ? String(req.headers['x-site-id'])     : undefined,
  };

  console.log(`[Direction] employee=${employeeId} direction=${direction} track=${trackId}`);

  const record = await attendanceService.markAttendance({
    employeeId: String(employeeId),
    deviceId,
    timestamp: ts,
    confidence: 0,
    direction,
    trackId,
    scope,
  });

  return res.json({ ok: true, direction, record });
}));

export { router as attendanceRoutes };

