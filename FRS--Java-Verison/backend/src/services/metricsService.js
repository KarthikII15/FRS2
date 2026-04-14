/**
 * metricsService.js — Prometheus Metrics for FRS2
 * Phase 4, Task 4.2: Custom application metrics
 */
import client from 'prom-client';
import { pool } from '../db/pool.js';

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// ============================================================================
// Custom Metrics - Gauges
// ============================================================================

// Device metrics
const devicesOnlineGauge = new client.Gauge({
  name: 'frs_devices_online',
  help: 'Number of devices currently online',
  registers: [register]
});

const devicesOfflineGauge = new client.Gauge({
  name: 'frs_devices_offline',
  help: 'Number of devices currently offline',
  registers: [register]
});

const devicesTotalGauge = new client.Gauge({
  name: 'frs_devices_total',
  help: 'Total number of registered devices',
  registers: [register]
});

// Attendance metrics
const attendanceEventsToday = new client.Gauge({
  name: 'frs_attendance_events_today',
  help: 'Number of attendance events recorded today',
  registers: [register]
});

const employeesPresent = new client.Gauge({
  name: 'frs_employees_present',
  help: 'Number of employees currently present',
  registers: [register]
});

// Recognition metrics
const recognitionAccuracy = new client.Gauge({
  name: 'frs_recognition_accuracy',
  help: 'Average face recognition accuracy percentage',
  labelNames: ['device_code'],
  registers: [register]
});

const totalScans = new client.Gauge({
  name: 'frs_total_scans',
  help: 'Total number of face scans processed',
  labelNames: ['device_code'],
  registers: [register]
});

// Alert metrics
const activeAlerts = new client.Gauge({
  name: 'frs_active_alerts',
  help: 'Number of unacknowledged alerts',
  labelNames: ['severity'],
  registers: [register]
});

// ============================================================================
// Custom Metrics - Counters
// ============================================================================

const attendanceEventCounter = new client.Counter({
  name: 'frs_attendance_events_total',
  help: 'Total attendance events processed',
  labelNames: ['event_type', 'site'],
  registers: [register]
});

const apiRequestCounter = new client.Counter({
  name: 'frs_api_requests_total',
  help: 'Total API requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

// ============================================================================
// Custom Metrics - Histograms
// ============================================================================

const recognitionLatency = new client.Histogram({
  name: 'frs_recognition_latency_seconds',
  help: 'Face recognition processing latency',
  labelNames: ['device_code'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register]
});

const apiLatency = new client.Histogram({
  name: 'frs_api_latency_seconds',
  help: 'API endpoint response time',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register]
});

// ============================================================================
// Metrics Collection Functions
// ============================================================================

/**
 * Update device metrics from database
 */
async function updateDeviceMetrics() {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'online') as online,
        COUNT(*) FILTER (WHERE status = 'offline') as offline,
        COUNT(*) as total
      FROM facility_device
      WHERE decommissioned_at IS NULL
    `);

    const { online, offline, total } = result.rows[0];
    devicesOnlineGauge.set(parseInt(online));
    devicesOfflineGauge.set(parseInt(offline));
    devicesTotalGauge.set(parseInt(total));

    // Per-device metrics
    const devices = await pool.query(`
      SELECT 
        external_device_id,
        recognition_accuracy,
        total_scans
      FROM facility_device
      WHERE decommissioned_at IS NULL
    `);

    devices.rows.forEach(device => {
      recognitionAccuracy.set(
        { device_code: device.external_device_id },
        parseFloat(device.recognition_accuracy) || 0
      );
      totalScans.set(
        { device_code: device.external_device_id },
        parseInt(device.total_scans) || 0
      );
    });

  } catch (error) {
    console.error('Error updating device metrics:', error);
  }
}

/**
 * Update attendance metrics from database
 */
async function updateAttendanceMetrics() {
  try {
    // Events today
    const today = await pool.query(`
      SELECT COUNT(*) as count
      FROM attendance_record
      WHERE attendance_date = CURRENT_DATE
    `);
    attendanceEventsToday.set(parseInt(today.rows[0].count));

    // Currently present employees
    // Currently present employees (placeholder since tracked in-memory)
    employeesPresent.set(0);

  } catch (error) {
    console.error('Error updating attendance metrics:', error);
  }
}

/**
 * Update alert metrics from database
 */
async function updateAlertMetrics() {
  try {
    const alerts = await pool.query(`
      SELECT 
        CASE 
          WHEN confidence_score < 0.3 THEN 'high'
          WHEN confidence_score < 0.35 THEN 'medium'
          ELSE 'low'
        END as severity,
        COUNT(*) as count
      FROM unauthorized_access_log
      WHERE resolved_at IS NULL
      GROUP BY severity
    `);

    // Reset all severities to 0
    activeAlerts.set({ severity: 'high' }, 0);
    activeAlerts.set({ severity: 'medium' }, 0);
    activeAlerts.set({ severity: 'low' }, 0);

    // Set actual counts
    alerts.rows.forEach(row => {
      activeAlerts.set({ severity: row.severity }, parseInt(row.count));
    });

  } catch (error) {
    console.error('Error updating alert metrics:', error);
  }
}

/**
 * Update all metrics - called periodically
 */
export async function updateAllMetrics() {
  await Promise.all([
    updateDeviceMetrics(),
    updateAttendanceMetrics(),
    updateAlertMetrics()
  ]);
}

/**
 * Increment API request counter
 */
export function recordApiRequest(method, route, status) {
  apiRequestCounter.inc({ method, route, status: status.toString() });
}

/**
 * Record API latency
 */
export function recordApiLatency(method, route, durationSeconds) {
  apiLatency.observe({ method, route }, durationSeconds);
}

/**
 * Record attendance event
 */
export function recordAttendanceEvent(eventType, site) {
  attendanceEventCounter.inc({ event_type: eventType, site });
}

/**
 * Record recognition latency
 */
export function recordRecognitionLatency(deviceCode, durationSeconds) {
  recognitionLatency.observe({ device_code: deviceCode }, durationSeconds);
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics() {
  return register.metrics();
}

/**
 * Get registry for health checks
 */
export function getRegister() {
  return register;
}

export default {
  updateAllMetrics,
  recordApiRequest,
  recordApiLatency,
  recordAttendanceEvent,
  recordRecognitionLatency,
  getMetrics,
  getRegister
};
