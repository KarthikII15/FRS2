/**
 * deviceRoutes.js — Device Management APIs
 * Hierarchy: Site → Building → Floor → Zone → NUG Box → Camera
 */
import express from 'express';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { pool } from '../db/pool.js';
import { writeAudit } from '../middleware/auditLog.js';
import wsManager from '../websocket/index.js';

const router = express.Router();
router.use(requireAuth);

// --- Background Maintenance Tasks ---
setInterval(async () => {
  try {
    // Cleanup telemetry history older than 2 days (increased for testing)
    await pool.query("DELETE FROM frs_telemetry_history WHERE timestamp < NOW() - INTERVAL '2 days'");
  } catch (err) {
    console.error('[Device Maintenance] History cleanup failed:', err.message);
  }
}, 10 * 60 * 1000); // Run every 10 minutes

const getTenant = (req) => req.auth?.scope?.tenantId || req.headers['x-tenant-id'] || '1';

// ── Buildings ─────────────────────────────────────────────────
router.get('/buildings', requirePermission('users.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT b.*,
      COUNT(DISTINCT f.pk_floor_id)::int as floor_count,
      COUNT(DISTINCT n.pk_nug_id)::int as nug_count,
      COUNT(DISTINCT c.pk_camera_id)::int as camera_count
    FROM frs_building b
    LEFT JOIN frs_floor f ON f.fk_building_id = b.pk_building_id
    LEFT JOIN frs_nug_box n ON n.fk_building_id = b.pk_building_id
    LEFT JOIN frs_camera c ON c.fk_floor_id = f.pk_floor_id
    WHERE b.fk_site_id = $1
    GROUP BY b.pk_building_id ORDER BY b.name
  `, [getTenant(req)]);
  return res.json({ data: rows });
}));

router.post('/buildings', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { name, address } = req.body;
  if (!name) return res.status(400).json({ message: 'name required' });
  const { rows } = await pool.query(
    `INSERT INTO frs_building (fk_site_id, name, address) VALUES ($1,$2,$3) RETURNING *`,
    [getTenant(req), name, address || null]
  );
  await writeAudit({ req, action: 'building.create', details: `Building created: ${name}` });
  return res.status(201).json(rows[0]);
}));

router.put('/buildings/:id', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { name, address } = req.body;
  const { rows } = await pool.query(
    `UPDATE frs_building SET name=COALESCE($2,name), address=COALESCE($3,address)
     WHERE pk_building_id=$1 RETURNING *`,
    [req.params.id, name, address]
  );
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  return res.json(rows[0]);
}));

router.delete('/buildings/:id', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  await pool.query(`DELETE FROM frs_building WHERE pk_building_id=$1`, [req.params.id]);
  return res.json({ success: true });
}));

// ── Floors ────────────────────────────────────────────────────
router.get('/buildings/:buildingId/floors', requirePermission('users.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT f.*,
      COUNT(DISTINCT z.pk_zone_id)::int as zone_count,
      COUNT(DISTINCT n.pk_nug_id)::int as nug_count,
      COUNT(DISTINCT c.pk_camera_id)::int as camera_count
    FROM frs_floor f
    LEFT JOIN frs_zone z ON z.fk_floor_id = f.pk_floor_id
    LEFT JOIN frs_nug_box n ON n.fk_floor_id = f.pk_floor_id
    LEFT JOIN frs_camera c ON c.fk_floor_id = f.pk_floor_id
    WHERE f.fk_building_id = $1
    GROUP BY f.pk_floor_id ORDER BY f.floor_number
  `, [req.params.buildingId]);
  return res.json({ data: rows });
}));

router.post('/buildings/:buildingId/floors', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { floor_number, floor_name } = req.body;
  if (!floor_number) return res.status(400).json({ message: 'floor_number required' });
  const { rows } = await pool.query(
    `INSERT INTO frs_floor (fk_building_id, floor_number, floor_name) VALUES ($1,$2,$3) RETURNING *`,
    [req.params.buildingId, floor_number, floor_name || `Floor ${floor_number}`]
  );
  return res.status(201).json(rows[0]);
}));

router.put('/floors/:id', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { floor_name, floor_number, floor_plan_url, floor_plan_data } = req.body;
  const { rows } = await pool.query(
    `UPDATE frs_floor SET
      floor_name=COALESCE($2,floor_name),
      floor_number=COALESCE($3,floor_number),
      floor_plan_url=COALESCE($4,floor_plan_url),
      floor_plan_data=COALESCE($5,floor_plan_data)
     WHERE pk_floor_id=$1 RETURNING *`,
    [req.params.id, floor_name, floor_number, floor_plan_url, floor_plan_data ? JSON.stringify(floor_plan_data) : null]
  );
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  wsManager.broadcastDeviceChange(req);
  return res.json(rows[0]);
}));

router.delete('/floors/:id', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  await pool.query(`DELETE FROM frs_floor WHERE pk_floor_id=$1`, [req.params.id]);
  return res.json({ success: true });
}));

// ── Zones ─────────────────────────────────────────────────────
router.get('/floors/:floorId/zones', requirePermission('users.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT z.*, COUNT(c.pk_camera_id)::int as camera_count
     FROM frs_zone z
     LEFT JOIN frs_camera c ON c.fk_zone_id = z.pk_zone_id
     WHERE z.fk_floor_id=$1 GROUP BY z.pk_zone_id ORDER BY z.zone_name`,
    [req.params.floorId]
  );
  return res.json({ data: rows });
}));

router.post('/floors/:floorId/zones', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { zone_name, zone_type } = req.body;
  if (!zone_name) return res.status(400).json({ message: 'zone_name required' });
  const { rows } = await pool.query(
    `INSERT INTO frs_zone (fk_floor_id, zone_name, zone_type) VALUES ($1,$2,$3) RETURNING *`,
    [req.params.floorId, zone_name, zone_type || 'common']
  );
  return res.status(201).json(rows[0]);
}));

router.delete('/zones/:id', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  await pool.query(`DELETE FROM frs_zone WHERE pk_zone_id=$1`, [req.params.id]);
  return res.json({ success: true });
}));

// ── NUG Boxes ─────────────────────────────────────────────────
router.get('/nug-boxes', requirePermission('users.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT n.*,
      b.name as building_name,
      f.floor_name, f.floor_number,
      z.zone_name,
      COUNT(c.pk_camera_id)::int as camera_count,
      COUNT(CASE WHEN c.status='online' THEN 1 END)::int as cameras_online
    FROM frs_nug_box n
    LEFT JOIN frs_building b ON b.pk_building_id = n.fk_building_id
    LEFT JOIN frs_floor f ON f.pk_floor_id = n.fk_floor_id
    LEFT JOIN frs_zone z ON z.pk_zone_id = n.fk_zone_id
    LEFT JOIN frs_camera c ON c.fk_nug_id = n.pk_nug_id
    WHERE n.fk_site_id = $1
    GROUP BY n.pk_nug_id, b.name, f.floor_name, f.floor_number, z.zone_name
    ORDER BY f.floor_number, n.name
  `, [getTenant(req)]);
  return res.json({ data: rows });
}));

router.get('/nug-boxes/:id', requirePermission('users.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT n.*,
      b.name as building_name,
      f.floor_name, f.floor_number,
      z.zone_name,
      json_agg(json_build_object(
        'pk_camera_id', c.pk_camera_id,
        'name', c.name,
        'cam_id', c.cam_id,
        'ip_address', c.ip_address,
        'rtsp_url', c.rtsp_url,
        'status', c.status,
        'recognition_accuracy', c.recognition_accuracy,
        'total_scans', c.total_scans,
        'map_x', c.map_x, 'map_y', c.map_y, 'map_angle', c.map_angle,
        'last_active', c.last_active
      ) ORDER BY c.name) FILTER (WHERE c.pk_camera_id IS NOT NULL) as cameras
    FROM frs_nug_box n
    LEFT JOIN frs_building b ON b.pk_building_id = n.fk_building_id
    LEFT JOIN frs_floor f ON f.pk_floor_id = n.fk_floor_id
    LEFT JOIN frs_zone z ON z.pk_zone_id = n.fk_zone_id
    LEFT JOIN frs_camera c ON c.fk_nug_id = n.pk_nug_id
    WHERE n.pk_nug_id = $1
    GROUP BY n.pk_nug_id, b.name, f.floor_name, f.floor_number, z.zone_name
  `, [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  return res.json(rows[0]);
}));

router.post('/nug-boxes', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { name, device_code, ip_address, port, fk_building_id, fk_floor_id, fk_zone_id,
          match_threshold, conf_threshold, cooldown_seconds, x_threshold, tracking_window } = req.body;
  if (!name || !ip_address) return res.status(400).json({ message: 'name and ip_address required' });
  const { rows } = await pool.query(`
    INSERT INTO frs_nug_box (fk_site_id, fk_building_id, fk_floor_id, fk_zone_id,
      name, device_code, ip_address, port, match_threshold, conf_threshold,
      cooldown_seconds, x_threshold, tracking_window)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
  `, [getTenant(req), fk_building_id||null, fk_floor_id||null, fk_zone_id||null,
      name, device_code||null, ip_address, port||5000,
      match_threshold||0.38, conf_threshold||0.35, cooldown_seconds||3,
      x_threshold||25, tracking_window||6]);
  await writeAudit({ req, action: 'nug.create', details: `NUG Box created: ${name} (${ip_address})` });
  return res.status(201).json(rows[0]);
}));

router.put('/nug-boxes/:id', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { name, ip_address, port, fk_building_id, fk_floor_id, fk_zone_id,
          match_threshold, conf_threshold, cooldown_seconds, x_threshold,
          tracking_window, map_x, map_y } = req.body;
  const { rows } = await pool.query(`
    UPDATE frs_nug_box SET
      name=COALESCE($2,name), ip_address=COALESCE($3,ip_address),
      port=COALESCE($4,port), fk_building_id=COALESCE($5,fk_building_id),
      fk_floor_id=COALESCE($6,fk_floor_id), fk_zone_id=COALESCE($7,fk_zone_id),
      match_threshold=COALESCE($8,match_threshold), conf_threshold=COALESCE($9,conf_threshold),
      cooldown_seconds=COALESCE($10,cooldown_seconds), x_threshold=COALESCE($11,x_threshold),
      tracking_window=COALESCE($12,tracking_window),
      map_x=COALESCE($13,map_x), map_y=COALESCE($14,map_y)
    WHERE pk_nug_id=$1 RETURNING *
  `, [req.params.id, name, ip_address, port, fk_building_id, fk_floor_id,
      fk_zone_id, match_threshold, conf_threshold, cooldown_seconds,
      x_threshold, tracking_window, map_x, map_y]);
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  wsManager.broadcastDeviceChange(req);
  return res.json(rows[0]);
}));

router.delete('/nug-boxes/:id', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  await pool.query(`DELETE FROM frs_nug_box WHERE pk_nug_id=$1`, [req.params.id]);
  return res.json({ success: true });
}));

// NUG Box — Ping
router.post('/nug-boxes/:id/ping', requirePermission('users.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT ip_address, port FROM frs_nug_box WHERE pk_nug_id=$1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  const { ip_address, port } = rows[0];
  try {
    const start = Date.now();
    const resp = await fetch(`http://${ip_address}:${port}/health`, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json();
    const latency = Date.now() - start;
    await pool.query(`UPDATE frs_nug_box SET status='online', last_heartbeat=NOW() WHERE pk_nug_id=$1`, [req.params.id]);
    return res.json({ online: true, latency_ms: latency, data });
  } catch (e) {
    await pool.query(`UPDATE frs_nug_box SET status='offline' WHERE pk_nug_id=$1`, [req.params.id]);
    return res.json({ online: false, error: e.message });
  }
}));

// NUG Box — Update thresholds on device
router.post('/nug-boxes/:id/apply-config', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM frs_nug_box WHERE pk_nug_id=$1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  const nug = rows[0];
  try {
    const resp = await fetch(`http://${nug.ip_address}:${nug.port}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        match_threshold: Number(nug.match_threshold),
        conf_threshold: Number(nug.conf_threshold),
        cooldown_seconds: nug.cooldown_seconds,
        direction: { x_threshold: nug.x_threshold, tracking_window: nug.tracking_window }
      }),
      signal: AbortSignal.timeout(5000)
    });
    return res.json({ success: resp.ok, status: resp.status });
  } catch (e) {
    return res.status(503).json({ success: false, error: e.message });
  }
}));

// NUG Box — Heartbeat (called by Jetson)
router.post('/nug-boxes/:code/heartbeat', asyncHandler(async (req, res) => {
  const { status, cpu_percent, memory_used_mb, memory_total_mb, gpu_percent,
          temperature_c, disk_used_gb, uptime_seconds, cameras } = req.body;
  const { rows } = await pool.query(`
    UPDATE frs_nug_box SET
      status=COALESCE($2,status),
      cpu_percent=$3, memory_used_mb=$4, memory_total_mb=$5,
      gpu_percent=$6, temperature_c=$7, disk_used_gb=$8,
      uptime_seconds=$9, last_heartbeat=NOW()
    WHERE device_code=$1 RETURNING pk_nug_id
  `, [req.params.code, status||'online', cpu_percent??null, memory_used_mb??null,
      memory_total_mb??null, gpu_percent??null, temperature_c??null,
      disk_used_gb??null, uptime_seconds??null]);
  // Also sync facility_device table (used by overview dashboard)
  await pool.query(`
    UPDATE facility_device SET status=$2, last_active=NOW()
    WHERE external_device_id=$1
  `, [req.params.code, status||'online']);
  // Update camera stats if provided
  if (cameras && Array.isArray(cameras)) {
    for (const cam of cameras) {
      await pool.query(`
        UPDATE frs_camera SET status=$2, recognition_accuracy=$3,
          total_scans=$4, error_rate=$5, last_active=NOW()
        WHERE cam_id=$1
      `, [cam.cam_id, cam.status||'online', cam.accuracy||0, cam.total_scans||0, cam.error_rate||0]);
      // Sync to facility_device
      await pool.query(`
        UPDATE facility_device SET status=$2, recognition_accuracy=$3,
          total_scans=$4, last_active=NOW()
        WHERE external_device_id=$1
      `, [cam.cam_id, cam.status||'online', cam.accuracy||0, cam.total_scans||0]);
    }
  }
  // Send real-time delta update via WebSocket
  if (rows.length) {
    const tenantId = getTenant(req);
    wsManager.broadcastSingleDevice(tenantId, req.params.code).catch(() => {});
    
    // Also broadcast updates for all child cameras linked to this NUG
    if (cameras && Array.isArray(cameras)) {
      cameras.forEach(cam => {
        wsManager.broadcastSingleDevice(tenantId, cam.cam_id).catch(() => {});
      });
    }
  }

  return res.json({ success: true });
}));

// ── Cameras ───────────────────────────────────────────────────
router.get('/cameras', requirePermission('users.read'), asyncHandler(async (req, res) => {
  const nugId = req.query.nug_id;
  const { rows } = await pool.query(`
    SELECT c.*,
      n.name as nug_name, n.ip_address as nug_ip,
      f.floor_name, f.floor_number,
      z.zone_name
    FROM frs_camera c
    LEFT JOIN frs_nug_box n ON n.pk_nug_id = c.fk_nug_id
    LEFT JOIN frs_floor f ON f.pk_floor_id = c.fk_floor_id
    LEFT JOIN frs_zone z ON z.pk_zone_id = c.fk_zone_id
    ${nugId ? 'WHERE c.fk_nug_id=$1' : ''}
    ORDER BY f.floor_number, c.name
  `, nugId ? [nugId] : []);
  return res.json({ data: rows });
}));

router.post('/cameras', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { name, cam_id, rtsp_url, ip_address, model, fk_nug_id,
          fk_floor_id, fk_zone_id, map_x, map_y, map_angle } = req.body;
  if (!name || !cam_id) return res.status(400).json({ message: 'name and cam_id required' });
  const { rows } = await pool.query(`
    INSERT INTO frs_camera (fk_nug_id, fk_floor_id, fk_zone_id, name, cam_id,
      rtsp_url, ip_address, model, map_x, map_y, map_angle)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
  `, [fk_nug_id||null, fk_floor_id||null, fk_zone_id||null, name, cam_id,
      rtsp_url||null, ip_address||null, model||null, map_x||null, map_y||null, map_angle||0]);
  await writeAudit({ req, action: 'camera.create', details: `Camera created: ${name} (${cam_id})` });
  // Sync to facility_device for overview dashboard
  await pool.query(`
    INSERT INTO facility_device (tenant_id, customer_id, site_id, external_device_id, name, ip_address, status, model)
    VALUES ($1,$2,$3,$4,$5,$6,'offline',$7)
    ON CONFLICT (external_device_id) DO UPDATE SET name=EXCLUDED.name, ip_address=EXCLUDED.ip_address
  `, [getTenant(req), req.headers['x-customer-id']||'1', req.headers['x-site-id']||'1',
      cam_id, name, ip_address||null, model||'IP Camera']);
  return res.status(201).json(rows[0]);
}));

router.put('/cameras/:id', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { name, cam_id, rtsp_url, ip_address, model, fk_nug_id,
          fk_floor_id, fk_zone_id, map_x, map_y, map_angle } = req.body;
  const { rows } = await pool.query(`
    UPDATE frs_camera SET
      name=COALESCE($2,name), cam_id=COALESCE($3,cam_id),
      rtsp_url=COALESCE($4,rtsp_url), ip_address=COALESCE($5,ip_address),
      model=COALESCE($6,model), fk_nug_id=COALESCE($7,fk_nug_id),
      fk_floor_id=COALESCE($8,fk_floor_id), fk_zone_id=COALESCE($9,fk_zone_id),
      map_x=COALESCE($10,map_x), map_y=COALESCE($11,map_y),
      map_angle=COALESCE($12,map_angle)
    WHERE pk_camera_id=$1 RETURNING *
  `, [req.params.id, name, cam_id, rtsp_url, ip_address, model,
      fk_nug_id, fk_floor_id, fk_zone_id, map_x, map_y, map_angle]);
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  wsManager.broadcastDeviceChange(req);
  return res.json(rows[0]);
}));

router.delete('/cameras/:id', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  // Get cam_id before deleting
  const { rows: camRows } = await pool.query(`SELECT cam_id FROM frs_camera WHERE pk_camera_id=$1`, [req.params.id]);
  await pool.query(`DELETE FROM frs_camera WHERE pk_camera_id=$1`, [req.params.id]);
  // Remove from facility_device too
  if (camRows.length) await pool.query(`DELETE FROM facility_device WHERE external_device_id=$1`, [camRows[0].cam_id]);
  return res.json({ success: true });
}));

// Camera ping (Asynchronous/Non-blocking)
router.post('/cameras/:id/ping', requirePermission('users.read'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT ip_address FROM frs_camera WHERE pk_camera_id=$1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  const ip = rows[0].ip_address;
  
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    await execAsync(`ping -c 1 -W 2 ${ip}`, { timeout: 5000 });
    await pool.query(`UPDATE frs_camera SET status='online', last_active=NOW() WHERE pk_camera_id=$1`, [req.params.id]);
    return res.json({ online: true });
  } catch (e) {
    await pool.query(`UPDATE frs_camera SET status='offline' WHERE pk_camera_id=$1`, [req.params.id]);
    return res.json({ online: false, error: e.message });
  }
}));

// ── Floor plan upload (base64) ───────────────────────────────
router.post('/floors/:id/floor-plan', requirePermission('attendance.manage'), asyncHandler(async (req, res) => {
  const { floor_plan_data, floor_plan_url } = req.body;
  const { rows } = await pool.query(`
    UPDATE frs_floor SET
      floor_plan_url = COALESCE($2, floor_plan_url),
      floor_plan_data = COALESCE($3, floor_plan_data)
    WHERE pk_floor_id = $1 RETURNING *
  `, [req.params.id, floor_plan_url || null, floor_plan_data ? JSON.stringify(floor_plan_data) : null]);
  if (!rows.length) return res.status(404).json({ message: 'Floor not found' });
  wsManager.broadcastDeviceChange(req);
  return res.json(rows[0]);
}));

// ── Full hierarchy (for UI) ───────────────────────────────────
router.get('/hierarchy', requirePermission('users.read'), asyncHandler(async (req, res) => {
  const siteId = getTenant(req);
  const [buildings, floors, zones, nugs, cameras] = await Promise.all([
    pool.query(`SELECT * FROM frs_building WHERE fk_site_id=$1 ORDER BY name`, [siteId]),
    pool.query(`SELECT f.* FROM frs_floor f JOIN frs_building b ON b.pk_building_id=f.fk_building_id WHERE b.fk_site_id=$1 ORDER BY f.floor_number`, [siteId]),
    pool.query(`SELECT z.* FROM frs_zone z JOIN frs_floor f ON f.pk_floor_id=z.fk_floor_id JOIN frs_building b ON b.pk_building_id=f.fk_building_id WHERE b.fk_site_id=$1`, [siteId]),
    pool.query(`SELECT n.*, f.floor_name, f.floor_number, b.name as building_name, z.zone_name FROM frs_nug_box n LEFT JOIN frs_floor f ON f.pk_floor_id=n.fk_floor_id LEFT JOIN frs_building b ON b.pk_building_id=n.fk_building_id LEFT JOIN frs_zone z ON z.pk_zone_id=n.fk_zone_id WHERE n.fk_site_id=$1 ORDER BY f.floor_number, n.name`, [siteId]),
    pool.query(`SELECT c.*, n.name as nug_name, f.floor_name, z.zone_name FROM frs_camera c LEFT JOIN frs_nug_box n ON n.pk_nug_id=c.fk_nug_id LEFT JOIN frs_floor f ON f.pk_floor_id=c.fk_floor_id LEFT JOIN frs_zone z ON z.pk_zone_id=c.fk_zone_id ORDER BY f.floor_number, c.name`, [])
  ]);
  return res.json({
    buildings: buildings.rows,
    floors: floors.rows,
    zones: zones.rows,
    nug_boxes: nugs.rows,
    cameras: cameras.rows
  });
}));

// --- Telemetry History API ---
router.get('/telemetry/history', requirePermission('users.read'), asyncHandler(async (req, res) => {
  const siteId = getTenant(req);
  const { rows } = await pool.query(`
    WITH latest_history AS (
      SELECT 
        fk_nug_id,
        cpu, gpu, ram,
        timestamp as time,
        ROW_NUMBER() OVER (PARTITION BY fk_nug_id ORDER BY timestamp DESC) as rn
      FROM frs_telemetry_history
      WHERE fk_nug_id IN (SELECT pk_nug_id FROM frs_nug_box WHERE fk_site_id = $1)
    )
    SELECT fk_nug_id, cpu, gpu, ram, time
    FROM latest_history
    WHERE rn <= 2000
    ORDER BY fk_nug_id, time ASC
  `, [siteId]);

  // Group by NUG ID
  const historyMap = rows.reduce((acc, row) => {
    if (!acc[row.fk_nug_id]) acc[row.fk_nug_id] = [];
    acc[row.fk_nug_id].push({
      time: new Date(row.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      cpu: Number(row.cpu),
      gpu: Number(row.gpu),
      ram: Number(row.ram)
    });
    return acc;
  }, {});

  return res.json({ history: historyMap });
}));

export { router as deviceRoutes };
