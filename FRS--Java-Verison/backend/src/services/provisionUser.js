import { query } from "../db/pool.js";
import { findUserByEmail } from "../repositories/authRepository.js";

/**
 * Auto-provision a Keycloak user into frs_user on first login,
 * and ensure they have at least one membership row.
 */
export async function provisionKeycloakUser(jwtPayload) {
    const email = jwtPayload.email;
    const name = jwtPayload.name || jwtPayload.preferred_username || email;
    const role = (jwtPayload.realm_access?.roles || []).includes("admin")
        ? "admin"
        : "hr";
    const sub = jwtPayload.sub;

    let user;

    // ── 1. Try to find by email (pre-provisioned without keycloak_sub) ──
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
        await query(
            `UPDATE frs_user SET keycloak_sub = $1 WHERE pk_user_id = $2`,
            [sub, existingUser.pk_user_id]
        );
        user = existingUser;
    } else {
        // ── 2. Create brand-new user ──
        const result = await query(
            `INSERT INTO frs_user (email, username, role, keycloak_sub, fk_user_type_id, password_hash)
             VALUES ($1, $2, $3, $4, 1, '')
             RETURNING pk_user_id, email, username, role, department, created_at`,
            [email, name, role, sub]
        );
        user = result.rows[0];
    }

    // ── 3. Ensure at least one membership exists for this user ──
    const existing = await query(
        `SELECT pk_membership_id FROM frs_user_membership WHERE fk_user_id = $1 LIMIT 1`,
        [user.pk_user_id]
    );
    if (existing.rows.length === 0) {
        // Find the first available site in the hierarchy
        const site = await query(
            `SELECT s.pk_site_id, s.fk_customer_id, c.fk_tenant_id
             FROM frs_site s
             JOIN frs_customer c ON c.pk_customer_id = s.fk_customer_id
             ORDER BY s.pk_site_id
             LIMIT 1`
        );

        if (site.rows.length > 0) {
            const { pk_site_id, fk_customer_id, fk_tenant_id } = site.rows[0];
            const adminPermissions = [
                'users.read','users.manage',
                'devices.read','devices.manage',
                'attendance.read','attendance.manage',
                'analytics.read','audit.read',
                'facility.read','facility.manage',
                'aiinsights.read',
            ];
            const hrPermissions = [
                'users.read',
                'devices.read',
                'attendance.read','attendance.manage',
                'analytics.read',
                'facility.read',
                'aiinsights.read',
            ];
            const permissions = role === 'admin' ? adminPermissions : hrPermissions;

            await query(
                `INSERT INTO frs_user_membership
                    (fk_user_id, role, tenant_id, customer_id, site_id, permissions)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (fk_user_id, role, tenant_id, customer_id, site_id, unit_id) DO NOTHING`,
                [user.pk_user_id, role, fk_tenant_id, fk_customer_id, pk_site_id, permissions]
            );
        }
    }

    return user;
}
