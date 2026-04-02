import { pool } from '../db/pool.js';

export async function findDeviceByCode(deviceCode) {
  const result = await pool.query(
    `SELECT d.*, f.floor_name, b.building_name, s.site_name, s.timezone
     FROM devices d
     LEFT JOIN frs_floor f ON d.fk_floor_id = f.pk_floor_id
     LEFT JOIN frs_building b ON f.fk_building_id = b.pk_building_id
     LEFT JOIN frs_site s ON b.fk_site_id = s.pk_site_id
     WHERE d.device_code = $1`,
    [deviceCode]
  );
  return result.rows[0] || null;
}

export async function listAllDevices() {
  const result = await pool.query(
    `SELECT d.*, f.floor_name, b.building_name, s.site_name
     FROM devices d
     LEFT JOIN frs_floor f ON d.fk_floor_id = f.pk_floor_id
     LEFT JOIN frs_building b ON f.fk_building_id = b.pk_building_id
     LEFT JOIN frs_site s ON b.fk_site_id = s.pk_site_id
     ORDER BY d.device_name`
  );
  return result.rows;
}

export async function updateDeviceTelemetry(deviceCode, stats) {
  await pool.query(
    `UPDATE devices 
     SET total_scans = COALESCE($2, total_scans),
         recognition_accuracy = COALESCE($3, recognition_accuracy),
         status = $4,
         last_active = NOW(),
         last_heartbeat_at = NOW()
     WHERE device_code = $1`,
    [deviceCode, stats.total_scans, stats.accuracy, stats.status || 'online']
  );
}

export async function createDevice(data) {
  const { code, name, type, floorId, ip, config } = data;
  const result = await pool.query(
    `INSERT INTO devices (device_code, device_name, device_type, fk_floor_id, ip_address, config_json)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [code, name, type, floorId, ip, JSON.stringify(config || {})]
  );
  return result.rows[0];
}
