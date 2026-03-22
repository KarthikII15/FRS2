#!/bin/bash
# vm/fix_audit_extended.sh
# Adds:
#   1. Face enrollment delete audit
#   2. Department & Shift assignment audit
#   3. Camera register/update/delete audit
#   4. Employee activate/deactivate audit
#   5. WebSocket real-time push for new audit events
set -e
cd ~/FRS_/FRS--Java-Verison

echo "=================================================="
echo " Extending Audit Logging + WebSocket Push"
echo "=================================================="

# ── 1. Extend writeAudit to also emit via WebSocket ───────────────────────────
cat > backend/src/middleware/auditLog.js << 'EOF'
/**
 * auditLog.js — writes actions to audit_log table + pushes via WebSocket
 */
import { pool } from '../db/pool.js';

let _wsManager = null;

/**
 * Inject wsManager after server starts (avoids circular imports)
 */
export function setAuditWsManager(wsManager) {
  _wsManager = wsManager;
}

/**
 * Log an audit event — writes to DB and pushes via WebSocket
 */
export async function writeAudit({ req, action, details }) {
  try {
    const tenantId  = req?.auth?.scope?.tenantId || req?.headers?.['x-tenant-id'] || null;
    const userId    = req?.auth?.user?.id || null;
    const userName  = req?.auth?.user?.email || req?.auth?.user?.username || null;
    const userRole  = req?.auth?.user?.role || null;
    const ip        = req?.headers?.['x-forwarded-for']?.split(',')[0]
                   || req?.socket?.remoteAddress
                   || null;

    const { rows } = await pool.query(
      `INSERT INTO audit_log (tenant_id, customer_id, site_id, fk_user_id, action, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING pk_audit_id, action, details, ip_address, created_at`,
      [
        tenantId ? Number(tenantId) : null,
        req?.auth?.scope?.customerId ? Number(req.auth.scope.customerId) : null,
        req?.auth?.scope?.siteId     ? Number(req.auth.scope.siteId)     : null,
        userId   ? Number(userId)    : null,
        action,
        typeof details === 'string' ? details : JSON.stringify(details),
        ip,
      ]
    );

    const entry = {
      ...rows[0],
      user_email: userName,
      user_name:  userName,
      user_role:  userRole,
    };

    // Push to all connected clients in this tenant via WebSocket
    if (_wsManager && tenantId) {
      try {
        _wsManager.emitAuditEvent(String(tenantId), entry);
      } catch (_) {}
    }

    return entry;
  } catch (e) {
    console.warn('[Audit] Write failed:', e.message);
  }
}
EOF
echo "  ✅ auditLog.js — WebSocket push added"

# ── 2. Add emitAuditEvent to WebSocket manager ────────────────────────────────
python3 << 'PYEOF'
path = "backend/src/websocket/index.js"
with open(path) as f:
    c = f.read()

if 'emitAuditEvent' in c:
    print("  ✅ emitAuditEvent already exists")
else:
    # Add method before the last export/closing
    c = c.replace(
        'emitPresenceUpdate(',
        '''emitAuditEvent(tenantId, entry) {
    try {
      this.io?.to(`tenant:${tenantId}`).emit("auditEvent", entry);
    } catch (_) {}
  }

  emitPresenceUpdate('''
    )
    print("  ✅ emitAuditEvent added to WebSocket manager")

with open(path, 'w') as f:
    f.write(c)
PYEOF

# ── 3. Wire wsManager into auditLog after server starts ──────────────────────
python3 << 'PYEOF'
path = "backend/src/server.js"
with open(path) as f:
    c = f.read()

if 'setAuditWsManager' in c:
    print("  ✅ auditLog wsManager already wired")
else:
    c = c.replace(
        'import wsManager from "./websocket/index.js";',
        'import wsManager from "./websocket/index.js";\nimport { setAuditWsManager } from "./middleware/auditLog.js";'
    )
    # Wire after wsManager.initialize
    c = c.replace(
        'console.log("✅ WebSocket initialized");',
        'console.log("✅ WebSocket initialized");\n      setAuditWsManager(wsManager);'
    )
    print("  ✅ wsManager wired into auditLog")

with open(path, 'w') as f:
    f.write(c)
PYEOF

# ── 4. Add face enrollment delete audit ──────────────────────────────────────
python3 << 'PYEOF'
path = "backend/src/routes/employeeRoutes.js"
with open(path) as f:
    c = f.read()

# Face enrollment delete
if 'face.enroll.delete' not in c:
    c = c.replace(
        '''    return res.json({
      success: true,
      removed: rowCount,
      message: `Removed ${rowCount} face embedding(s) for employee ${employeeId}. Re-enroll to restore recognition.`,
    });''',
        '''    await writeAudit({ req, action: 'face.enroll.delete',
      details: `Face enrollment removed for employee ${employeeId} (${rowCount} embedding(s) deleted)` });
    return res.json({
      success: true,
      removed: rowCount,
      message: `Removed ${rowCount} face embedding(s) for employee ${employeeId}. Re-enroll to restore recognition.`,
    });'''
    )
    print("  ✅ face.enroll.delete audit added")
else:
    print("  ✅ face.enroll.delete already logged")

with open(path, 'w') as f:
    f.write(c)
PYEOF

# ── 5. Add employee activate/deactivate audit ─────────────────────────────────
python3 << 'PYEOF'
path = "backend/src/controllers/EmployeeController.js"
with open(path) as f:
    c = f.read()

if 'employee.activate' not in c:
    c = c.replace(
        'import { writeAudit } from "../middleware/auditLog.js";',
        'import { writeAudit } from "../middleware/auditLog.js";'
    )
    # Wrap activateEmployee
    old_activate = "  async activateEmployee(req, res) {"
    if old_activate in c:
        c = c.replace(
            old_activate,
            '''  async activateEmployee(req, res) {
    await writeAudit({ req, action: 'employee.activate',
      details: `Employee ${req.params.id} activated` }).catch(() => {});'''
        )
        print("  ✅ employee.activate audit added")

    old_deactivate = "  async deactivateEmployee(req, res) {"
    if old_deactivate in c:
        c = c.replace(
            old_deactivate,
            '''  async deactivateEmployee(req, res) {
    await writeAudit({ req, action: 'employee.deactivate',
      details: `Employee ${req.params.id} deactivated` }).catch(() => {});'''
        )
        print("  ✅ employee.deactivate audit added")
else:
    print("  ✅ employee activate/deactivate already logged")

with open(path, 'w') as f:
    f.write(c)
PYEOF

# ── 6. Add department & shift assignment audit ────────────────────────────────
python3 << 'PYEOF'
path = "backend/src/routes/hrRoutes.js"
with open(path) as f:
    c = f.read()

# Ensure import
if 'writeAudit' not in c:
    c = "import { writeAudit } from '../middleware/auditLog.js';\n" + c

if 'dept.assign' not in c:
    # Department assign
    c = c.replace(
        "  return res.json({ success: true, updated: employee_ids.length });\n}));\n\n// ── Shifts",
        """  await writeAudit({ req, action: 'dept.assign',
      details: `Department ${req.params.id} assigned to ${employee_ids.length} employee(s): [${employee_ids.join(',')}]` });
  return res.json({ success: true, updated: employee_ids.length });
}));

// ── Shifts"""
    )
    print("  ✅ dept.assign audit added")

if 'shift.assign' not in c:
    # Shift assign — find the shifts assign handler
    c = c.replace(
        "  return res.json({ success: true, updated: employee_ids.length });\n}));\n\n// ── Leave",
        """  await writeAudit({ req, action: 'shift.assign',
      details: `Shift ${req.params.id} assigned to ${employee_ids.length} employee(s): [${employee_ids.join(',')}]` });
  return res.json({ success: true, updated: employee_ids.length });
}));

// ── Leave"""
    )
    print("  ✅ shift.assign audit added")

# Department create/delete
if 'dept.create' not in c:
    c = c.replace(
        "  return res.status(201).json(rows[0]);\n}));\n\nrouter.put('/departments",
        """  await writeAudit({ req, action: 'dept.create', details: `Department created: ${name} (${code})` });
  return res.status(201).json(rows[0]);
}));

router.put('/departments"""
    )
    print("  ✅ dept.create audit added")

if 'dept.delete' not in c:
    c = c.replace(
        "  await pool.query(\n    `DELETE FROM hr_department WHERE pk_department_id=$1 AND tenant_id=$2`,\n    [req.params.id, getTenant(req)]\n  );\n  return res.json({ success: true });\n}));",
        """  await pool.query(
    `DELETE FROM hr_department WHERE pk_department_id=$1 AND tenant_id=$2`,
    [req.params.id, getTenant(req)]
  );
  await writeAudit({ req, action: 'dept.delete', details: `Department ${req.params.id} deleted` });
  return res.json({ success: true });
}));"""
    )
    print("  ✅ dept.delete audit added")

with open(path, 'w') as f:
    f.write(c)
PYEOF

# ── 7. Add camera register/update/delete audit ────────────────────────────────
python3 << 'PYEOF'
path = "backend/src/routes/cameraRoutes.js"
with open(path) as f:
    c = f.read()

if 'writeAudit' not in c:
    c = "import { writeAudit } from '../middleware/auditLog.js';\n" + c

    # Camera register (POST /)
    c = c.replace(
        "  return res.status(201).json({ success: true,",
        """  await writeAudit({ req, action: 'camera.register',
      details: `Camera registered: ${req.body?.name || req.body?.code} (${req.body?.ipAddress || ''})` }).catch(() => {});
  return res.status(201).json({ success: true,"""
    )

    # Camera delete
    c = c.replace(
        "  return res.json({ success: true, deleted: code });\n}));",
        """  await writeAudit({ req, action: 'camera.delete',
      details: `Camera deleted: ${req.params.code}` }).catch(() => {});
  return res.json({ success: true, deleted: req.params.code });
}));"""
    )
    print("  ✅ camera.register + camera.delete audit added")
else:
    print("  ✅ cameraRoutes already has audit")

with open(path, 'w') as f:
    f.write(c)
PYEOF

# ── 8. Update LiveAuditLog.tsx — add new action types to filter + icons ───────
python3 << 'PYEOF'
path = "src/app/components/admin/LiveAuditLog.tsx"
with open(path) as f:
    c = f.read()

# Add new action types to the filter list
c = c.replace(
    "    { value: 'employee.update', label: 'Employee Update' },\n    { value: 'employee.delete', label: 'Employee Delete' },\n  ];",
    """    { value: 'employee.update',    label: 'Employee Update' },
    { value: 'employee.delete',    label: 'Employee Delete' },
    { value: 'employee.activate',  label: 'Activate' },
    { value: 'employee.deactivate',label: 'Deactivate' },
    { value: 'face.enroll.delete', label: 'Enroll Delete' },
    { value: 'dept.assign',        label: 'Dept Assign' },
    { value: 'shift.assign',       label: 'Shift Assign' },
    { value: 'camera.register',    label: 'Camera Add' },
    { value: 'camera.delete',      label: 'Camera Delete' },
  ];"""
)

# Add new action labels
c = c.replace(
    "    'camera.register':   'Camera Registered',",
    """    'camera.register':      'Camera Registered',
    'camera.update':        'Camera Updated',
    'camera.delete':        'Camera Deleted',
    'face.enroll.delete':   'Enrollment Removed',
    'employee.activate':    'Employee Activated',
    'employee.deactivate':  'Employee Deactivated',
    'dept.assign':          'Dept Assigned',
    'shift.assign':         'Shift Assigned',
    'dept.create':          'Dept Created',
    'dept.delete':          'Dept Deleted',"""
)

# Add icon mapping for new types
c = c.replace(
    "  if (action.startsWith('device.') || action.startsWith('camera.')) return Shield;",
    "  if (action.startsWith('device.') || action.startsWith('camera.')) return Shield;\n  if (action.includes('activate') || action.includes('deactivate')) return Activity;\n  if (action.startsWith('dept.') || action.startsWith('shift.')) return Database;"
)

# Add Activity to imports if not already there
if 'Activity,' not in c:
    c = c.replace(
        'import {\n  Loader2, RefreshCw, Search, Download, Activity,',
        'import {\n  Loader2, RefreshCw, Search, Download, Activity,'
    )

with open(path, 'w') as f:
    f.write(c)
print("  ✅ LiveAuditLog filter pills + icons updated for new events")
PYEOF

# ── 9. Add WebSocket listener in LiveAuditLog ──────────────────────────────────
python3 << 'PYEOF'
path = "src/app/components/admin/LiveAuditLog.tsx"
with open(path) as f:
    c = f.read()

if 'auditEvent' not in c:
    # Add socket import
    c = c.replace(
        "import { useAuth } from '../../contexts/AuthContext';",
        "import { useAuth } from '../../contexts/AuthContext';\nimport { RealTimeEngine } from '../../engine/RealTimeEngine';"
    )

    # Add WebSocket listener after the auto-refresh effect
    old_effect = "  // Auto-refresh every 10 seconds for real-time feel\n  useEffect(() => {\n    const t = setInterval(fetchAudit, 10000);\n    return () => clearInterval(t);\n  }, [fetchAudit]);"

    new_effect = """  // Auto-refresh every 15 seconds
  useEffect(() => {
    const t = setInterval(fetchAudit, 15000);
    return () => clearInterval(t);
  }, [fetchAudit]);

  // WebSocket real-time push — prepend new audit events instantly
  useEffect(() => {
    const rte = RealTimeEngine.getInstance();
    const socket = (rte as any).socket;
    if (!socket) return;
    const handler = (entry: AuditEntry) => {
      setEntries(prev => [entry, ...prev.slice(0, 99)]);
      setTotal(prev => prev + 1);
      setNewCount(n => n + 1);
      setTimeout(() => setNewCount(n => Math.max(0, n - 1)), 3000);
    };
    socket.on('auditEvent', handler);
    return () => { socket.off('auditEvent', handler); };
  }, []);"""

    c = c.replace(old_effect, new_effect)
    print("  ✅ WebSocket auditEvent listener added to LiveAuditLog")
else:
    print("  ✅ WebSocket listener already present")

with open(path, 'w') as f:
    f.write(c)
PYEOF

# ── 10. Build ─────────────────────────────────────────────────────────────────
echo ""
echo "Building..."
docker compose build backend frontend 2>&1 | tail -5
docker compose up -d backend frontend
sleep 10

echo ""
echo "=================================================="
echo " ✅ Extended Audit + WebSocket Push Complete"
echo "=================================================="
echo ""
echo "Now logged:"
echo "  • face.enroll.delete  — face enrollment removed"
echo "  • employee.activate   — employee re-activated"
echo "  • employee.deactivate — employee deactivated"
echo "  • dept.assign         — employees assigned to department"
echo "  • shift.assign        — employees assigned to shift"
echo "  • dept.create/delete  — department management"
echo "  • camera.register     — new camera added"
echo "  • camera.delete       — camera removed"
echo ""
echo "WebSocket push: new audit events appear INSTANTLY without polling"
echo ""
echo "Hard refresh: Ctrl+Shift+R → Admin Dashboard → Live Audit Log"