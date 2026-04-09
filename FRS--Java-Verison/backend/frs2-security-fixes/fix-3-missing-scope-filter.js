/**
 * FIX #3: Missing Scope Filter on Site List Endpoint
 * 
 * SEVERITY: CRITICAL
 * FILE: backend/src/routes/siteRoutes.js
 * VULNERABILITY: Users can see all sites across all tenants/customers
 * 
 * PROBLEM:
 *   SELECT * FROM frs_site ORDER BY site_name
 *   → No WHERE clause at all
 *   → Site admin from Customer A sees all sites from Customer B, C, D...
 *   → Breaks organizational boundaries
 * 
 * FIX: Apply buildScopeWhere() to enforce hierarchical access
 * IMPACT: +3 points to security score
 */

const { buildScopeWhere } = require('../middleware/scopeSql');

// ===========================================================================
// BEFORE (VULNERABLE):
// ===========================================================================

router.get('/', requirePermission('sites.read'), async (req, res) => {
    try {
        // ❌ NO SCOPE FILTERING - Returns ALL sites to ALL users
        const result = await db.query(`
            SELECT 
                pk_site_id,
                site_name,
                customer_id,
                status,
                address,
                city,
                state
            FROM frs_site 
            ORDER BY site_name
        `);
        
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================================================================
// AFTER (SECURED):
// ===========================================================================

router.get('/', requirePermission('sites.read'), async (req, res) => {
    try {
        // ✅ SECURITY FIX: Extract scope from authenticated user
        const scope = req.auth?.scope || {};
        
        // ✅ SECURITY FIX: Build WHERE clause based on user's hierarchical scope
        // This handles: tenantId, customerId, siteId, unitId with proper NULL checks
        const { sql: scopeWhereSql, params: scopeParams } = buildScopeWhere(scope, 's');
        
        // Additional filters from query parameters
        const additionalFilters = [];
        let nextParamIndex = scopeParams.length + 1;
        
        // Filter by status if provided
        if (req.query.status && ['active', 'inactive', 'deleted'].includes(req.query.status)) {
            additionalFilters.push(`s.status = $${nextParamIndex}`);
            scopeParams.push(req.query.status);
            nextParamIndex++;
        }
        
        // Filter by customer if provided (and within scope)
        if (req.query.customer_id) {
            additionalFilters.push(`s.customer_id = $${nextParamIndex}`);
            scopeParams.push(parseInt(req.query.customer_id));
            nextParamIndex++;
        }
        
        // Search by site name
        if (req.query.search) {
            additionalFilters.push(`s.site_name ILIKE $${nextParamIndex}`);
            scopeParams.push(`%${req.query.search}%`);
            nextParamIndex++;
        }
        
        // Combine scope filter with additional filters
        const whereClause = scopeWhereSql + 
            (additionalFilters.length > 0 ? ` AND ${additionalFilters.join(' AND ')}` : '');
        
        // Pagination
        const limit = Math.min(parseInt(req.query.limit) || 50, 500);
        const offset = parseInt(req.query.offset) || 0;
        
        // ✅ Main query with scope filtering
        const query = `
            SELECT 
                s.pk_site_id,
                s.site_name,
                s.customer_id,
                s.tenant_id,
                s.status,
                s.address,
                s.city,
                s.state,
                s.country,
                s.postal_code,
                s.timezone,
                s.latitude,
                s.longitude,
                s.created_at,
                s.updated_at,
                c.customer_name,
                c.status as customer_status,
                COUNT(DISTINCT d.pk_device_id) FILTER (WHERE d.status = 'active') as active_device_count,
                COUNT(DISTINCT d.pk_device_id) FILTER (WHERE d.status != 'deleted') as total_device_count,
                COUNT(DISTINCT e.pk_employee_id) FILTER (WHERE e.status = 'active') as employee_count
            FROM frs_site s
            LEFT JOIN customers c ON s.customer_id = c.pk_customer_id
            LEFT JOIN facility_device d ON d.site_id = s.pk_site_id
            LEFT JOIN hr_employee e ON e.site_id = s.pk_site_id
            WHERE ${whereClause}  -- ✅ SCOPE FILTER APPLIED
            GROUP BY 
                s.pk_site_id, 
                s.site_name,
                s.customer_id,
                s.tenant_id,
                s.status,
                s.address,
                s.city,
                s.state,
                s.country,
                s.postal_code,
                s.timezone,
                s.latitude,
                s.longitude,
                s.created_at,
                s.updated_at,
                c.customer_name,
                c.status
            ORDER BY s.site_name ASC
            LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}
        `;
        
        scopeParams.push(limit, offset);
        
        const result = await db.query(query, scopeParams);
        
        // Get total count (for pagination)
        const countQuery = `
            SELECT COUNT(DISTINCT s.pk_site_id) as total
            FROM frs_site s
            LEFT JOIN customers c ON s.customer_id = c.pk_customer_id
            WHERE ${whereClause}
        `;
        
        const countResult = await db.query(countQuery, scopeParams.slice(0, -2)); // Remove limit/offset
        
        res.json({
            sites: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].total),
                limit,
                offset,
                hasMore: offset + result.rows.length < countResult.rows[0].total
            },
            scope: {
                tenantId: scope.tenantId,
                customerId: scope.customerId,
                siteId: scope.siteId
            }
        });
        
    } catch (error) {
        console.error('Error fetching sites:', error);
        res.status(500).json({ 
            error: 'Failed to fetch sites',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * ADDITIONAL ENDPOINTS TO FIX IN THE SAME FILE:
 */

// Fix GET /sites/:id - Single site detail
router.get('/:id', requirePermission('sites.read'), async (req, res) => {
    try {
        const { id } = req.params;
        const scope = req.auth?.scope || {};
        
        // ✅ Verify site is within user's scope
        const { sql: scopeWhereSql, params: scopeParams } = buildScopeWhere(scope, 's');
        scopeParams.push(id);
        
        const query = `
            SELECT 
                s.*,
                c.customer_name,
                c.status as customer_status,
                COUNT(DISTINCT d.pk_device_id) FILTER (WHERE d.status = 'active') as active_devices,
                COUNT(DISTINCT e.pk_employee_id) FILTER (WHERE e.status = 'active') as active_employees
            FROM frs_site s
            LEFT JOIN customers c ON s.customer_id = c.pk_customer_id
            LEFT JOIN facility_device d ON d.site_id = s.pk_site_id
            LEFT JOIN hr_employee e ON e.site_id = s.pk_site_id
            WHERE ${scopeWhereSql} AND s.pk_site_id = $${scopeParams.length}
            GROUP BY s.pk_site_id, c.customer_name, c.status
        `;
        
        const result = await db.query(query, scopeParams);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Site not found or access denied' 
            });
        }
        
        res.json(result.rows[0]);
        
    } catch (error) {
        console.error('Error fetching site:', error);
        res.status(500).json({ error: 'Failed to fetch site details' });
    }
});

// Fix POST /sites - Create site
router.post('/', requirePermission('sites.manage'), async (req, res) => {
    try {
        const scope = req.auth?.scope || {};
        const { 
            site_name, 
            customer_id, 
            address, 
            city, 
            state, 
            country, 
            postal_code,
            timezone,
            latitude,
            longitude 
        } = req.body;
        
        // Validate required fields
        if (!site_name || !customer_id) {
            return res.status(400).json({ 
                error: 'Missing required fields: site_name, customer_id' 
            });
        }
        
        // ✅ Verify customer is within user's scope
        const { sql: customerScopeSql, params: customerScopeParams } = buildScopeWhere(scope, 'c');
        customerScopeParams.push(customer_id);
        
        const customerCheck = await db.query(`
            SELECT pk_customer_id, customer_name, tenant_id
            FROM customers c
            WHERE ${customerScopeSql} AND pk_customer_id = $${customerScopeParams.length}
        `, customerScopeParams);
        
        if (customerCheck.rows.length === 0) {
            return res.status(403).json({ 
                error: 'Customer not found or access denied' 
            });
        }
        
        const customer = customerCheck.rows[0];
        
        // Create the site
        const result = await db.query(`
            INSERT INTO frs_site (
                site_name,
                customer_id,
                tenant_id,
                address,
                city,
                state,
                country,
                postal_code,
                timezone,
                latitude,
                longitude,
                status,
                created_at,
                updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', NOW(), NOW()
            )
            RETURNING *
        `, [
            site_name,
            customer_id,
            customer.tenant_id, // ✅ Inherit from parent customer
            address,
            city,
            state,
            country,
            postal_code,
            timezone || 'UTC',
            latitude,
            longitude
        ]);
        
        await writeAudit({
            action: 'site.create',
            entity_type: 'site',
            entity_id: result.rows[0].pk_site_id,
            entity_name: site_name,
            after_data: result.rows[0],
            source: 'ui'
        }, req);
        
        res.status(201).json({
            success: true,
            site: result.rows[0]
        });
        
    } catch (error) {
        console.error('Site creation error:', error);
        
        if (error.code === '23505') { // Unique constraint
            return res.status(409).json({ 
                error: 'A site with this name already exists' 
            });
        }
        
        res.status(500).json({ error: 'Failed to create site' });
    }
});

/**
 * TESTING:
 * 
 * 1. Login as Super Admin (no scope restrictions):
 *    GET /api/sites
 *    → Should return ALL sites across all tenants
 * 
 * 2. Login as Customer Admin (customerId=5):
 *    GET /api/sites
 *    → Should return only sites where customer_id=5
 * 
 * 3. Login as Site Admin (siteId=10):
 *    GET /api/sites
 *    → Should return only the single site where pk_site_id=10
 * 
 * 4. Try to access site outside scope:
 *    Login as Site Admin (siteId=10)
 *    GET /api/sites/999 (different site)
 *    → Should return 404: "Site not found or access denied"
 * 
 * 5. Verify in database:
 *    SELECT 
 *        s.pk_site_id,
 *        s.site_name,
 *        s.customer_id,
 *        c.customer_name,
 *        COUNT(d.pk_device_id) as devices
 *    FROM frs_site s
 *    LEFT JOIN customers c ON s.customer_id = c.pk_customer_id
 *    LEFT JOIN facility_device d ON d.site_id = s.pk_site_id
 *    GROUP BY s.pk_site_id, s.site_name, s.customer_id, c.customer_name
 *    ORDER BY s.site_name;
 */

/**
 * SCOPE FILTERING LOGIC REFERENCE:
 * 
 * buildScopeWhere() from middleware/scopeSql.js returns:
 * 
 * - Super Admin (no scope set):
 *   { sql: '1=1', params: [] }
 *   → Sees everything
 * 
 * - Tenant Admin (tenantId=1):
 *   { sql: 's.tenant_id = $1', params: [1] }
 *   → Sees all sites in tenant 1
 * 
 * - Customer Admin (tenantId=1, customerId=5):
 *   { sql: 's.tenant_id = $1 AND (s.customer_id IS NULL OR s.customer_id = $2)', 
 *     params: [1, 5] }
 *   → Sees only sites under customer 5
 * 
 * - Site Admin (tenantId=1, customerId=5, siteId=10):
 *   { sql: 's.tenant_id = $1 AND (s.customer_id IS NULL OR s.customer_id = $2) AND (s.site_id IS NULL OR s.site_id = $3)', 
 *     params: [1, 5, 10] }
 *   → Sees only site 10
 */
