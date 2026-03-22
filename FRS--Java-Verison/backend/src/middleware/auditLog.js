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
