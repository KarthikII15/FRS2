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
