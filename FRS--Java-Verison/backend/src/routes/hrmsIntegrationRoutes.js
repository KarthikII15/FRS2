import express from 'express';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { pool } from '../db/pool.js';
import multer from 'multer';
import csv from 'csv-parser';
import { Readable } from 'stream';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

/**
 * POST /api/hrms/webhook/employee
 * Webhook receiver for HR system employee events
 * Expects: { event_type, employee_data }
 */
router.post('/webhook/employee', asyncHandler(async (req, res) => {
  const { event_type, employee_data, api_key } = req.body;

  // Validate API key (you should store this securely)
  const expectedApiKey = process.env.HRMS_WEBHOOK_API_KEY || 'CHANGE_THIS_WEBHOOK_KEY_2026';
  if (api_key !== expectedApiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  if (!event_type || !employee_data) {
    return res.status(400).json({ error: 'event_type and employee_data are required' });
  }

  const tenantId = employee_data.tenant_id || 1;

  await pool.query('BEGIN');

  try {
    switch (event_type) {
      case 'employee.created':
      case 'employee.hired':
        await handleEmployeeCreated(employee_data, tenantId);
        break;
      
      case 'employee.updated':
        await handleEmployeeUpdated(employee_data, tenantId);
        break;
      
      case 'employee.terminated':
        await handleEmployeeTerminated(employee_data, tenantId);
        break;
      
      default:
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: `Unknown event_type: ${event_type}` });
    }

    await pool.query('COMMIT');
    
    res.json({
      success: true,
      message: `Employee ${event_type} processed successfully`,
      employee_code: employee_data.employee_code
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Failed to process webhook', details: error.message });
  }
}));

/**
 * POST /api/hrms/employees/bulk-import
 * CSV bulk import for employee data
 */
router.post('/employees/bulk-import', requireAuth, requirePermission('employees.write'), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is required' });
  }

  const tenantId = req.auth?.scope?.tenantId || 1;
  const userId = req.auth?.user?.id;
  
  const employees = [];
  const errors = [];
  let lineNumber = 1;

  // Parse CSV
  const stream = Readable.from(req.file.buffer.toString());
  
  await new Promise((resolve, reject) => {
    stream
      .pipe(csv())
      .on('data', (row) => {
        lineNumber++;
        try {
          // Validate required fields
          if (!row.employee_code || !row.first_name || !row.last_name) {
            errors.push(`Line ${lineNumber}: Missing required fields (employee_code, first_name, last_name)`);
            return;
          }

          employees.push({
            employee_code: row.employee_code.trim(),
            first_name: row.first_name.trim(),
            last_name: row.last_name.trim(),
            email: row.email?.trim() || null,
            phone: row.phone?.trim() || null,
            department: row.department?.trim() || null,
            designation: row.designation?.trim() || null,
            site_id: row.site_id ? parseInt(row.site_id) : null,
            status: row.status?.toLowerCase() || 'active',
            hire_date: row.hire_date || null
          });
        } catch (err) {
          errors.push(`Line ${lineNumber}: ${err.message}`);
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  if (employees.length === 0) {
    return res.status(400).json({ 
      error: 'No valid employees found in CSV',
      errors 
    });
  }

  // Insert employees
  await pool.query('BEGIN');
  const inserted = [];
  const updated = [];
  const failed = [];

  try {
    for (const emp of employees) {
      try {
        // Check if employee exists
        const existing = await pool.query(
          'SELECT pk_employee_id FROM hr_employee WHERE tenant_id = $1 AND employee_code = $2',
          [tenantId, emp.employee_code]
        );

        if (existing.rows.length > 0) {
          // Update existing
          await pool.query(`
            UPDATE hr_employee SET
              first_name = $1,
              last_name = $2,
              email = $3,
              phone = $4,
              department = $5,
              designation = $6,
              status = $7
            WHERE tenant_id = $8 AND employee_code = $9
          `, [emp.first_name, emp.last_name, emp.email, emp.phone, 
              emp.department, emp.designation, emp.status, tenantId, emp.employee_code]);
          
          updated.push(emp.employee_code);
        } else {
          // Insert new
          await pool.query(`
            INSERT INTO hr_employee (
              tenant_id, employee_code, first_name, last_name, email, phone,
              department, designation, status, hire_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [tenantId, emp.employee_code, emp.first_name, emp.last_name, 
              emp.email, emp.phone, emp.department, emp.designation, 
              emp.status, emp.hire_date]);
          
          inserted.push(emp.employee_code);
        }
      } catch (err) {
        failed.push({ employee_code: emp.employee_code, error: err.message });
      }
    }

    await pool.query('COMMIT');

    res.json({
      success: true,
      summary: {
        total: employees.length,
        inserted: inserted.length,
        updated: updated.length,
        failed: failed.length
      },
      inserted,
      updated,
      failed,
      validation_errors: errors
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}));

/**
 * POST /api/hrms/employees/sync
 * Programmatic employee sync API
 */
router.post('/employees/sync', requireAuth, requirePermission('employees.write'), asyncHandler(async (req, res) => {
  const { employees } = req.body;
  const tenantId = req.auth?.scope?.tenantId || 1;

  if (!Array.isArray(employees) || employees.length === 0) {
    return res.status(400).json({ error: 'employees array is required' });
  }

  await pool.query('BEGIN');
  const results = { inserted: [], updated: [], failed: [] };

  try {
    for (const emp of employees) {
      if (!emp.employee_code || !emp.first_name || !emp.last_name) {
        results.failed.push({ 
          employee_code: emp.employee_code || 'unknown', 
          error: 'Missing required fields' 
        });
        continue;
      }

      try {
        const existing = await pool.query(
          'SELECT pk_employee_id FROM hr_employee WHERE tenant_id = $1 AND employee_code = $2',
          [tenantId, emp.employee_code]
        );

        if (existing.rows.length > 0) {
          await pool.query(`
            UPDATE hr_employee SET
              first_name = $1, last_name = $2, email = $3, phone = $4,
              department = $5, designation = $6, status = $7
            WHERE tenant_id = $8 AND employee_code = $9
          `, [emp.first_name, emp.last_name, emp.email, emp.phone,
              emp.department, emp.designation, emp.status || 'active',
              tenantId, emp.employee_code]);
          
          results.updated.push(emp.employee_code);
        } else {
          await pool.query(`
            INSERT INTO hr_employee (
              tenant_id, employee_code, first_name, last_name, email, phone,
              department, designation, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [tenantId, emp.employee_code, emp.first_name, emp.last_name,
              emp.email, emp.phone, emp.department, emp.designation,
              emp.status || 'active']);
          
          results.inserted.push(emp.employee_code);
        }
      } catch (err) {
        results.failed.push({ employee_code: emp.employee_code, error: err.message });
      }
    }

    await pool.query('COMMIT');

    res.json({
      success: true,
      summary: {
        total: employees.length,
        inserted: results.inserted.length,
        updated: results.updated.length,
        failed: results.failed.length
      },
      ...results
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}));

/**
 * GET /api/hrms/enrollment-queue
 * Get employees pending face enrollment
 */
router.get('/enrollment-queue', requireAuth, requirePermission('employees.read'), asyncHandler(async (req, res) => {
  const tenantId = req.auth?.scope?.tenantId || 1;

  const result = await pool.query(`
    SELECT 
      e.pk_employee_id,
      e.employee_code,
      e.first_name,
      e.last_name,
      e.email,
      e.department,
      e.designation,
      e.hire_date,
      e.status,
      COUNT(ep.id) as photos_count,
      CASE WHEN COUNT(ep.id) >= 5 THEN true ELSE false END as enrollment_complete
    FROM hr_employee e
    LEFT JOIN employee_face_embeddings ep ON e.pk_employee_id = ep.employee_id
    WHERE e.tenant_id = $1 AND e.status = 'active'
    GROUP BY e.pk_employee_id
    HAVING COUNT(ep.id) < 5
    ORDER BY e.hire_date DESC
  `, [tenantId]);

  res.json({
    success: true,
    pending_enrollment: result.rows.length,
    employees: result.rows
  });
}));

// Helper functions
async function handleEmployeeCreated(data, tenantId) {
  const { employee_code, first_name, last_name, email, phone, department, designation, hire_date } = data;

  await pool.query(`
    INSERT INTO hr_employee (
      tenant_id, employee_code, first_name, last_name, email, phone,
      department, designation, status, hire_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
    ON CONFLICT (tenant_id, employee_code) DO NOTHING
  `, [tenantId, employee_code, first_name, last_name, email, phone, department, designation, hire_date]);
}

async function handleEmployeeUpdated(data, tenantId) {
  const { employee_code, first_name, last_name, email, phone, department, designation } = data;

  await pool.query(`
    UPDATE hr_employee SET
      first_name = $1, last_name = $2, email = $3, phone = $4,
      department = $5, designation = $6
    WHERE tenant_id = $7 AND employee_code = $8
  `, [first_name, last_name, email, phone, department, designation, tenantId, employee_code]);
}

async function handleEmployeeTerminated(data, tenantId) {
  const { employee_code, termination_date } = data;

  await pool.query(`
    UPDATE hr_employee SET
      status = 'terminated',
      termination_date = $1
    WHERE tenant_id = $2 AND employee_code = $3
  `, [termination_date || new Date(), tenantId, employee_code]);
}

export default router;
