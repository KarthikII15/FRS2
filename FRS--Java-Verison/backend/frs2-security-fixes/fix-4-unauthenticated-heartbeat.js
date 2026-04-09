/**
 * FIX #4: Unauthenticated Heartbeat Endpoint
 * 
 * SEVERITY: CRITICAL
 * FILE: backend/src/routes/deviceRoutes.js
 * VULNERABILITY: Anyone can spoof device online status
 * 
 * PROBLEM:
 *   POST /nug-boxes/:code/heartbeat
 *   → No authentication required
 *   → Any attacker knowing a device code can:
 *      - Spoof device online status
 *      - Prevent offline alerting
 *      - Send fake health metrics
 *      - Update last_heartbeat for devices they don't own
 * 
 * FIX: Add deviceAuth middleware to verify JWT from Jetson
 * IMPACT: +4 points to security score
 */

// ===========================================================================
// STEP 1: Ensure deviceAuth middleware exists and is imported
// ===========================================================================

// At the top of backend/src/routes/deviceRoutes.js:
const deviceAuth = require('../middleware/deviceAuth');

// If deviceAuth.js doesn't exist, create it:
// See: /home/claude/deviceAuth-middleware.js

// ===========================================================================
// BEFORE (VULNERABLE):
// ===========================================================================

router.post('/nug-boxes/:code/heartbeat', async (req, res) => {
    try {
        const { code } = req.params;
        const { status = 'online' } = req.body;
        
        // ❌ NO AUTHENTICATION - Anyone can call this!
        const result = await db.query(`
            UPDATE facility_device 
            SET last_heartbeat = NOW(), status = $1 
            WHERE external_device_id = $2
            RETURNING *
        `, [status, code]);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================================================================
// AFTER (SECURED):
// ===========================================================================

router.post('/nug-boxes/:code/heartbeat', deviceAuth, async (req, res) => {
    //                                      ^^^^^^^^^^
    //                                      ✅ SECURITY FIX: Add deviceAuth middleware
    
    try {
        const { code } = req.params;
        const { 
            status = 'online',
            cpu_usage,
            memory_usage,
            gpu_usage,
            temperature,
            disk_usage,
            fps,
            active_streams,
            faces_processed_today,
            last_recognition_at
        } = req.body;
        
        // ✅ SECURITY FIX: Verify authenticated device matches route parameter
        // req.device is populated by deviceAuth middleware after JWT verification
        if (req.device?.external_device_id !== code) {
            console.warn(`[Heartbeat] Device code mismatch: token=${req.device?.external_device_id}, route=${code}`);
            return res.status(403).json({ 
                error: 'Device code mismatch. Authentication failed.',
                hint: 'The device code in your JWT does not match the requested device code.'
            });
        }
        
        const timestamp = new Date();
        
        // ✅ Update heartbeat with validated health metrics
        const query = `
            UPDATE facility_device 
            SET 
                last_heartbeat = $1,
                status = $2,
                cpu_usage = $3,
                memory_usage = $4,
                gpu_usage = $5,
                temperature = $6,
                disk_usage = $7,
                fps = $8,
                active_streams = $9,
                faces_processed_today = $10,
                last_recognition_at = $11,
                updated_at = $1
            WHERE external_device_id = $12 AND tenant_id = $13  -- ✅ Also verify tenant
            RETURNING 
                pk_device_id,
                device_name,
                external_device_id,
                last_heartbeat,
                status,
                site_id
        `;
        
        const result = await db.query(query, [
            timestamp,
            status,
            cpu_usage,
            memory_usage,
            gpu_usage,
            temperature,
            disk_usage,
            fps,
            active_streams,
            faces_processed_today,
            last_recognition_at,
            code,
            req.device.tenant_id  // ✅ From authenticated device token
        ]);
        
        if (result.rows.length === 0) {
            console.error(`[Heartbeat] Device not found or tenant mismatch: code=${code}, tenant=${req.device.tenant_id}`);
            return res.status(404).json({ 
                error: 'Device not found or access denied',
                hint: 'Device may have been deleted or moved to another tenant.'
            });
        }
        
        const device = result.rows[0];
        
        // Optional: Log heartbeat for debugging (can be noisy in production)
        if (process.env.LOG_HEARTBEATS === 'true') {
            await writeAudit({
                action: 'device.heartbeat',
                entity_type: 'device',
                entity_id: device.pk_device_id,
                entity_name: device.device_name,
                source: 'device',
                details: { 
                    status, 
                    metrics: { 
                        cpu_usage, 
                        memory_usage, 
                        gpu_usage, 
                        temperature,
                        fps 
                    } 
                }
            }, req);
        }
        
        // Check for health issues and alert if needed
        if (temperature && temperature > 80) {
            console.warn(`[Heartbeat] High temperature alert: ${device.device_name} at ${temperature}°C`);
            // TODO: Trigger alert notification
        }
        
        if (cpu_usage && cpu_usage > 90) {
            console.warn(`[Heartbeat] High CPU usage alert: ${device.device_name} at ${cpu_usage}%`);
            // TODO: Trigger alert notification
        }
        
        res.json({ 
            success: true, 
            device: {
                id: device.pk_device_id,
                name: device.device_name,
                external_id: device.external_device_id,
                last_heartbeat: device.last_heartbeat,
                status: device.status
            },
            timestamp,
            next_heartbeat_due: new Date(timestamp.getTime() + 60000) // +1 minute
        });
        
    } catch (error) {
        console.error('[Heartbeat] Error:', error);
        res.status(500).json({ 
            error: 'Failed to process heartbeat',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * ADDITIONAL SECURITY ENHANCEMENTS:
 */

// 1. Add rate limiting to prevent heartbeat spam
const rateLimit = require('express-rate-limit');

const heartbeatLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5, // Max 5 heartbeats per minute per device (every 12 seconds)
    keyGenerator: (req) => req.device?.external_device_id || req.ip,
    message: { error: 'Too many heartbeat requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply to route:
router.post('/nug-boxes/:code/heartbeat', heartbeatLimiter, deviceAuth, async (req, res) => {
    // ... handler code above
});

// 2. Add offline detection cron job (backend/src/jobs/deviceHealthMonitor.js):
/*
const cron = require('node-cron');
const { sendAlert } = require('../services/alertService');

// Run every 2 minutes to detect offline devices
cron.schedule('*/2 * * * *', async () => {
    try {
        // Find devices that haven't sent heartbeat in 3 minutes
        const offlineDevices = await db.query(`
            SELECT 
                d.pk_device_id,
                d.device_name,
                d.external_device_id,
                d.last_heartbeat,
                d.status,
                s.site_name,
                c.customer_name,
                EXTRACT(EPOCH FROM (NOW() - d.last_heartbeat)) as seconds_offline
            FROM facility_device d
            LEFT JOIN frs_site s ON d.site_id = s.pk_site_id
            LEFT JOIN customers c ON s.customer_id = c.pk_customer_id
            WHERE 
                d.status = 'active'  -- Only check active devices
                AND d.last_heartbeat < NOW() - INTERVAL '3 minutes'
                AND (d.alerted_offline_at IS NULL 
                     OR d.alerted_offline_at < NOW() - INTERVAL '30 minutes') -- Don't spam alerts
        `);
        
        for (const device of offlineDevices.rows) {
            console.warn(`[Health Monitor] Device offline: ${device.device_name} (${Math.floor(device.seconds_offline / 60)} minutes)`);
            
            // Mark as offline
            await db.query(`
                UPDATE facility_device 
                SET 
                    status = 'offline',
                    alerted_offline_at = NOW()
                WHERE pk_device_id = $1
            `, [device.pk_device_id]);
            
            // Send alert to admins
            await sendAlert({
                type: 'device_offline',
                severity: 'warning',
                title: `Device Offline: ${device.device_name}`,
                message: `${device.device_name} at ${device.site_name} has not sent heartbeat for ${Math.floor(device.seconds_offline / 60)} minutes.`,
                device_id: device.pk_device_id,
                site_name: device.site_name,
                customer_name: device.customer_name
            });
        }
        
        console.log(`[Health Monitor] Checked ${offlineDevices.rows.length} offline devices`);
        
    } catch (error) {
        console.error('[Health Monitor] Error:', error);
    }
});
*/

/**
 * TESTING:
 * 
 * 1. Generate device JWT token (from Jetson or manually):
 *    See: /home/claude/generate-device-token.js
 * 
 * 2. Send authenticated heartbeat (should succeed):
 *    curl -X POST http://172.20.100.222:8080/api/nug-boxes/DEVICE001/heartbeat \
 *      -H "Authorization: Bearer <device_jwt_token>" \
 *      -H "Content-Type: application/json" \
 *      -d '{
 *        "status": "online",
 *        "cpu_usage": 45.2,
 *        "memory_usage": 62.8,
 *        "gpu_usage": 78.5,
 *        "temperature": 65,
 *        "fps": 15
 *      }'
 *    → Should return 200: { "success": true, "device": {...} }
 * 
 * 3. Send unauthenticated heartbeat (should fail):
 *    curl -X POST http://172.20.100.222:8080/api/nug-boxes/DEVICE001/heartbeat \
 *      -H "Content-Type: application/json" \
 *      -d '{"status": "online"}'
 *    → Should return 401: "No authorization token provided"
 * 
 * 4. Send heartbeat with wrong device code (should fail):
 *    curl -X POST http://172.20.100.222:8080/api/nug-boxes/DEVICE999/heartbeat \
 *      -H "Authorization: Bearer <device001_jwt_token>" \
 *      -H "Content-Type: application/json" \
 *      -d '{"status": "online"}'
 *    → Should return 403: "Device code mismatch"
 * 
 * 5. Verify heartbeat updated in database:
 *    SELECT 
 *        external_device_id,
 *        last_heartbeat,
 *        status,
 *        cpu_usage,
 *        memory_usage,
 *        gpu_usage,
 *        temperature,
 *        fps,
 *        EXTRACT(EPOCH FROM (NOW() - last_heartbeat)) as seconds_ago
 *    FROM facility_device
 *    WHERE external_device_id = 'DEVICE001';
 *    → Should show recent last_heartbeat timestamp
 * 
 * 6. Test rate limiting (send 6+ heartbeats in 1 minute):
 *    for i in {1..6}; do
 *      curl -X POST http://172.20.100.222:8080/api/nug-boxes/DEVICE001/heartbeat \
 *        -H "Authorization: Bearer <device_jwt_token>" \
 *        -H "Content-Type: application/json" \
 *        -d '{"status": "online"}'
 *      sleep 10
 *    done
 *    → 6th request should return 429: "Too many heartbeat requests"
 */

/**
 * JETSON CONFIGURATION:
 * 
 * The Jetson device (frs_runner) needs to be updated to send device JWT:
 * 
 * 1. Generate device token on device registration (backend)
 * 2. Store token in /opt/frs/config.json on Jetson
 * 3. Update C++ heartbeat sender to include Authorization header
 * 
 * Example config.json on Jetson:
 * {
 *   "device_code": "DEVICE001",
 *   "device_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *   "backend_url": "http://172.20.100.222:8080",
 *   "heartbeat_interval": 30
 * }
 * 
 * Example C++ heartbeat code:
 * std::string token = config["device_token"];
 * httplib::Headers headers = {
 *     {"Authorization", "Bearer " + token},
 *     {"Content-Type", "application/json"}
 * };
 * 
 * auto res = client.Post("/api/nug-boxes/DEVICE001/heartbeat", headers, body, "application/json");
 */
