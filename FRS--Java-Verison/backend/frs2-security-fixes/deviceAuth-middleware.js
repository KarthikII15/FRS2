/**
 * Device Authentication Middleware
 * 
 * FILE: backend/src/middleware/deviceAuth.js
 * PURPOSE: Authenticate Jetson devices via JWT tokens
 * 
 * This middleware:
 * 1. Extracts JWT from Authorization header
 * 2. Verifies JWT signature with device secret
 * 3. Decodes device identity (external_device_id, tenant_id)
 * 4. Attaches device info to req.device for downstream use
 */

const jwt = require('jsonwebtoken');
const db = require('../config/database');

/**
 * Device JWT Secret
 * 
 * CRITICAL: Use a different secret than user JWTs
 * Store in environment variable, not hardcoded
 */
const DEVICE_JWT_SECRET = process.env.DEVICE_JWT_SECRET || 'CHANGE_THIS_IN_PRODUCTION_DEVICE_SECRET_2026';

/**
 * Device Authentication Middleware
 * 
 * Usage:
 *   router.post('/heartbeat', deviceAuth, async (req, res) => {
 *     const device = req.device; // { external_device_id, tenant_id, pk_device_id, ... }
 *   });
 */
const deviceAuth = async (req, res, next) => {
    try {
        // Extract Authorization header
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({ 
                error: 'No authorization token provided',
                hint: 'Include Authorization: Bearer <token> header'
            });
        }
        
        // Verify Bearer format
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return res.status(401).json({ 
                error: 'Invalid authorization format',
                hint: 'Use format: Authorization: Bearer <token>'
            });
        }
        
        const token = parts[1];
        
        // Verify and decode JWT
        let decoded;
        try {
            decoded = jwt.verify(token, DEVICE_JWT_SECRET);
        } catch (jwtError) {
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    error: 'Device token expired',
                    hint: 'Please re-register the device to get a new token'
                });
            }
            if (jwtError.name === 'JsonWebTokenError') {
                return res.status(401).json({ 
                    error: 'Invalid device token',
                    hint: 'Token signature verification failed'
                });
            }
            throw jwtError;
        }
        
        // Validate required claims
        if (!decoded.device_id || !decoded.external_device_id || !decoded.tenant_id) {
            return res.status(401).json({ 
                error: 'Invalid token claims',
                hint: 'Token must contain device_id, external_device_id, and tenant_id'
            });
        }
        
        // Optional: Verify device still exists and is active in database
        const deviceCheck = await db.query(`
            SELECT 
                pk_device_id,
                external_device_id,
                device_name,
                tenant_id,
                site_id,
                status,
                created_at
            FROM facility_device
            WHERE pk_device_id = $1 AND tenant_id = $2
        `, [decoded.device_id, decoded.tenant_id]);
        
        if (deviceCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Device not found',
                hint: 'Device may have been deleted or moved to another tenant'
            });
        }
        
        const device = deviceCheck.rows[0];
        
        // Optional: Block deleted devices
        if (device.status === 'deleted') {
            return res.status(403).json({ 
                error: 'Device has been deleted',
                hint: 'This device is no longer authorized to access the system'
            });
        }
        
        // Attach device info to request for use in route handlers
        req.device = {
            pk_device_id: device.pk_device_id,
            external_device_id: device.external_device_id,
            device_name: device.device_name,
            tenant_id: device.tenant_id,
            site_id: device.site_id,
            status: device.status,
            token_issued_at: new Date(decoded.iat * 1000),
            token_expires_at: decoded.exp ? new Date(decoded.exp * 1000) : null
        };
        
        // Continue to route handler
        next();
        
    } catch (error) {
        console.error('[deviceAuth] Authentication error:', error);
        res.status(500).json({ 
            error: 'Authentication failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Generate Device JWT Token
 * 
 * Called when a device is first registered or token needs renewal
 * 
 * @param {Object} device - Device object from database
 * @param {number} device.pk_device_id - Database ID
 * @param {string} device.external_device_id - Device code (e.g., "DEVICE001")
 * @param {number} device.tenant_id - Tenant ID
 * @param {string} expiresIn - Token expiration (e.g., "365d", "never")
 * @returns {string} JWT token
 */
const generateDeviceToken = (device, expiresIn = '365d') => {
    const payload = {
        device_id: device.pk_device_id,
        external_device_id: device.external_device_id,
        tenant_id: device.tenant_id,
        type: 'device', // Distinguish from user tokens
        issued_at: new Date().toISOString()
    };
    
    const options = {
        algorithm: 'HS256'
    };
    
    // Add expiration if specified (for production, use expiration)
    if (expiresIn && expiresIn !== 'never') {
        options.expiresIn = expiresIn;
    }
    
    return jwt.sign(payload, DEVICE_JWT_SECRET, options);
};

/**
 * Revoke Device Token
 * 
 * For production: implement token blacklist in Redis or database
 * For now: tokens are stateless, so revocation requires token rotation
 */
const revokeDeviceToken = async (deviceId) => {
    // TODO: Implement token blacklist
    // For now, we rely on database-level device status check in deviceAuth
    
    await db.query(`
        UPDATE facility_device 
        SET 
            status = 'inactive',
            token_revoked_at = NOW()
        WHERE pk_device_id = $1
    `, [deviceId]);
    
    console.log(`[deviceAuth] Token revoked for device ${deviceId}`);
};

module.exports = {
    deviceAuth,
    generateDeviceToken,
    revokeDeviceToken,
    DEVICE_JWT_SECRET // Export for testing only, never use directly
};

/**
 * USAGE EXAMPLES:
 */

/*
// 1. In deviceRoutes.js - Protect heartbeat endpoint
const { deviceAuth } = require('../middleware/deviceAuth');

router.post('/nug-boxes/:code/heartbeat', deviceAuth, async (req, res) => {
    const device = req.device; // Available after auth
    console.log(`Heartbeat from ${device.device_name} (${device.external_device_id})`);
    // ... handle heartbeat
});

// 2. When registering a new device - Generate token
const { generateDeviceToken } = require('../middleware/deviceAuth');

router.post('/devices', async (req, res) => {
    // ... create device in database
    const device = result.rows[0];
    
    // Generate device token
    const deviceToken = generateDeviceToken(device, '365d'); // Expires in 1 year
    
    res.json({
        device,
        device_token: deviceToken,
        instructions: 'Store this token in /opt/frs/config.json on the Jetson device'
    });
});

// 3. When deleting a device - Revoke token
const { revokeDeviceToken } = require('../middleware/deviceAuth');

router.delete('/devices/:id', async (req, res) => {
    await revokeDeviceToken(req.params.id);
    await db.query('DELETE FROM facility_device WHERE pk_device_id = $1', [req.params.id]);
    res.json({ success: true });
});
*/

/**
 * SECURITY CONSIDERATIONS:
 * 
 * 1. Secret Management:
 *    - Use strong random secret (min 32 characters)
 *    - Store in environment variable, never commit to git
 *    - Rotate secret periodically (requires re-issuing all device tokens)
 * 
 * 2. Token Expiration:
 *    - Production: Use 1 year expiration
 *    - Implement token renewal mechanism before expiration
 *    - Alert admins when tokens are expiring soon
 * 
 * 3. Token Revocation:
 *    - Implement Redis-based token blacklist for immediate revocation
 *    - Alternative: Short-lived tokens (1 week) with auto-renewal
 * 
 * 4. Transport Security:
 *    - Always use HTTPS/TLS for device-to-backend communication
 *    - Never log or display full tokens
 * 
 * 5. Monitoring:
 *    - Log all failed authentication attempts
 *    - Alert on suspicious patterns (many failed auths from one device)
 *    - Track token usage (last used timestamp)
 */
