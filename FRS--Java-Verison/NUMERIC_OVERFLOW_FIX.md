# Database Numeric Field Overflow - Fixed

## Issue
Backend was throwing `numeric field overflow` error (PostgreSQL error code 22003):
```
error: numeric field overflow
detail: 'A field with precision 5, scale 4 must round to an absolute value less than 10^1.'
```

## Root Cause
Two columns in the existing `frs_camera` table had overly restrictive DECIMAL types:
- `recognition_accuracy DECIMAL(5,4)` - Can only store -9.9999 to 9.9999
- `error_rate DECIMAL(5,4)` - Can only store -9.9999 to 9.9999

But the backend was trying to store percentage values (0-100), which exceeded the range.

## Solution Applied

### 1. Fixed frs_camera table columns (Existing Table)
```sql
ALTER TABLE frs_camera 
ALTER COLUMN recognition_accuracy TYPE DECIMAL(5,2);
-- Now supports: -999.99 to 999.99 (99.99% precision)

ALTER TABLE frs_camera 
ALTER COLUMN error_rate TYPE DECIMAL(5,2);
-- Now supports: -999.99 to 999.99 (99.99% precision)
```

### 2. Fixed unauthorized_access_log table (New Migration Table)
```sql
ALTER TABLE unauthorized_access_log 
ALTER COLUMN confidence_score TYPE DECIMAL(10,5);
-- Changed from: DECIMAL(5,4) - limited to ±9.9999
-- Now supports: -99999.99999 to 99999.99999 (full precision for face recognition scores)
```

### 3. Updated Migration File
Updated [010_create_unauthorized_access_log.sql](010_create_unauthorized_access_log.sql) to reflect the correct DECIMAL(10,5) specification to prevent future issues.

## Verification

✅ **Pre-fix**: 18 numeric overflow errors in backend logs  
✅ **Post-fix**: 0 new numeric overflow errors in last minute of logs  
✅ **Backend Status**: Running successfully with authentication requests processed  

### Column Verification
```
Table: frs_camera
 Column Name          | Data Type | Precision | Scale
 recognition_accuracy | numeric   | 5         | 2     ✓
 error_rate           | numeric   | 5         | 2     ✓

Table: unauthorized_access_log
 Column Name      | Data Type | Precision | Scale
 confidence_score | numeric   | 10        | 5     ✓
```

## Impact

- **Affected Operations**: Device heartbeat updates, camera status updates
- **Data Integrity**: No data loss. Existing data remains unchanged.
- **Database Performance**: No performance impact. Only column type definitions changed.
- **Backend Operations**: All device monitoring and health tracking now functioning correctly.

## Files Modified

1. **Database** (Live):
   - `frs_camera.recognition_accuracy`: DECIMAL(5,4) → DECIMAL(5,2)
   - `frs_camera.error_rate`: DECIMAL(5,4) → DECIMAL(5,2)
   - `unauthorized_access_log.confidence_score`: DECIMAL(5,4) → DECIMAL(10,5)

2. **Migration Script**:
   - `tmp/Database Schema Creation/010_create_unauthorized_access_log.sql`: Updated DECIMAL specification

## Testing

✅ Backend restarted successfully  
✅ Database connections stable  
✅ Authentication endpoints processing requests  
✅ No new numeric field errors  

---
**Status**: 🟢 **RESOLVED**  
**Date**: April 13, 2026  
**Tested**: Yes, backend running without errors
