import socketServer from "./server.js";
import shutdownManager from "../core/managers/ShutdownManager.js";

class WebSocketManager {
  initialized = false;

  async initialize(httpServer) {
    if (this.initialized) return;
    await socketServer.initialize(httpServer);
    this.initialized = true;
    shutdownManager.registerShutdownHandler("ws-manager", async () => this.shutdown());
  }

  getIO() {
    return socketServer.io;
  }

  emitAttendanceUpdate(payload) {
    socketServer.broadcastAttendance(payload);
  }
  broadcastDeviceStatus(tenantId, devices) {
    try {
      this.getIO()?.to(`tenant:${tenantId}`).emit('deviceStatusUpdate', devices);
    } catch (_) {}
  }

  emitAuditEvent(tenantId, entry) {
    try {
      this.io?.to(`tenant:${tenantId}`).emit("auditEvent", entry);
    } catch (_) {}
  }

  emitNewAlert(tenantId, alert) {
    try {
      this.io?.to(`tenant:${tenantId}`).emit('newAlert', alert);
    } catch (_) {}
  }

  emitPresenceUpdate(payload) {
    socketServer.emitToTenant(payload?.tenantId ?? "all", "presence.update", payload);
  }
  emitAlert(payload) {
    socketServer.broadcastAlert(payload);
  }
  emitDashboardUpdate(payload) {
    socketServer.emitToTenant(payload?.tenantId ?? "all", "dashboard.update", payload);
  }

  async broadcastDeviceChange(req) {
    try {
      const tenantId = req.auth?.scope?.tenantId || req.headers['x-tenant-id'] || '1';
      const { rows: devices } = await (await import('../db/pool.js')).pool.query(
        `SELECT pk_device_id, external_device_id, name, status, last_active,
                host(ip_address::inet) as ip_address, location_label,
                recognition_accuracy, total_scans, model, map_x, map_y, map_angle
         FROM facility_device WHERE tenant_id = $1`,
        [tenantId]
      );
      this.broadcastDeviceStatus(tenantId, devices);
    } catch (_) {}
  }

  getStats() {
    return socketServer.getStats();
  }

  async shutdown() {
    await socketServer.shutdown();
    this.initialized = false;
  }
}

const wsManager = new WebSocketManager();
export default wsManager;

