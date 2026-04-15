import { query } from "../db/pool.js";

export async function findUserByEmail(email) {
  const result = await query(
    `select
      pk_user_id,
      email,
      username,
      role,
      department,
      created_at,
      password_hash
     from frs_user
     where email = $1
     limit 1`,
    [email]
  );
  return result.rows[0] ?? null;
}

export async function findUserByKeycloakSub(keycloakSub) {
  const result = await query(
    `select
      pk_user_id,
      email,
      username,
      role,
      department,
      created_at
     from frs_user
     where keycloak_sub = $1
     limit 1`,
    [keycloakSub]
  );
  return result.rows[0] ?? null;
}

export async function findUserByAccessToken(accessToken) {
  const result = await query(
    `select
      t.user_agent,
      t.ip_address,
      u.pk_user_id,
      u.email,
      u.username,
      u.role,
      u.department,
      u.created_at
     from auth_session_token t
     join frs_user u on u.pk_user_id = t.fk_user_id
     where t.access_token = $1
       and t.revoked = false
       and t.access_expires_at > now()
     limit 1`,
    [accessToken]
  );
  return result.rows[0] ?? null;
}

export async function findSessionByRefreshToken(refreshToken) {
  const result = await query(
    `select token_id, fk_user_id, refresh_expires_at, revoked, user_agent, ip_address
     from auth_session_token
     where refresh_token = $1
     limit 1`,
    [refreshToken]
  );
  return result.rows[0] ?? null;
}

export async function revokeSessionByRefreshToken(refreshToken) {
  await query(
    `update auth_session_token
     set revoked = true
     where refresh_token = $1`,
    [refreshToken]
  );
}

export async function saveSessionToken({
  userId,
  accessToken,
  refreshToken,
  accessExpiresAt,
  refreshExpiresAt,
  userAgent,
  ipAddress,
}) {
  const result = await query(
    `insert into auth_session_token(
      fk_user_id,
      access_token,
      refresh_token,
      access_expires_at,
      refresh_expires_at,
      user_agent,
      ip_address,
      revoked
    ) values ($1, $2, $3, $4, $5, $6, $7, false)
    returning token_id`,
    [userId, accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, userAgent, ipAddress]
  );
  return result.rows[0];
}

export async function rotateSessionToken({
  refreshToken,
  newAccessToken,
  newRefreshToken,
  accessExpiresAt,
  refreshExpiresAt,
  userAgent,
  ipAddress,
}) {
  const result = await query(
    `update auth_session_token
     set access_token = $2,
         refresh_token = $3,
         access_expires_at = $4,
         refresh_expires_at = $5,
         user_agent = $6,
         ip_address = $7,
         revoked = false
     where refresh_token = $1
     returning token_id`,
    [refreshToken, newAccessToken, newRefreshToken, accessExpiresAt, refreshExpiresAt, userAgent, ipAddress]
  );
  return result.rows[0] ?? null;
}

export async function getMembershipsByUserId(userId) {
  const result = await query(
    `select
      pk_membership_id,
      fk_user_id,
      role,
      tenant_id,
      customer_id,
      site_id,
      unit_id,
      permissions
     from frs_user_membership
     where fk_user_id = $1
     order by pk_membership_id`,
    [userId]
  );
  return result.rows;
}

/**
 * getRbacPermissionsForUser — RBAC system (Phase 2)
 *
 * Resolves a user's effective permissions from the normalised RBAC tables:
 *   user_role → rbac_role → rbac_role_permission → rbac_permission
 *
 * Returns one row per active role assignment.  A user can have multiple rows
 * (e.g. a global HR Manager AND a Site-Admin assignment for one specific site).
 *
 * Return shape is intentionally identical to getMembershipsByUserId() so that
 * normalizeMembership() in authService.js and the inline normalization in
 * authz.js both work without modification.
 *
 * Extra field  scope_type  ('global' | 'site' | 'flexible') is passed through
 * for use by the updated authz.js middleware in Step 2 of the RBAC integration.
 *
 * Tenant resolution:
 *   - Site-scoped role  →  tenant derived via frs_site → frs_customer
 *   - Global role       →  first tenant in frs_tenant (single-tenant system)
 *
 * Returns [] when the user has no active RBAC role assignments (caller falls
 * back to getMembershipsByUserId for backward-compat during migration).
 */
export async function getRbacPermissionsForUser(userId) {
  const result = await query(
    `SELECT
       ur.pk_user_role_id                                          AS pk_membership_id,
       ur.fk_user_id,
       r.role_name                                                 AS role,
       r.scope_type,
       array_agg(p.permission_code ORDER BY p.permission_code)    AS permissions,
       ur.fk_site_id                                              AS site_id,
       s.fk_customer_id                                           AS customer_id,
       -- Tenant resolution:
       --   Site-scoped role  → follow frs_site → frs_customer → fk_tenant_id
       --   Global role (site IS NULL) → fall back to first tenant in the system
       COALESCE(
         c.fk_tenant_id,
         (SELECT pk_tenant_id FROM frs_tenant ORDER BY pk_tenant_id LIMIT 1)
       )                                                           AS tenant_id
     FROM   user_role           ur
     JOIN   rbac_role            r  ON  r.pk_role_id        = ur.fk_role_id
     JOIN   rbac_role_permission rp ON  rp.fk_role_id       = r.pk_role_id
     JOIN   rbac_permission      p  ON  p.pk_permission_id  = rp.fk_permission_id
     -- Left-joins resolve tenant/customer for site-scoped roles.
     -- For global roles (fk_site_id IS NULL) both joins produce NULLs, handled by COALESCE above.
     LEFT JOIN frs_site     s  ON  s.pk_site_id      = ur.fk_site_id
     LEFT JOIN frs_customer c  ON  c.pk_customer_id  = s.fk_customer_id
     WHERE  ur.fk_user_id = $1
       AND  ur.is_active   = TRUE
       AND  (ur.expires_at IS NULL OR ur.expires_at > NOW())
     GROUP  BY
       ur.pk_user_role_id,
       ur.fk_user_id,
       r.role_name,
       r.scope_type,
       ur.fk_site_id,
       s.fk_customer_id,
       c.fk_tenant_id
     ORDER  BY ur.pk_user_role_id`,
    [userId]
  );

  // Map to the same raw-row shape that normalizeMembership() in authService.js
  // and the inline normalization in authz.js both expect.
  // unit_id is explicitly null — user_role has no unit-level scope in RBAC.
  return result.rows.map((row) => ({
    pk_membership_id: row.pk_membership_id,   // pk_user_role_id aliased above
    fk_user_id:       row.fk_user_id,
    role:             row.role,               // rbac_role.role_name
    permissions:      row.permissions || [],  // aggregated permission_code[]
    tenant_id:        row.tenant_id,          // resolved via COALESCE
    customer_id:      row.customer_id ?? null,
    site_id:          row.site_id   ?? null,  // NULL = global, value = site-scoped
    unit_id:          null,                   // not used in RBAC
    scope_type:       row.scope_type,         // 'global' | 'site' | 'flexible'
  }));
}

export async function getCatalogForTenantIds(tenantIds) {
  if (!tenantIds.length) {
    return { tenants: [], customers: [], sites: [], units: [] };
  }

  const tenants = await query(
    `select pk_tenant_id, tenant_name
     from frs_tenant
     where pk_tenant_id = any($1::bigint[])`,
    [tenantIds]
  );

  const customers = await query(
    `select pk_customer_id, customer_name, fk_tenant_id
     from frs_customer
     where fk_tenant_id = any($1::bigint[])`,
    [tenantIds]
  );

  const customerIds = customers.rows.map((row) => row.pk_customer_id);
  const sites = customerIds.length
    ? await query(
      `select pk_site_id, site_name, fk_customer_id
         from frs_site
         where fk_customer_id = any($1::bigint[])`,
      [customerIds]
    )
    : { rows: [] };

  const siteIds = sites.rows.map((row) => row.pk_site_id);
  const units = siteIds.length
    ? await query(
      `select pk_unit_id, unit_name, fk_site_id
         from frs_unit
         where fk_site_id = any($1::bigint[])`,
      [siteIds]
    )
    : { rows: [] };

  return {
    tenants: tenants.rows,
    customers: customers.rows,
    sites: sites.rows,
    units: units.rows,
  };
}

