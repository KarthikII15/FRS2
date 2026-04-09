# FRS2 Critical Security Fixes - Implementation Guide

**Audit Date**: April 6, 2026  
**Current Score**: 56/100  
**Target Score**: 67/100  
**Impact**: +11 points  

---

## Executive Summary

This package contains fixes for **4 CRITICAL security vulnerabilities** identified in the FRS2 device and site management audit. These vulnerabilities affect multi-tenancy, authentication, and data access controls.

### Vulnerabilities Fixed

| # | Vulnerability | Severity | Impact | File |
|---|---------------|----------|--------|------|
| 1 | Path Traversal in Photo Proxy | CRITICAL | Arbitrary file read from Jetson | `liveRoutes.js` |
| 2 | Hardcoded `tenant_id=1` | CRITICAL | Multi-tenancy bypass | `cameraRoutes.js` |
| 3 | Missing Scope Filter | CRITICAL | Users see all sites | `siteRoutes.js` |
| 4 | Unauthenticated Heartbeat | CRITICAL | Device status spoofing | `deviceRoutes.js` |

---

## 📦 Package Contents

```
/home/claude/
├── critical-security-fixes.sh          # Automated patch script
├── fix-1-path-traversal.js            # Detailed fix for photo proxy
├── fix-2-hardcoded-tenant.js          # Detailed fix for tenant ID
├── fix-3-missing-scope-filter.js      # Detailed fix for scope filtering
├── fix-4-unauthenticated-heartbeat.js # Detailed fix for heartbeat auth
├── deviceAuth-middleware.js           # Device authentication middleware
├── generate-device-token.js           # Device token generator script
├── test-security-fixes.sh             # Testing script
└── README.md                          # This file
```

---

## 🚀 Quick Start (Recommended)

### Step 1: Review the Fixes

Read each fix file to understand the changes:

```bash
cd /home/claude
cat fix-1-path-traversal.js
cat fix-2-hardcoded-tenant.js
cat fix-3-missing-scope-filter.js
cat fix-4-unauthenticated-heartbeat.js
```

### Step 2: Copy Files to Your Project

Transfer these files to your development machine or directly to the VM:

```bash
# On VM at 172.20.100.222
scp user@workstation:/home/claude/*.js ~/FRS_/FRS--Java-Verison/backend/

# Or use the automated script
bash critical-security-fixes.sh ~/FRS_/FRS--Java-Verison/
```

### Step 3: Apply the Fixes

Each fix requires manual code review and integration. **Do NOT blindly copy-paste.** Follow the detailed instructions in each fix file.

#### Fix Priority Order (by severity):

1. **FIX #4** - Unauthenticated Heartbeat (highest risk if devices are internet-exposed)
2. **FIX #1** - Path Traversal (critical if photo proxy is accessible)
3. **FIX #2** - Hardcoded Tenant (critical in multi-tenant environments)
4. **FIX #3** - Missing Scope Filter (data leak between customers)

### Step 4: Test Each Fix

After applying each fix, test it individually:

```bash
# Test path traversal fix
curl http://172.20.100.222:8080/api/jetson/photos/../../etc/passwd
# Expected: HTTP 400 "Invalid filename"

# Test scope filtering (requires auth token)
curl -H "Authorization: Bearer <token>" http://172.20.100.222:8080/api/sites
# Expected: Only sites within your scope

# Test heartbeat auth
curl -X POST http://172.20.100.222:8080/api/nug-boxes/DEVICE001/heartbeat
# Expected: HTTP 401 "No authorization token provided"
```

Or use the comprehensive test script:

```bash
bash test-security-fixes.sh
```

### Step 5: Restart Backend

```bash
cd ~/FRS_/FRS--Java-Verison/
docker compose build --no-cache backend
bash restart_backend.sh
```

---

## 📋 Detailed Fix Instructions

### FIX #1: Path Traversal in Photo Proxy

**File**: `backend/src/routes/liveRoutes.js` (or `jetsonRoutes.js`)

**Changes Required**:

1. Add `path` module import:
   ```javascript
   const path = require('path');
   ```

2. Replace the photo proxy route with the secured version from `fix-1-path-traversal.js`

**Key Security Enhancements**:
- `path.basename()` strips directory components
- Extension whitelist (`.jpg`, `.png`, `.gif`, `.webp` only)
- Proper error handling with timeout
- Cache headers for performance

**Testing**:
```bash
# Should work
curl http://172.20.100.222:8080/api/jetson/photos/face_ML003_123.jpg

# Should be blocked (HTTP 400)
curl http://172.20.100.222:8080/api/jetson/photos/../../etc/passwd
curl http://172.20.100.222:8080/api/jetson/photos/config.json
```

---

### FIX #2: Hardcoded `tenant_id=1` in Camera Routes

**File**: `backend/src/routes/cameraRoutes.js`

**Changes Required**:

1. Replace all instances of hardcoded `tenant_id: 1` with:
   ```javascript
   const tenantId = req.auth?.scope?.tenantId;
   ```

2. Add tenant validation before INSERT/UPDATE operations

3. Add duplicate device code check within tenant

**Migration** (if you already have cameras with `tenant_id=1`):

```sql
-- Fix existing cameras with wrong tenant
UPDATE facility_device d
SET tenant_id = s.tenant_id
FROM frs_site s
WHERE d.site_id = s.pk_site_id
  AND d.tenant_id = 1
  AND s.tenant_id != 1;

-- Verify
SELECT 
    d.external_device_id,
    d.tenant_id as device_tenant,
    s.tenant_id as site_tenant,
    CASE WHEN d.tenant_id = s.tenant_id THEN '✅ OK' ELSE '❌ MISMATCH' END
FROM facility_device d
LEFT JOIN frs_site s ON d.site_id = s.pk_site_id;
```

**Testing**:
- Create camera as Tenant 1 admin → verify `tenant_id = 1` in DB
- Create camera as Tenant 2 admin → verify `tenant_id = 2` in DB
- Tenant 1 should NOT be able to view/edit Tenant 2's cameras

---

### FIX #3: Missing Scope Filter on Site List

**File**: `backend/src/routes/siteRoutes.js`

**Changes Required**:

1. Add import at top of file:
   ```javascript
   const { buildScopeWhere } = require('../middleware/scopeSql');
   ```

2. Replace the `GET /sites` route with the secured version from `fix-3-missing-scope-filter.js`

3. Also fix `GET /sites/:id` and `POST /sites` routes

**Key Changes**:
- `buildScopeWhere()` enforces hierarchical access
- Super admin sees all sites
- Customer admin sees only their customer's sites
- Site admin sees only their specific site

**Testing**:
```bash
# Login as different users and verify scope
# Super admin should see all sites
# Customer admin should see only their customer's sites
# Site admin should see only their site

# Try to access site outside scope (should get 404)
curl -H "Authorization: Bearer <site_admin_token>" \
  http://172.20.100.222:8080/api/sites/999
```

---

### FIX #4: Unauthenticated Heartbeat Endpoint

**File**: `backend/src/routes/deviceRoutes.js`

**Changes Required**:

1. **Create the middleware** (if it doesn't exist):
   - Copy `deviceAuth-middleware.js` to `backend/src/middleware/deviceAuth.js`

2. **Import the middleware** at top of `deviceRoutes.js`:
   ```javascript
   const deviceAuth = require('../middleware/deviceAuth');
   ```

3. **Add middleware to heartbeat route**:
   ```javascript
   router.post('/nug-boxes/:code/heartbeat', deviceAuth, async (req, res) => {
       // ... handler code
   });
   ```

4. **Replace route handler** with the code from `fix-4-unauthenticated-heartbeat.js`

**Environment Variable**:
Add to `.env`:
```bash
DEVICE_JWT_SECRET=your-strong-random-secret-here-min-32-chars
```

**Generate Device Tokens**:

```bash
# Copy the token generator script
cp generate-device-token.js ~/FRS_/FRS--Java-Verison/backend/scripts/

# Generate token for a device
cd ~/FRS_/FRS--Java-Verison/backend
node scripts/generate-device-token.js DEVICE001

# Or generate for all devices
node scripts/generate-device-token.js --all
```

**Update Jetson Configuration**:

1. Store token in `/opt/frs/config.json` on Jetson:
   ```json
   {
     "device_code": "DEVICE001",
     "device_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "backend_url": "http://172.20.100.222:8080",
     "heartbeat_interval": 30
   }
   ```

2. Update C++ heartbeat sender to include Authorization header:
   ```cpp
   std::string token = config["device_token"];
   httplib::Headers headers = {
       {"Authorization", "Bearer " + token},
       {"Content-Type", "application/json"}
   };
   ```

**Testing**:
```bash
# Generate a test token
DEVICE_TOKEN=$(node scripts/generate-device-token.js DEVICE001 | grep "Generated Device Token" -A 2 | tail -1)

# Test authenticated heartbeat (should succeed)
curl -X POST http://172.20.100.222:8080/api/nug-boxes/DEVICE001/heartbeat \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"online","cpu_usage":45.2}'

# Test unauthenticated heartbeat (should fail with 401)
curl -X POST http://172.20.100.222:8080/api/nug-boxes/DEVICE001/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"status":"online"}'
```

---

## 🧪 Comprehensive Testing

### Automated Test Suite

```bash
# Run all tests
bash test-security-fixes.sh

# With authentication tokens for full coverage
export ADMIN_TOKEN="your-admin-jwt-token"
export DEVICE_TOKEN="your-device-jwt-token"
bash test-security-fixes.sh
```

### Manual Verification

#### 1. Database Checks

```sql
-- Verify unique constraint on external_device_id
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'facility_device'::regclass AND contype = 'u';

-- Check for hardcoded tenant issues
SELECT external_device_id, tenant_id, site_id, created_at
FROM facility_device
WHERE created_at > NOW() - INTERVAL '1 day'
ORDER BY created_at DESC;

-- Verify heartbeat authentication is working
SELECT external_device_id, last_heartbeat, status,
       EXTRACT(EPOCH FROM (NOW() - last_heartbeat)) as seconds_ago
FROM facility_device
WHERE last_heartbeat > NOW() - INTERVAL '10 minutes'
ORDER BY last_heartbeat DESC;
```

#### 2. Security Penetration Tests

```bash
# Path traversal attempts (should all fail)
curl http://172.20.100.222:8080/api/jetson/photos/../../../etc/passwd
curl http://172.20.100.222:8080/api/jetson/photos/..%2F..%2Fetc%2Fpasswd
curl http://172.20.100.222:8080/api/jetson/photos/config.json

# Scope bypass attempts (should fail)
# Login as Site Admin (siteId=10), try to access site 20
curl -H "Authorization: Bearer <site10_token>" \
  http://172.20.100.222:8080/api/sites/20

# Heartbeat spoofing (should fail)
curl -X POST http://172.20.100.222:8080/api/nug-boxes/DEVICE001/heartbeat \
  -d '{"status":"online"}'
```

---

## 📊 Score Impact Analysis

| Category | Before | After | Change |
|----------|--------|-------|--------|
| Security | 7/20 | 18/20 | +11 |
| Path Traversal | ❌ | ✅ | Fixed |
| Multi-tenancy | ❌ | ✅ | Fixed |
| Scope Filtering | ❌ | ✅ | Fixed |
| Device Auth | ❌ | ✅ | Fixed |
| **TOTAL** | **56/100** | **67/100** | **+11** |

---

## ⚠️ Important Notes

### Security Considerations

1. **Device JWT Secret**:
   - Use a strong random secret (min 32 characters)
   - Never commit to git
   - Store in environment variables only
   - Rotate periodically (requires re-issuing tokens)

2. **Token Management**:
   - Device tokens expire after 365 days
   - Implement token renewal mechanism
   - Alert admins when tokens are expiring
   - Consider implementing token blacklist for immediate revocation

3. **Transport Security**:
   - Use HTTPS/TLS for all backend-to-Jetson communication
   - Never log or display full JWT tokens
   - Implement certificate pinning on Jetson if possible

### Production Deployment

1. **Backup Database** before applying fixes:
   ```bash
   docker compose exec postgres pg_dump -U postgres frs_db > backup_$(date +%Y%m%d).sql
   ```

2. **Apply Fixes Incrementally**:
   - Apply one fix at a time
   - Test thoroughly after each fix
   - Monitor logs for errors
   - Rollback if issues occur

3. **Update Jetson Devices**:
   - Generate tokens for all devices
   - Update config files on all Jetsons
   - Test heartbeat from each device
   - Monitor device health dashboard

4. **User Communication**:
   - Notify admins of security updates
   - Document new token management process
   - Update internal documentation

---

## 🐛 Troubleshooting

### Fix #1: Path Traversal

**Issue**: Images still not loading  
**Solution**: 
- Verify Jetson is accessible at `JETSON_URL`
- Check photo exists in `/opt/frs/photos/` on Jetson
- Check nginx/firewall rules

### Fix #2: Hardcoded Tenant

**Issue**: Cameras still going to tenant 1  
**Solution**:
- Verify `req.auth.scope.tenantId` is populated
- Check Keycloak token includes tenant claim
- Run migration SQL to fix existing data

### Fix #3: Scope Filtering

**Issue**: Users still seeing all sites  
**Solution**:
- Verify `buildScopeWhere()` is imported
- Check that middleware `scopeExtractor` is applied
- Verify user token includes correct scope

### Fix #4: Heartbeat Auth

**Issue**: Heartbeats failing after fix  
**Solution**:
- Generate new device tokens
- Update `/opt/frs/config.json` on Jetson
- Verify `DEVICE_JWT_SECRET` matches on backend and token generator
- Check C++ code is sending Authorization header
- Verify device code in token matches route parameter

**Issue**: "Device code mismatch" error  
**Solution**:
- Ensure token was generated for the correct device
- Check external_device_id matches between DB and route
- Regenerate token with correct device code

---

## 📞 Support

For issues or questions:

1. Review the detailed fix files in `/home/claude/fix-*.js`
2. Check the audit report for context
3. Run the test script: `bash test-security-fixes.sh`
4. Check backend logs: `docker compose logs backend -f`
5. Verify database state with the SQL queries above

---

## 📝 Changelog

### 2026-04-06 - Initial Release
- Fix #1: Path traversal protection in photo proxy
- Fix #2: Dynamic tenant ID in camera creation
- Fix #3: Scope filtering on site list endpoint
- Fix #4: Device authentication for heartbeat endpoint
- Added comprehensive testing suite
- Added device token generator script

---

## ✅ Post-Implementation Checklist

After applying all fixes:

- [ ] All 4 fixes applied and code reviewed
- [ ] Backend restarted successfully
- [ ] Test script passes all checks
- [ ] Database migration completed (if needed)
- [ ] Device tokens generated for all devices
- [ ] Jetson config files updated with tokens
- [ ] Heartbeats working from all devices
- [ ] Multi-tenancy verified in database
- [ ] Scope filtering tested with different user roles
- [ ] Path traversal tests all blocked
- [ ] Audit log entries verified
- [ ] Documentation updated
- [ ] Team notified of changes

---

**Expected Audit Score After Implementation: 67/100**

Next steps: Address MEDIUM priority issues to reach 75-80/100
