import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requirePermission } from "../middleware/authz.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = express.Router();

router.use(requireAuth);

function getTenantId(req) {
  return Number(req.auth?.scope?.tenantId || 1);
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function groupUsersWithAssignments(rows) {
  const users = new Map();

  for (const row of rows) {
    if (!users.has(row.pk_user_id)) {
      users.set(row.pk_user_id, {
        pk_user_id: row.pk_user_id,
        email: row.email,
        username: row.username,
        legacy_role: row.legacy_role,
        roleAssignments: [],
      });
    }

    if (row.pk_user_role_id) {
      users.get(row.pk_user_id).roleAssignments.push({
        pk_user_role_id: row.pk_user_role_id,
        fk_site_id: row.fk_site_id,
        granted_at: row.granted_at,
        expires_at: row.expires_at,
        role_name: row.role_name,
        role_display_name: row.role_display_name,
        scope_type: row.scope_type,
        site_name: row.site_name,
      });
    }
  }

  return Array.from(users.values());
}

router.get(
  "/users",
  requirePermission("users.read"),
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);

    const { rows } = await pool.query(
      `SELECT
         u.pk_user_id, u.email, u.username, u.role AS legacy_role,
         ur.pk_user_role_id, ur.fk_site_id, ur.granted_at, ur.expires_at,
         r.role_name, r.display_name AS role_display_name, r.scope_type,
         s.site_name
       FROM frs_user u
       LEFT JOIN user_role ur
         ON ur.fk_user_id = u.pk_user_id
        AND ur.is_active = TRUE
       LEFT JOIN frs_site s
         ON s.pk_site_id = ur.fk_site_id
       LEFT JOIN frs_customer sc
         ON sc.pk_customer_id = s.fk_customer_id
       LEFT JOIN rbac_role r
         ON r.pk_role_id = ur.fk_role_id
       WHERE (
         EXISTS (
           SELECT 1
           FROM frs_tenant_user_map tum
           WHERE tum.fk_user_id = u.pk_user_id
             AND tum.fk_tenant_id = $1
         )
         AND (ur.fk_site_id IS NULL OR sc.fk_tenant_id = $1 OR ur.pk_user_role_id IS NULL)
       )
       OR EXISTS (
         SELECT 1
         FROM user_role urx
         LEFT JOIN frs_site sx
           ON sx.pk_site_id = urx.fk_site_id
         LEFT JOIN frs_customer cx
           ON cx.pk_customer_id = sx.fk_customer_id
         WHERE urx.fk_user_id = u.pk_user_id
           AND urx.is_active = TRUE
           AND (urx.fk_site_id IS NULL OR cx.fk_tenant_id = $1)
       )
       ORDER BY u.email, ur.pk_user_role_id`,
      [tenantId]
    );

    return res.status(200).json(groupUsersWithAssignments(rows));
  })
);

router.get(
  "/roles",
  requirePermission("users.read"),
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT
         r.pk_role_id, r.role_name, r.display_name, r.description, r.scope_type,
         array_agg(p.permission_code ORDER BY p.category, p.permission_code) AS permissions
       FROM rbac_role r
       JOIN rbac_role_permission rp
         ON rp.fk_role_id = r.pk_role_id
       JOIN rbac_permission p
         ON p.pk_permission_id = rp.fk_permission_id
       GROUP BY r.pk_role_id
       ORDER BY r.role_name`
    );

    return res.status(200).json(rows);
  })
);

router.post(
  "/users/:userId/roles",
  requirePermission("users.roles.manage"),
  asyncHandler(async (req, res) => {
    const userId = parsePositiveInt(req.params.userId);
    const siteId = req.body.siteId === undefined || req.body.siteId === null
      ? null
      : parsePositiveInt(req.body.siteId);
    const roleName = typeof req.body.roleName === "string" ? req.body.roleName.trim() : "";
    const tenantId = getTenantId(req);
    const grantedBy = parsePositiveInt(req.auth?.user?.id);

    if (!userId) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    if (!roleName) {
      return res.status(400).json({ message: "roleName is required" });
    }

    if (req.body.siteId !== undefined && req.body.siteId !== null && !siteId) {
      return res.status(400).json({ message: "siteId must be a positive integer" });
    }

    const [{ rows: userRows }, { rows: roleRows }] = await Promise.all([
      pool.query(
        `SELECT pk_user_id
         FROM frs_user
         WHERE pk_user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT pk_role_id, role_name, scope_type
         FROM rbac_role
         WHERE role_name = $1`,
        [roleName]
      ),
    ]);

    if (!userRows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!roleRows.length) {
      return res.status(404).json({ message: "Role not found" });
    }

    const role = roleRows[0];

    if (role.scope_type === "global" && siteId !== null) {
      return res.status(400).json({ message: "siteId must be null for super_admin" });
    }

    if (role.scope_type === "site" && siteId === null) {
      return res.status(400).json({ message: "siteId is required for site_admin" });
    }

    if (siteId !== null) {
      const { rows: siteRows } = await pool.query(
        `SELECT s.pk_site_id
         FROM frs_site s
         JOIN frs_customer c
           ON c.pk_customer_id = s.fk_customer_id
         WHERE s.pk_site_id = $1
           AND c.fk_tenant_id = $2`,
        [siteId, tenantId]
      );

      if (!siteRows.length) {
        return res.status(404).json({ message: "Site not found" });
      }
    }

    const { rows: duplicateRows } = await pool.query(
      `SELECT pk_user_role_id
       FROM user_role
       WHERE fk_user_id = $1
         AND fk_role_id = $2
         AND is_active = TRUE
         AND (
           ($3::bigint IS NULL AND fk_site_id IS NULL)
           OR fk_site_id = $3::bigint
         )
       LIMIT 1`,
      [userId, role.pk_role_id, siteId]
    );

    if (duplicateRows.length) {
      return res.status(409).json({ message: "Active role assignment already exists" });
    }

    const insertResult = await pool.query(
      `INSERT INTO user_role (fk_user_id, fk_role_id, fk_site_id, granted_by, is_active)
       SELECT $1, pk_role_id, $2, $3, TRUE
       FROM rbac_role
       WHERE role_name = $4
       ON CONFLICT DO NOTHING
       RETURNING pk_user_role_id`,
      [userId, siteId, grantedBy, roleName]
    );

    if (!insertResult.rows.length) {
      return res.status(409).json({ message: "Active role assignment already exists" });
    }

    return res.status(201).json({
      success: true,
      userRoleId: insertResult.rows[0].pk_user_role_id,
    });
  })
);

router.delete(
  "/user-roles/:userRoleId",
  requirePermission("users.roles.manage"),
  asyncHandler(async (req, res) => {
    const userRoleId = parsePositiveInt(req.params.userRoleId);
    const tenantId = getTenantId(req);

    if (!userRoleId) {
      return res.status(400).json({ message: "Invalid userRoleId" });
    }

    const existing = await pool.query(
      `SELECT ur.pk_user_role_id
       FROM user_role ur
       LEFT JOIN frs_site s
         ON s.pk_site_id = ur.fk_site_id
       LEFT JOIN frs_customer c
         ON c.pk_customer_id = s.fk_customer_id
       WHERE ur.pk_user_role_id = $1
         AND (ur.fk_site_id IS NULL OR c.fk_tenant_id = $2)`,
      [userRoleId, tenantId]
    );

    if (!existing.rows.length) {
      return res.status(404).json({ message: "Role assignment not found" });
    }

    const result = await pool.query(
      `UPDATE user_role
       SET is_active = FALSE
       WHERE pk_user_role_id = $1
       RETURNING pk_user_role_id`,
      [userRoleId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Role assignment not found" });
    }

    return res.status(200).json({
      success: true,
      revokedId: result.rows[0].pk_user_role_id,
    });
  })
);

router.get(
  "/sites",
  requirePermission("users.read"),
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);

    const { rows } = await pool.query(
      `SELECT
         s.pk_site_id AS id,
         s.site_name AS name
       FROM frs_site s
       JOIN frs_customer c
         ON c.pk_customer_id = s.fk_customer_id
       WHERE c.fk_tenant_id = $1
       ORDER BY s.site_name`,
      [tenantId]
    );

    return res.status(200).json(rows);
  })
);

export default router;
