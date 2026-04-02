/**
 * auditLog.js — writes micro-level audit events to audit_log table + WebSocket
 */
import { pool } from '../db/pool.js';

let _wsManager = null;

export function setAuditWsManager(wsManager) {
  _wsManager = wsManager;
}

/**
 * Log an audit event with full context
 * @param {Object} params
 * @param {Object} params.req - Express request
 * @param {string} params.action - e.g. 'attendance.mark', 'employee.view'
 * @param {string} params.details - Human readable description
 * @param {string} [params.entityType] - 'employee', 'device', 'roster', etc.
 * @param {string} [params.entityId] - ID of affected entity
 * @param {string} [params.entityName] - Name of affected entity
 * @param {Object} [params.before] - State before change
 * @param {Object} [params.after] - State after change
 * @param {string} [params.source] - 'ui', 'api', 'device', 'system'
 */
export async function writeAudit({ req, action, details, entityType, entityId, entityName, before, after, source }) {
  try {
    const tenantId   = req?.auth?.scope?.tenantId   || req?.headers?.['x-tenant-id']   || null;
    const customerId = req?.auth?.scope?.customerId || req?.headers?.['x-customer-id'] || null;
    const siteId     = req?.auth?.scope?.siteId     || req?.headers?.['x-site-id']     || null;
    const userId     = req?.auth?.user?.id           || null;
    const userName   = req?.auth?.user?.name || req?.auth?.user?.email || req?.auth?.user?.username || null;
    const userRole   = req?.auth?.user?.role         || req?.auth?.user?.roles?.[0]    || null;
    const userAgent  = req?.headers?.['user-agent']  || null;
    const method     = req?.method                   || null;

    // Determine source
    const detectedSource = source ||
      (req?.headers?.['x-device-id'] || req?.body?.deviceId ? 'device' :
       req?.headers?.['user-agent']?.includes('frs-runner') ? 'device' : 'ui');

    // Clean IP
    const rawIp = req?.headers?.['x-forwarded-for']?.split(',')[0]
               || req?.socket?.remoteAddress
               || null;
    const ip = rawIp?.replace('::ffff:', '') || rawIp;

    const { rows } = await pool.query(
      `INSERT INTO audit_log (
        tenant_id, customer_id, site_id, fk_user_id,
        action, details, ip_address,
        user_name, user_role, user_agent, method,
        entity_type, entity_id, entity_name,
        before_data, after_data, source
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *`,
      [
        tenantId   ? Number(tenantId)   : null,
        customerId ? Number(customerId) : null,
        siteId     ? Number(siteId)     : null,
        userId     ? Number(userId)     : null,
        action,
        typeof details === 'string' ? details : JSON.stringify(details),
        ip,
        userName,
        userRole,
        userAgent ? userAgent.slice(0, 500) : null,
        method,
        entityType  || null,
        entityId    ? String(entityId)   : null,
        entityName  || null,
        before      ? JSON.stringify(before) : null,
        after       ? JSON.stringify(after)  : null,
        detectedSource,
      ]
    );

    const entry = rows[0];

    // Push to WebSocket
    if (_wsManager && tenantId) {
      try { _wsManager.emitAuditEvent(String(tenantId), entry); } catch (_) {}
    }

    return entry;
  } catch (e) {
    console.warn('[Audit] Write failed:', e.message);
  }
}
