import express from 'express';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { pool } from '../db/pool.js';

const router = express.Router();
router.use(requireAuth);

/**
 * UNIFIED CAMERA & FACILITY DEVICE ROUTE
 * Merges 'devices' (Config) and 'facility_device' (Telemetry)
 */

// 1. GET ALL CAMERAS (WITH LIVE TELEMETRY)
router.get('/', requirePermission('devices.read'), asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
        SELECT 
            d.pk_device_id AS id,
            d.device_code AS code,
            d.device_name AS name,
            d.ip_address::text AS "ipAddress",
            fd.status,
            fd.total_scans AS "total_scans",
            fd.recognition_accuracy AS "recognition_accuracy",
            fd.last_active AS "last_active",
            d.config_json AS config,
            d.location_description AS location
        FROM devices d
        LEFT JOIN facility_device fd ON d.device_code = fd.external_device_id
        WHERE d.device_type = 'camera'
        ORDER BY d.device_name
    `);
    
    return res.json({ data: rows });
}));

// 2. REGISTER NEW ASSET (SYNCED TO BOTH TABLES)
router.post('/', requirePermission('devices.write'), asyncHandler(async (req, res) => {
    const { code, name, ipAddress, location, role } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Insert into Master Devices
        const devRes = await client.query(
            "INSERT INTO devices (device_code, device_name, device_type, ip_address, location_description, config_json) VALUES ($1,$2,'camera',$3,$4,$5) RETURNING pk_device_id",
            [code, name, ipAddress, location, JSON.stringify({ role: role || 'entry' })]
        );
        
        // Insert into Facility Deployment (Live Table)
        await client.query(
            "INSERT INTO facility_device (external_device_id, name, status, tenant_id) VALUES ($1, $2, 'offline', 1)",
            [code, name]
        );
        
        await client.query('COMMIT');
        res.status(201).json({ success: true, id: devRes.rows[0].pk_device_id });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: e.message });
    } finally {
        client.release();
    }
}));

// 3. PING / TEST (FIXED ID RESOLUTION)
router.post('/:id/test', requirePermission('devices.read'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if ID is numeric or a code
    const query = isNaN(id) 
        ? "SELECT ip_address, config_json FROM devices WHERE device_code = $1"
        : "SELECT ip_address, config_json FROM devices WHERE pk_device_id = $1";
        
    const { rows } = await pool.query(query, [id]);
    if (!rows.length) return res.status(404).json({ message: 'Device not found' });

    const ip = rows[0].ip_address;
    if (!ip) return res.status(422).json({ reachable: false, message: 'No IP configured' });

    // Actual Network Probe (ICMP Ping)
    const { exec } = await import('child_process');
    exec(`ping -c 1 -W 2 ${ip}`, (err) => {
        res.json({ reachable: !err, message: !err ? 'Host Alive' : 'Host Unreachable' });
    });
}));

// 4. NEW: SAVE GLOBAL AI CONFIG (THRESHOLD & COOLDOWN)
router.post('/system-config', requirePermission('devices.write'), asyncHandler(async (req, res) => {
    const { threshold, cooldown } = req.body;
    
    // We update the config_json of all active cameras to propagate the setting
    await pool.query(`
        UPDATE devices 
        SET config_json = config_json || jsonb_build_object('threshold', $1::numeric, 'cooldown', $2::int)
        WHERE device_type = 'camera'
    `, [threshold, cooldown]);
    
    res.json({ success: true, message: 'Settings deployed to all edge nodes' });
}));

// 5. STATUS TOGGLE (FIXED TO SYNC BOTH TABLES)
router.patch('/:code/status', requirePermission('devices.write'), asyncHandler(async (req, res) => {
    const { code } = req.params;
    const { status } = req.body;
    
    await pool.query("UPDATE facility_device SET status = $1 WHERE external_device_id = $2", [status, code]);
    await pool.query("UPDATE devices SET status = $1 WHERE device_code = $2", [status, code]);
    
    res.json({ success: true });
}));

export { router as cameraRoutes };
