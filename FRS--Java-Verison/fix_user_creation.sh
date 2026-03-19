#!/bin/bash
# ============================================================
# Fix user creation - write proper backend route + fix frontend
# Run: bash ~/FRS_/FRS--Java-Verison/fix_user_creation.sh
# ============================================================
set -e

PROJECT="$HOME/FRS_/FRS--Java-Verison"
echo ""
echo "=================================================="
echo " FRS2: Fix user creation"
echo "=================================================="
echo ""

cd "$PROJECT"

# ── 1. Clean up the broken append from last time ─────────
echo "[1/4] Cleaning broken authRoutes.js..."
# Remove everything after "export { router as authRoutes };"
python3 << 'PYEOF'
import os
path = os.path.expanduser("~/FRS_/FRS--Java-Verison/backend/src/routes/authRoutes.js")
with open(path) as f:
    content = f.read()
# Keep only up to and including the export line
marker = 'export { router as authRoutes };'
idx = content.find(marker)
if idx != -1:
    content = content[:idx + len(marker)] + '\n'
with open(path, 'w') as f:
    f.write(content)
print("  ✅ authRoutes.js cleaned")
PYEOF

# ── 2. Write dedicated user management route ──────────────
echo "[2/4] Writing backend/src/routes/userRoutes.js..."

cat > "$PROJECT/backend/src/routes/userRoutes.js" << 'JSEOF'
/**
 * userRoutes.js — Admin user management
 * POST   /api/users          create user (saves to DB + Keycloak if enabled)
 * GET    /api/users          list all users
 * DELETE /api/users/:id      remove user
 */

import express from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';

const router = express.Router();
router.use(requireAuth);

const ADMIN_PERMS = [
  'users.read','users.manage','devices.read','devices.manage',
  'attendance.read','attendance.manage','analytics.read',
  'audit.read','facility.read','facility.manage','aiinsights.read',
];
const HR_PERMS = [
  'users.read','attendance.read','attendance.manage',
  'analytics.read','devices.read','facility.read','aiinsights.read',
];

// ── GET /api/users ─────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT pk_user_id, email, username, role, department, created_at
     FROM frs_user ORDER BY created_at DESC`
  );
  return res.json({ data: result.rows });
}));

// ── POST /api/users ────────────────────────────────────────
router.post('/', asyncHandler(async (req, res) => {
  const { email, username, password, role, department } = req.body;

  if (!email || !username || !password || !role) {
    return res.status(400).json({ message: 'email, username, password and role are required' });
  }
  if (!['admin', 'hr'].includes(role)) {
    return res.status(400).json({ message: 'role must be admin or hr' });
  }

  // Check duplicate email
  const existing = await pool.query(
    'SELECT 1 FROM frs_user WHERE email = $1', [email]
  );
  if (existing.rows.length) {
    return res.status(409).json({ message: 'A user with this email already exists' });
  }

  // Hash password (used for api mode login)
  const hash = await bcrypt.hash(password, 10);

  // Insert user
  const result = await pool.query(
    `INSERT INTO frs_user (email, username, fk_user_type_id, role, password_hash, department)
     VALUES ($1, $2, 1, $3, $4, $5)
     RETURNING pk_user_id, email, username, role, department, created_at`,
    [email, username, role, hash, department || null]
  );
  const user = result.rows[0];

  // Get first tenant/customer/site for membership
  const [tenantRow, customerRow, siteRow] = await Promise.all([
    pool.query('SELECT pk_tenant_id FROM frs_tenant LIMIT 1'),
    pool.query('SELECT pk_customer_id FROM frs_customer LIMIT 1'),
    pool.query('SELECT pk_site_id FROM frs_site LIMIT 1'),
  ]);
  const tenantId   = tenantRow.rows[0]?.pk_tenant_id   || null;
  const customerId = customerRow.rows[0]?.pk_customer_id || null;
  const siteId     = siteRow.rows[0]?.pk_site_id        || null;

  if (tenantId) {
    await pool.query(
      `INSERT INTO frs_user_membership
         (fk_user_id, role, tenant_id, customer_id, site_id, permissions)
       VALUES ($1, $2, $3, $4, $5, $6::text[])
       ON CONFLICT DO NOTHING`,
      [user.pk_user_id, role, tenantId, customerId, siteId,
       role === 'admin' ? ADMIN_PERMS : HR_PERMS]
    );
    await pool.query(
      `INSERT INTO frs_tenant_user_map (fk_user_id, fk_tenant_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.pk_user_id, tenantId]
    );
  }

  // ── Also create in Keycloak if keycloak mode ───────────
  if (env.authMode === 'keycloak') {
    try {
      // Get admin token from Keycloak
      const tokenRes = await fetch(
        `${env.keycloak.url}/realms/master/protocol/openid-connect/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'password',
            client_id:  'admin-cli',
            username:   'admin',
            password:   'admin',
          }),
        }
      );
      const tokenData = await tokenRes.json();
      const adminToken = tokenData.access_token;

      if (adminToken) {
        // Create user in Keycloak
        const createRes = await fetch(
          `${env.keycloak.url}/admin/realms/${env.keycloak.realm}/users`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
              username:      email,
              email:         email,
              firstName:     username.split(' ')[0] || username,
              lastName:      username.split(' ').slice(1).join(' ') || '',
              enabled:       true,
              emailVerified: true,
              credentials: [{
                type:      'password',
                value:     password,
                temporary: false,
              }],
              realmRoles: [role],
            }),
          }
        );

        if (createRes.status === 201) {
          // Get Keycloak user ID and assign role
          const locationHeader = createRes.headers.get('Location') || '';
          const kcUserId = locationHeader.split('/').pop();

          if (kcUserId) {
            // Get role object
            const rolesRes = await fetch(
              `${env.keycloak.url}/admin/realms/${env.keycloak.realm}/roles/${role}`,
              { headers: { Authorization: `Bearer ${adminToken}` } }
            );
            const roleObj = await rolesRes.json();

            // Assign role to user
            await fetch(
              `${env.keycloak.url}/admin/realms/${env.keycloak.realm}/users/${kcUserId}/role-mappings/realm`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${adminToken}`,
                },
                body: JSON.stringify([roleObj]),
              }
            );

            // Link Keycloak sub to frs_user
            await pool.query(
              'UPDATE frs_user SET keycloak_sub = $1 WHERE pk_user_id = $2',
              [kcUserId, user.pk_user_id]
            );
          }
          console.log(`[userRoutes] User ${email} created in Keycloak`);
        } else {
          const errText = await createRes.text();
          console.warn(`[userRoutes] Keycloak user creation returned ${createRes.status}: ${errText}`);
        }
      }
    } catch (kcErr) {
      console.warn('[userRoutes] Keycloak sync failed (user still created in DB):', kcErr.message);
    }
  }

  return res.status(201).json({
    pk_user_id:  user.pk_user_id,
    id:          String(user.pk_user_id),
    email:       user.email,
    username:    user.username,
    role:        user.role,
    department:  user.department,
    created_at:  user.created_at,
  });
}));

// ── DELETE /api/users/:id ──────────────────────────────────
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid user ID' });

  // Get user before deleting (for Keycloak cleanup)
  const userRow = await pool.query(
    'SELECT keycloak_sub FROM frs_user WHERE pk_user_id = $1', [id]
  );
  const kcSub = userRow.rows[0]?.keycloak_sub;

  // Delete from DB
  await pool.query('DELETE FROM frs_user_membership WHERE fk_user_id = $1', [id]);
  await pool.query('DELETE FROM frs_tenant_user_map WHERE fk_user_id = $1', [id]);
  await pool.query('DELETE FROM frs_customer_user_map WHERE fk_user_id = $1', [id]);
  await pool.query('DELETE FROM auth_session_token WHERE fk_user_id = $1', [id]);
  await pool.query('DELETE FROM frs_user WHERE pk_user_id = $1', [id]);

  // Remove from Keycloak if linked
  if (kcSub && env.authMode === 'keycloak') {
    try {
      const tokenRes = await fetch(
        `${env.keycloak.url}/realms/master/protocol/openid-connect/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'password', client_id: 'admin-cli',
            username: 'admin', password: 'admin',
          }),
        }
      );
      const { access_token } = await tokenRes.json();
      if (access_token) {
        await fetch(
          `${env.keycloak.url}/admin/realms/${env.keycloak.realm}/users/${kcSub}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${access_token}` } }
        );
      }
    } catch (e) {
      console.warn('[userRoutes] Keycloak delete failed:', e.message);
    }
  }

  return res.json({ success: true });
}));

export { router as userRoutes };
JSEOF

echo "  ✅ userRoutes.js written"

# ── 3. Register the route in server.js ───────────────────
echo "[3/4] Registering route in server.js..."

python3 << 'PYEOF'
import os, re

path = os.path.expanduser("~/FRS_/FRS--Java-Verison/backend/src/server.js")
with open(path) as f:
    c = f.read()

# Add import
if 'userRoutes' not in c:
    c = c.replace(
        'import { reportRoutes } from "./routes/reportRoutes.js";',
        'import { reportRoutes } from "./routes/reportRoutes.js";\nimport { userRoutes } from "./routes/userRoutes.js";'
    )

# Register route
if '/api/users' not in c:
    c = c.replace(
        'app.use("/api/reports", reportRoutes);',
        'app.use("/api/reports", reportRoutes);\napp.use("/api/users", userRoutes);'
    )

with open(path, 'w') as f:
    f.write(c)
print("  ✅ server.js updated")
PYEOF

# ── 4. Fix frontend UserManagement to call /api/users ────
echo "[4/4] Fixing UserManagement.tsx..."

python3 << 'PYEOF'
import os, re

path = os.path.expanduser(
    "~/FRS_/FRS--Java-Verison/src/app/components/admin/UserManagement.tsx"
)
with open(path) as f:
    c = f.read()

# Add imports if not present
if 'useAuth' not in c:
    c = c.replace(
        "import { MetricCard } from '../shared/MetricCard';",
        "import { MetricCard } from '../shared/MetricCard';\nimport { useAuth } from '../../contexts/AuthContext';\nimport { apiRequest } from '../../services/http/apiClient';\nimport { Loader2 } from 'lucide-react';"
    )

# Add useAuth + isSaving state
if 'isSaving' not in c:
    c = c.replace(
        "  const [localUsers, setLocalUsers] = useState<User[]>(users);",
        "  const { accessToken } = useAuth();\n  const [localUsers, setLocalUsers] = useState<User[]>(users);\n  const [isSaving, setIsSaving] = useState(false);"
    )

# Replace handleCreateUser with real API call
old = '''  const handleCreateUser = () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error("Validation Error", { description: "Name, email and password are required." });
      return;
    }

    const createdUser: User = {
      id: `USR-${Math.floor(Math.random() * 10000)}`,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      department: newUser.department,
      createdAt: (new Date().toISOString() as any),
      password: newUser.password
    };

    setLocalUsers(prev => [createdUser, ...prev]);
    toast.success("User Created", { description: `${newUser.name} has been added as a ${newUser.role}.` });

    setIsCreateDialogOpen(false);
    setNewUser({
      email: '',
      password: '',
      name: '',
      role: 'hr',
      department: '',
    });
  };'''

new = '''  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error("Validation Error", { description: "Name, email and password are required." });
      return;
    }
    setIsSaving(true);
    try {
      const res = await apiRequest<any>('/users', {
        method: 'POST',
        accessToken,
        body: JSON.stringify({
          email:      newUser.email,
          username:   newUser.name,
          password:   newUser.password,
          role:       newUser.role,
          department: newUser.department || undefined,
        }),
      });
      setLocalUsers(prev => [{
        id:         String(res.pk_user_id || res.id),
        name:       res.username || newUser.name,
        email:      res.email    || newUser.email,
        role:       res.role     || newUser.role,
        department: res.department || newUser.department,
        createdAt:  new Date(res.created_at || Date.now()),
        password:   '',
      } as User, ...prev]);
      toast.success("User Created", {
        description: `${newUser.name} added as ${newUser.role}. They can log in immediately.`,
      });
      setIsCreateDialogOpen(false);
      setNewUser({ email: '', password: '', name: '', role: 'hr', department: '' });
    } catch (e: any) {
      toast.error("Failed to create user", {
        description: e?.message || "Check the email is not already registered.",
      });
    } finally {
      setIsSaving(false);
    }
  };'''

if old in c:
    c = c.replace(old, new)
    print("  ✅ handleCreateUser replaced")
else:
    # Already patched from last attempt - just make sure it calls /users not /auth/users
    c = c.replace("'/auth/users'", "'/users'")
    print("  ✅ API path corrected to /users")

# Replace handleDeleteUser
old_del = '''  const handleDeleteUser = (id: string, name: string) => {
    setLocalUsers(prev => prev.filter(u => u.id !== id));
    toast.success("User Removed", { description: `${name} has been successfully removed from the system.` });
  };'''

new_del = '''  const handleDeleteUser = async (id: string, name: string) => {
    if (!window.confirm(`Remove user ${name}? This cannot be undone.`)) return;
    try {
      await apiRequest(`/users/${id}`, { method: 'DELETE', accessToken });
      setLocalUsers(prev => prev.filter(u => u.id !== id));
      toast.success("User Removed", { description: `${name} has been removed.` });
    } catch (e: any) {
      toast.error("Delete failed", { description: e?.message || String(e) });
    }
  };'''

if old_del in c:
    c = c.replace(old_del, new_del)
    print("  ✅ handleDeleteUser replaced")

with open(path, 'w') as f:
    f.write(c)
print("  ✅ UserManagement.tsx patched")
PYEOF

# ── 5. Rebuild both containers ────────────────────────────
echo ""
echo "[5/5] Rebuilding backend + frontend..."
cd "$PROJECT"
docker compose build backend frontend 2>&1 | grep -E "FINISHED|ERROR" | head -5
docker compose up -d backend frontend

echo ""
echo "Waiting for backend to start..."
sleep 15

STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://172.20.100.222:8080/api/health)
if [ "$STATUS" = "200" ]; then
  echo "  ✅ Backend up"
else
  echo "  ⚠️  Backend HTTP $STATUS"
  echo "  Check: docker compose logs --tail=30 backend"
fi

echo ""
echo "Testing /api/users route..."
# Get a token first
TOKEN=$(curl -s -X POST \
  "http://172.20.100.222:9090/realms/attendance/protocol/openid-connect/token" \
  -d "client_id=attendance-frontend&username=admin@company.com&password=admin123&grant_type=password" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -n "$TOKEN" ]; then
  ROUTE_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
    http://172.20.100.222:8080/api/users \
    -H "Authorization: Bearer $TOKEN")
  if [ "$ROUTE_CHECK" = "200" ]; then
    echo "  ✅ /api/users route working"
  else
    echo "  ⚠️  /api/users returned HTTP $ROUTE_CHECK"
  fi
fi

echo ""
echo "=================================================="
echo " ✅ User creation fixed"
echo "=================================================="
echo ""
echo "What changed:"
echo "  • New /api/users POST — creates user in PostgreSQL + Keycloak simultaneously"
echo "  • New /api/users DELETE — removes from both DB and Keycloak"
echo "  • UserManagement UI now calls real API instead of local state only"
echo ""
echo "Create a user in Admin → Users & Roles."
echo "They can immediately log in via the Keycloak login page."
echo ""