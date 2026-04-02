import { z } from "zod";
import { writeAudit } from "../middleware/auditLog.js";
import employeeService from "../services/business/EmployeeService.js";

const scopeHeaders = (req) => ({
  tenantId: String(req.headers["x-tenant-id"] || req.auth?.scope?.tenantId || ""),
  customerId: req.headers["x-customer-id"] ? String(req.headers["x-customer-id"]) : undefined,
  siteId: req.headers["x-site-id"] ? String(req.headers["x-site-id"]) : undefined,
  unitId: req.headers["x-unit-id"] ? String(req.headers["x-unit-id"]) : undefined,
});

const createSchema = z.object({
  employee_code: z.string(),
  full_name: z.string(),
  email: z.string().email(),
  position_title: z.string(),
  location_label: z.string().optional(),
  status: z.enum(["active", "inactive", "on-leave"]).optional(),
  join_date: z.string(),
  phone_number: z.string().optional(),
  fk_department_id: z.number().optional(),
  fk_shift_id: z.number().optional(),
});

const updateSchema = createSchema.partial();

const EmployeeController = {
  async getAllEmployees(req, res) {
    const qs = z.object({
      limit: z.coerce.number().optional(),
      department: z.string().optional(),
      status: z.enum(["active", "inactive", "on-leave"]).optional(),
    }).safeParse(req.query);
    if (!qs.success) return res.status(400).json({ message: "invalid query" });
    const data = await employeeService.getAllEmployees({
      scope: scopeHeaders(req),
      limit: qs.data.limit,
      department: qs.data.department,
      status: qs.data.status,
    });
    return res.json({ data });
  },

  async searchEmployees(req, res) {
    const qs = z.object({ q: z.string(), limit: z.coerce.number().optional() }).safeParse(req.query);
    if (!qs.success) return res.status(400).json({ message: "invalid query" });
    const data = await employeeService.searchEmployees({ scope: scopeHeaders(req), q: qs.data.q, limit: qs.data.limit });
    return res.json({ data });
  },

  async getEmployeeById(req, res) {
    const data = await employeeService.getEmployeeById({ employeeId: String(req.params.id), scope: scopeHeaders(req) });
    if (!data) return res.status(404).json({ message: "not found" });
    return res.json(data);
  },

  async getEmployeePhoto(req, res) {
    const data = await employeeService.getEmployeePhoto({ employeeId: String(req.params.id) });
    return res.json(data);
  },

  async getEmployeeAttendance(req, res) {
    const qs = z.object({ fromDate: z.string().optional(), toDate: z.string().optional() }).safeParse(req.query);
    if (!qs.success) return res.status(400).json({ message: "invalid query" });
    const data = await employeeService.getEmployeeAttendance({
      employeeId: String(req.params.id),
      fromDate: qs.data.fromDate,
      toDate: qs.data.toDate,
      scope: scopeHeaders(req),
    });
    return res.json({ data });
  },

  async getEmployeeActivity(req, res) {
    const data = await employeeService.getEmployeeActivity({ employeeId: String(req.params.id), scope: scopeHeaders(req) });
    return res.json(data);
  },

  async createEmployee(req, res) {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "invalid payload" });
    const row = await employeeService.createEmployee({ scope: scopeHeaders(req), data: parsed.data });
    await writeAudit({ req, action: 'employee.create',
      details: `Employee created: ${row.full_name} (${row.employee_code})`,
      entity_type: 'employee', entity_id: String(row.pk_employee_id), entity_name: row.full_name,
      after_data: JSON.stringify({ name: row.full_name, code: row.employee_code, department: row.fk_department_id }) }).catch(() => {});
    return res.status(201).json(row);
  },

  async updateEmployee(req, res) {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "invalid payload" });
    const row = await employeeService.updateEmployee({
      employeeId: String(req.params.id),
      patch: parsed.data,
      scope: scopeHeaders(req),
    });
    if (!row) return res.status(404).json({ message: "not found" });
    await writeAudit({ req, action: 'employee.update',
      details: `Employee updated: ${row.full_name}`,
      entity_type: 'employee', entity_id: String(row.pk_employee_id), entity_name: row.full_name,
      after_data: JSON.stringify(parsed.data) }).catch(() => {});
    return res.json(row);
  },

  async deleteEmployee(req, res) {
    const out = await employeeService.deleteEmployee({ employeeId: String(req.params.id), scope: scopeHeaders(req) });
    return res.json(out);
  },

  async activateEmployee(req, res) {
    await writeAudit({ req, action: 'employee.activate',
      details: `Employee ${req.params.id} activated` }).catch(() => {});
    const row = await employeeService.activateEmployee({ employeeId: String(req.params.id), scope: scopeHeaders(req) });
    return res.json(row);
  },

  async deactivateEmployee(req, res) {
    await writeAudit({ req, action: 'employee.deactivate',
      details: `Employee ${req.params.id} deactivated` }).catch(() => {});
    const row = await employeeService.deactivateEmployee({ employeeId: String(req.params.id), scope: scopeHeaders(req) });
    return res.json(row);
  },

  async assignDevice(req, res) {
    const parsed = z.object({ deviceId: z.string() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "invalid payload" });
    const out = await employeeService.assignDevice({ employeeId: String(req.params.id), deviceId: parsed.data.deviceId });
    return res.json(out);
  },

  async bulkImport(req, res) {
    const bulkRowSchema = z.object({
      employee_code:  z.string(),
      full_name:      z.string(),
      email:          z.string().email().optional().or(z.literal('')),
      position_title: z.string().optional().default(''),
      location_label: z.string().optional(),
      status:         z.enum(["active","inactive","on-leave"]).optional().default('active'),
      join_date:      z.string().optional(),
      phone_number:   z.string().optional(),
      fk_department_id: z.coerce.number().optional(),
      fk_shift_id:    z.coerce.number().optional(),
      department_name: z.string().optional(),
      shift_name:     z.string().optional(),
    });
    const parsed = z.object({ rows: z.array(bulkRowSchema) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "invalid payload", errors: parsed.error.errors });
    const out = await employeeService.bulkImport({ rows: parsed.data.rows, scope: scopeHeaders(req) });
    return res.json(out);
  },
};

export default EmployeeController;

