import { writeAudit } from '../../middleware/auditLog.js';
import { query } from "../../db/pool.js";
import * as authRepo from "../../repositories/authRepository.js";

/**
 * EmployeeService
 * Employee CRUD and activity aggregation.
 */
class EmployeeService {
  /**
   * List employees with optional filters.
   * @param {{scope:{tenantId:string,customerId?:string,siteId?:string,unitId?:string}, limit?:number, department?:string, status?:'active'|'inactive'|'on-leave'}} params
   */
  async getAllEmployees({ scope, limit = 200, department, status }) {
    const values = [scope.tenantId];
    let idx = 2;
    const filters = ["e.tenant_id = $1"];
    if (department) {
      filters.push(`d.name = $${idx++}`); values.push(department);
    }
    if (status) {
      filters.push(`e.status = $${idx++}`); values.push(status);
    }
    const sql = `
      select e.*, 
             d.name as department_name, 
             s.name as shift_name, 
             s.shift_type,
             CASE WHEN COUNT(emb.id) > 0 THEN true ELSE false END as enrolled,
             COUNT(emb.id)::int as embedding_count
      from hr_employee e
      left join hr_department d on d.pk_department_id = e.fk_department_id
      left join hr_shift s on s.pk_shift_id = e.fk_shift_id
      left join employee_face_embeddings emb on emb.employee_id = e.pk_employee_id
      where ${filters.join(" and ")}
      group by e.pk_employee_id, d.name, s.name, s.shift_type
      order by e.full_name
      limit ${limit}`;
    const res = await query(sql, values);
    return res.rows;
  }

  /**
   * Search employees by name/code/email.
   * @param {{scope:{tenantId:string}, q:string, limit?:number}} params
   */
  async searchEmployees({ scope, q, limit = 50 }) {
    const like = `%${q}%`;
    const res = await query(
      `select pk_employee_id, employee_code, full_name, email, position_title, status
       from hr_employee
       where tenant_id = $1 and (full_name ilike $2 or employee_code ilike $2 or email ilike $2)
       order by full_name
       limit $3`,
      [scope.tenantId, like, limit]
    );
    return res.rows;
  }

  /**
   * Get employee by id.
   * @param {{employeeId:string, scope:{tenantId:string}}} params
   */
  async getEmployeeById({ employeeId, scope }) {
    const res = await query(
      `SELECT e.*,
        d.name as department_name, d.code as department_code, d.color as department_color,
        s.name as shift_name, s.shift_type, s.start_time, s.end_time, s.grace_period_minutes
       FROM hr_employee e
       LEFT JOIN hr_department d ON d.pk_department_id = e.fk_department_id
       LEFT JOIN hr_shift s ON s.pk_shift_id = e.fk_shift_id
       WHERE e.pk_employee_id = $1 AND e.tenant_id = $2`,
      [Number(employeeId), scope.tenantId]
    );
    return res.rows[0] || null;
  }

  /**
   * Placeholder for fetching employee photo.
   * @param {{employeeId:string}} params
   */
  async getEmployeePhoto({ employeeId }) {
    return { employeeId, url: null };
  }

  /**
   * Attendance overview for employee.
   * @param {{employeeId:string, fromDate?:string, toDate?:string, scope:{tenantId:string}}} params
   */
  async getEmployeeAttendance({ employeeId, fromDate, toDate, scope }) {
    const values = [Number(employeeId), scope.tenantId];
    let idx = 3;
    const filters = ["a.fk_employee_id = $1", "a.tenant_id = $2"];
    if (fromDate) { filters.push(`a.attendance_date >= $${idx++}`); values.push(fromDate); }
    if (toDate) { filters.push(`a.attendance_date <= $${idx++}`); values.push(toDate); }
    const res = await query(
      `select * from attendance_record a where ${filters.join(" and ")} order by attendance_date desc`,
      values
    );
    return res.rows;
  }

  /**
   * Recent activity for employee (alerts and device scans).
   * @param {{employeeId:string, scope:{tenantId:string}}} params
   */
  async getEmployeeActivity({ employeeId, scope }) {
    const alerts = await query(
      `select * from system_alert where fk_employee_id = $1 and tenant_id = $2 order by created_at desc limit 50`,
      [Number(employeeId), scope.tenantId]
    );
    return { alerts: alerts.rows };
  }

  /**
   * Create new employee.
   * @param {{scope:{tenantId:string,customerId?:string,siteId?:string,unitId?:string}, data:any}} params
   */
  async createEmployee({ scope, data }) {
    const sql = `
      insert into hr_employee(
        tenant_id, customer_id, site_id, unit_id, fk_department_id, fk_shift_id,
        employee_code, full_name, email, position_title, location_label, status, join_date, phone_number
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      returning *`;
    const values = [
      scope.tenantId, scope.customerId || null, scope.siteId || null, scope.unitId || null,
      data.fk_department_id || null, data.fk_shift_id || null,
      data.employee_code, data.full_name, data.email, data.position_title,
      data.location_label || null, data.status || "active", data.join_date, data.phone_number || null
    ];
    const res = await query(sql, values);
    return res.rows[0];
  }

  /**
   * Update employee.
   * @param {{employeeId:string, patch:any, scope:{tenantId:string}}} params
   */
  async updateEmployee({ employeeId, patch, scope }) {
    const fields = [];
    const values = [];
    let idx = 1;
    for (const [k, v] of Object.entries(patch || {})) {
      fields.push(`${k} = $${idx++}`);
      values.push(v);
    }
    values.push(Number(employeeId));
    values.push(scope.tenantId);
    const res = await query(
      `update hr_employee set ${fields.join(", ")}
       where pk_employee_id = $${idx++} and tenant_id = $${idx}
       returning *`,
      values
    );
    return res.rows[0] || null;
  }

  /**
   * Delete employee.
   * @param {{employeeId:string, scope:{tenantId:string}}} params
   */
  async deleteEmployee({ employeeId, scope }) {
    await query(`delete from hr_employee where pk_employee_id = $1 and tenant_id = $2`, [Number(employeeId), scope.tenantId]);
    return { success: true };
  }

  /**
   * Activate employee.
   * @param {{employeeId:string, scope:{tenantId:string}}} params
   */
  async activateEmployee({ employeeId, scope }) {
    return this.updateEmployee({ employeeId, scope, patch: { status: "active" } });
  }

  /**
   * Deactivate employee.
   * @param {{employeeId:string, scope:{tenantId:string}}} params
   */
  async deactivateEmployee({ employeeId, scope }) {
    return this.updateEmployee({ employeeId, scope, patch: { status: "inactive" } });
  }

  /**
   * Assign device (placeholder mapping table).
   * @param {{employeeId:string, deviceId:string}} params
   */
  async assignDevice({ employeeId, deviceId }) {
    return { employeeId, deviceId, assigned: true };
  }

  /**
   * Bulk import basic employees.
   * @param {{rows:Array<any>, scope:{tenantId:string}}} params
   */
  async bulkImport({ rows, scope }) {
    const { query } = await import("../../db/pool.js");
    const results = [];

    // Pre-load departments and shifts for name resolution
    const deptRes = await query(
      `SELECT pk_department_id, name, code FROM hr_department WHERE tenant_id = $1`,
      [scope.tenantId]
    );
    const shiftRes = await query(
      `SELECT pk_shift_id, name FROM hr_shift WHERE tenant_id = $1`,
      [scope.tenantId]
    );
    const deptMap = {};
    deptRes.rows.forEach(d => {
      deptMap[d.name.toLowerCase()] = d.pk_department_id;
      deptMap[d.code?.toLowerCase()] = d.pk_department_id;
    });
    const shiftMap = {};
    shiftRes.rows.forEach(s => { shiftMap[s.name.toLowerCase()] = s.pk_shift_id; });

    for (const r of rows || []) {
      const rowResult = { row: r, status: 'error', message: '' };
      try {
        // Validate required fields
        if (!r.employee_code) { rowResult.message = 'employee_code is required'; results.push(rowResult); continue; }
        if (!r.full_name)     { rowResult.message = 'full_name is required';     results.push(rowResult); continue; }

        // Check for duplicate employee_code
        const exists = await query(
          `SELECT pk_employee_id FROM hr_employee WHERE employee_code = $1 AND tenant_id = $2`,
          [r.employee_code, scope.tenantId]
        );
        if (exists.rows.length > 0) {
          rowResult.status = 'skipped';
          rowResult.message = `Employee code ${r.employee_code} already exists`;
          results.push(rowResult);
          continue;
        }

        // Resolve department name → id
        if (r.department_name && !r.fk_department_id) {
          r.fk_department_id = deptMap[r.department_name.toLowerCase()] ?? null;
        }
        // Resolve shift name → id
        if (r.shift_name && !r.fk_shift_id) {
          r.fk_shift_id = shiftMap[r.shift_name.toLowerCase()] ?? null;
        }

        await this.createEmployee({ scope, data: r });
        rowResult.status = 'created';
        rowResult.message = `${r.full_name} created successfully`;
      } catch (e) {
        rowResult.message = e.message ?? 'Unknown error';
      }
      results.push(rowResult);
    }

    const created = results.filter(r => r.status === 'created').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const errors  = results.filter(r => r.status === 'error').length;
    return { created, skipped, errors, results };
  }
}

const employeeService = new EmployeeService();
export default employeeService;

