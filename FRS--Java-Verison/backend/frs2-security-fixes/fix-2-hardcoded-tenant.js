/**
 * FIX #2: Hardcoded tenant_id=1 in Camera Routes
 * 
 * SEVERITY: CRITICAL
 * FILE: backend/src/routes/cameraRoutes.js
 * VULNERABILITY: Breaks multi-tenancy - all cameras registered under tenant 1
 * 
 * PROBLEM:
 *   INSERT INTO facility_device (tenant_id, ...) VALUES (1, ...)
 *   → All cameras go to tenant 1, regardless of who created them
 *   → Site admin from Tenant 2 creates camera → goes to Tenant 1
 *   → Tenant 1 can see/control cameras from all other tenants
 * 
 * FIX: Use req.auth.scope.tenantId instead of hardcoded 1
 * IMPACT: +4 points to security score
 */

// ===========================================================================
// BEFORE (VULNERABLE):
// ===========================================================================

router.post('/cameras', requirePermission('devices.write'), async (req, res) => {
    try {
        const { name, ip_address, rtsp_url, site_id, ... } = req.body;
        
        const result = await db.query(`
            INSERT INTO facility_device (
                tenant_id,        -- ❌ HARDCODED TO 1
                site_id,
                name,
                ip_address,
                rtsp_url,
                ...
            ) VALUES (
                1,                -- ❌ SECURITY BUG: Always tenant 1
                $1, $2, $3, $4, ...
            )
            RETURNING *
        `, [site_id, name, ip_address, rtsp_url, ...]);
        
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================================================================
// AFTER (SECURED):
// ===========================================================================

router.post('/cameras', requirePermission('devices.write'), async (req, res) => {
    try {
        const { name, ip_address, rtsp_url, site_id, mac_address, device_code } = req.body;
        
        // ✅ SECURITY FIX: Get tenant from authenticated user's scope
        const tenantId = req.auth?.scope?.tenantId;
        
        if (!tenantId) {
            return res.status(401).json({ 
                error: 'Tenant ID not found in authentication token' 
            });
        }
        
        // Validate required fields
        if (!name || !device_code) {
            return res.status(400).json({ 
                error: 'Missing required fields: name, device_code' 
            });
        }
        
        // Validate site_id belongs to the user's tenant (scope check)
        if (site_id) {
            const siteCheck = await db.query(`
                SELECT pk_site_id FROM frs_site 
                WHERE pk_site_id = $1 AND tenant_id = $2
            `, [site_id, tenantId]);
            
            if (siteCheck.rows.length === 0) {
                return res.status(403).json({ 
                    error: 'Site not found or does not belong to your organization' 
                });
            }
        }
        
        // Check for duplicate device_code within tenant
        const duplicateCheck = await db.query(`
            SELECT pk_device_id FROM facility_device 
            WHERE tenant_id = $1 AND external_device_id = $2
        `, [tenantId, device_code]);
        
        if (duplicateCheck.rows.length > 0) {
            return res.status(409).json({ 
                error: 'A device with this code already exists in your organization' 
            });
        }
        
        const result = await db.query(`
            INSERT INTO facility_device (
                tenant_id,          -- ✅ FIXED: Dynamic from auth token
                site_id,
                name,
                external_device_id,
                ip_address,
                rtsp_url,
                mac_address,
                status,
                created_at,
                updated_at
            ) VALUES (
                $1,                 -- ✅ FIXED: req.auth.scope.tenantId
                $2, $3, $4, $5, $6, $7, 
                'inactive',         -- Default status
                NOW(), 
                NOW()
            )
            RETURNING 
                pk_device_id,
                tenant_id,
                site_id,
                name,
                external_device_id,
                ip_address,
                status,
                created_at
        `, [
            tenantId,           // ✅ FIXED
            site_id,
            name,
            device_code,
            ip_address,
            rtsp_url,
            mac_address
        ]);
        
        // Log the creation in audit log
        await writeAudit({
            action: 'camera.create',
            entity_type: 'device',
            entity_id: result.rows[0].pk_device_id,
            entity_name: name,
            after_data: result.rows[0],
            source: 'ui'
        }, req);
        
        res.status(201).json({
            success: true,
            device: result.rows[0]
        });
        
    } catch (error) {
        console.error('Camera creation error:', error);
        
        if (error.code === '23505') { // Unique constraint violation
            return res.status(409).json({ 
                error: 'Device with this code or name already exists' 
            });
        }
        
        res.status(500).json({ error: 'Failed to create camera' });
    }
});

/**
 * ADDITIONAL FIXES IN THE SAME FILE:
 * 
 * 1. Fix any other INSERT statements with hardcoded tenant_id
 * 2. Fix UPDATE statements that might bypass tenant scope
 * 3. Add tenant validation to all read operations
 */

// EXAMPLE: Fix camera update endpoint
router.put('/cameras/:id', requirePermission('devices.write'), async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.auth?.scope?.tenantId;
        const { name, ip_address, rtsp_url, status } = req.body;
        
        // ✅ Verify device belongs to user's tenant before updating
        const deviceCheck = await db.query(`
            SELECT pk_device_id, name FROM facility_device 
            WHERE pk_device_id = $1 AND tenant_id = $2
        `, [id, tenantId]);
        
        if (deviceCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Device not found or access denied' 
            });
        }
        
        const beforeData = deviceCheck.rows[0];
        
        const result = await db.query(`
            UPDATE facility_device 
            SET 
                name = COALESCE($1, name),
                ip_address = COALESCE($2, ip_address),
                rtsp_url = COALESCE($3, rtsp_url),
                status = COALESCE($4, status),
                updated_at = NOW()
            WHERE pk_device_id = $5 AND tenant_id = $6  -- ✅ Tenant check in WHERE
            RETURNING *
        `, [name, ip_address, rtsp_url, status, id, tenantId]);
        
        await writeAudit({
            action: 'camera.update',
            entity_type: 'device',
            entity_id: id,
            entity_name: name || beforeData.name,
            before_data: beforeData,
            after_data: result.rows[0],
            source: 'ui'
        }, req);
        
        res.json(result.rows[0]);
        
    } catch (error) {
        console.error('Camera update error:', error);
        res.status(500).json({ error: 'Failed to update camera' });
    }
});

/**
 * TESTING:
 * 
 * 1. Create camera as Tenant 1 admin:
 *    POST /api/cameras
 *    Headers: Authorization: Bearer <tenant1_token>
 *    Body: { "name": "Entrance Cam", "device_code": "CAM001", ... }
 *    → Verify: SELECT tenant_id FROM facility_device WHERE external_device_id='CAM001'
 *    → Should return tenant_id = 1 (from token)
 * 
 * 2. Create camera as Tenant 2 admin:
 *    POST /api/cameras
 *    Headers: Authorization: Bearer <tenant2_token>
 *    Body: { "name": "Lobby Cam", "device_code": "CAM002", ... }
 *    → Verify: SELECT tenant_id FROM facility_device WHERE external_device_id='CAM002'
 *    → Should return tenant_id = 2 (from token)
 * 
 * 3. Tenant 1 tries to update Tenant 2's camera:
 *    PUT /api/cameras/CAM002
 *    Headers: Authorization: Bearer <tenant1_token>
 *    → Should return 404: "Device not found or access denied"
 * 
 * 4. Verify in database:
 *    SELECT tenant_id, name, external_device_id FROM facility_device ORDER BY created_at DESC;
 *    → Each device should have correct tenant_id matching its creator
 */

/**
 * MIGRATE EXISTING DATA (If you already have cameras with tenant_id=1):
 */

/*
-- Find the correct tenant for each site
UPDATE facility_device d
SET tenant_id = s.tenant_id
FROM frs_site s
WHERE d.site_id = s.pk_site_id
  AND d.tenant_id = 1  -- Only fix the hardcoded ones
  AND s.tenant_id != 1; -- Where site has different tenant

-- Verify the fix
SELECT 
    d.pk_device_id,
    d.name,
    d.tenant_id as device_tenant,
    s.tenant_id as site_tenant,
    CASE 
        WHEN d.tenant_id = s.tenant_id THEN '✅ OK'
        ELSE '❌ MISMATCH'
    END as status
FROM facility_device d
LEFT JOIN frs_site s ON d.site_id = s.pk_site_id;
*/
