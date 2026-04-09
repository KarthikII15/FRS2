#!/usr/bin/env node
/**
 * Generate Device JWT Token - Standalone Script
 * 
 * FILE: backend/scripts/generate-device-token.js
 * PURPOSE: Generate JWT tokens for Jetson devices
 * 
 * USAGE:
 *   node scripts/generate-device-token.js DEVICE001
 *   node scripts/generate-device-token.js --device-id 42
 *   node scripts/generate-device-token.js --all  # Generate for all active devices
 */

const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

// Device JWT Secret (same as in deviceAuth.js)
const DEVICE_JWT_SECRET = process.env.DEVICE_JWT_SECRET || 'CHANGE_THIS_IN_PRODUCTION_DEVICE_SECRET_2026';

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'frs_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

/**
 * Generate Device JWT Token
 */
function generateDeviceToken(device, expiresIn = '365d') {
    const payload = {
        device_id: device.pk_device_id,
        external_device_id: device.external_device_id,
        tenant_id: device.tenant_id,
        type: 'device',
        issued_at: new Date().toISOString()
    };
    
    const options = {
        algorithm: 'HS256'
    };
    
    if (expiresIn && expiresIn !== 'never') {
        options.expiresIn = expiresIn;
    }
    
    return jwt.sign(payload, DEVICE_JWT_SECRET, options);
}

/**
 * Decode and display token info
 */
function decodeToken(token) {
    try {
        const decoded = jwt.verify(token, DEVICE_JWT_SECRET);
        console.log('\n✅ Token Decoded:');
        console.log(JSON.stringify(decoded, null, 2));
        
        if (decoded.exp) {
            const expiresAt = new Date(decoded.exp * 1000);
            const daysUntilExpiry = Math.floor((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
            console.log(`\nExpires: ${expiresAt.toISOString()} (in ${daysUntilExpiry} days)`);
        } else {
            console.log('\nExpires: Never (no expiration set)');
        }
        
        return decoded;
    } catch (error) {
        console.error('\n❌ Token verification failed:', error.message);
        return null;
    }
}

/**
 * Generate token for a specific device
 */
async function generateForDevice(externalDeviceId) {
    try {
        const result = await pool.query(`
            SELECT 
                pk_device_id,
                external_device_id,
                device_name,
                tenant_id,
                site_id,
                status
            FROM facility_device
            WHERE external_device_id = $1
        `, [externalDeviceId]);
        
        if (result.rows.length === 0) {
            console.error(`❌ Device not found: ${externalDeviceId}`);
            return null;
        }
        
        const device = result.rows[0];
        
        console.log('\n📱 Device Information:');
        console.log(`   ID: ${device.pk_device_id}`);
        console.log(`   Code: ${device.external_device_id}`);
        console.log(`   Name: ${device.device_name}`);
        console.log(`   Tenant: ${device.tenant_id}`);
        console.log(`   Site: ${device.site_id || 'None'}`);
        console.log(`   Status: ${device.status}`);
        
        const token = generateDeviceToken(device, '365d');
        
        console.log('\n🔑 Generated Device Token:');
        console.log('─'.repeat(80));
        console.log(token);
        console.log('─'.repeat(80));
        
        decodeToken(token);
        
        console.log('\n📋 Configuration for Jetson (/opt/frs/config.json):');
        console.log(JSON.stringify({
            device_code: device.external_device_id,
            device_token: token,
            backend_url: process.env.BACKEND_URL || 'http://172.20.100.222:8080',
            heartbeat_interval: 30
        }, null, 2));
        
        console.log('\n🧪 Test Heartbeat Command:');
        console.log(`curl -X POST http://172.20.100.222:8080/api/nug-boxes/${device.external_device_id}/heartbeat \\`);
        console.log(`  -H "Authorization: Bearer ${token}" \\`);
        console.log(`  -H "Content-Type: application/json" \\`);
        console.log(`  -d '{"status":"online","cpu_usage":45.2,"memory_usage":62.8}'`);
        
        return token;
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        return null;
    }
}

/**
 * Generate token by database ID
 */
async function generateById(deviceId) {
    try {
        const result = await pool.query(`
            SELECT 
                pk_device_id,
                external_device_id,
                device_name,
                tenant_id,
                site_id,
                status
            FROM facility_device
            WHERE pk_device_id = $1
        `, [deviceId]);
        
        if (result.rows.length === 0) {
            console.error(`❌ Device not found with ID: ${deviceId}`);
            return null;
        }
        
        const device = result.rows[0];
        return generateForDevice(device.external_device_id);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        return null;
    }
}

/**
 * Generate tokens for all active devices
 */
async function generateForAll() {
    try {
        const result = await pool.query(`
            SELECT 
                pk_device_id,
                external_device_id,
                device_name,
                tenant_id,
                status
            FROM facility_device
            WHERE status IN ('active', 'inactive')
            ORDER BY external_device_id
        `);
        
        console.log(`\n📱 Found ${result.rows.length} devices\n`);
        
        const tokens = [];
        
        for (const device of result.rows) {
            const token = generateDeviceToken(device, '365d');
            
            tokens.push({
                external_device_id: device.external_device_id,
                device_name: device.device_name,
                tenant_id: device.tenant_id,
                status: device.status,
                token: token
            });
            
            console.log(`✅ ${device.external_device_id.padEnd(20)} | ${device.device_name}`);
        }
        
        // Save to JSON file
        const fs = require('fs');
        const outputFile = './device-tokens.json';
        fs.writeFileSync(outputFile, JSON.stringify(tokens, null, 2));
        
        console.log(`\n💾 Saved ${tokens.length} tokens to ${outputFile}`);
        
        return tokens;
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        return null;
    }
}

/**
 * Store token in database (optional - for token tracking)
 */
async function storeTokenInDatabase(deviceId, token) {
    try {
        // Add a new column to facility_device if needed:
        // ALTER TABLE facility_device ADD COLUMN current_token TEXT;
        // ALTER TABLE facility_device ADD COLUMN token_issued_at TIMESTAMP;
        
        await pool.query(`
            UPDATE facility_device 
            SET 
                current_token = $1,
                token_issued_at = NOW(),
                updated_at = NOW()
            WHERE pk_device_id = $2
        `, [token, deviceId]);
        
        console.log('✅ Token stored in database');
        
    } catch (error) {
        if (error.message.includes('column "current_token" does not exist')) {
            console.log('⚠️  Token storage skipped (current_token column not in schema)');
        } else {
            console.error('❌ Error storing token:', error.message);
        }
    }
}

/**
 * Main CLI interface
 */
async function main() {
    const args = process.argv.slice(2);
    
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║         FRS2 Device JWT Token Generator                  ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    
    if (args.length === 0 || args.includes('--help')) {
        console.log('\nUSAGE:');
        console.log('  node generate-device-token.js DEVICE001');
        console.log('  node generate-device-token.js --device-id 42');
        console.log('  node generate-device-token.js --all');
        console.log('  node generate-device-token.js --verify <token>');
        console.log('\nOPTIONS:');
        console.log('  --device-id <id>    Generate token by database ID');
        console.log('  --all               Generate tokens for all active devices');
        console.log('  --verify <token>    Verify and decode an existing token');
        console.log('  --help              Show this help message');
        pool.end();
        return;
    }
    
    if (args.includes('--verify')) {
        const tokenIndex = args.indexOf('--verify') + 1;
        const token = args[tokenIndex];
        if (!token) {
            console.error('❌ Please provide a token to verify');
        } else {
            decodeToken(token);
        }
    } else if (args.includes('--all')) {
        await generateForAll();
    } else if (args.includes('--device-id')) {
        const idIndex = args.indexOf('--device-id') + 1;
        const deviceId = args[idIndex];
        if (!deviceId) {
            console.error('❌ Please provide a device ID');
        } else {
            await generateById(parseInt(deviceId));
        }
    } else {
        // Assume first argument is external_device_id
        const externalDeviceId = args[0];
        await generateForDevice(externalDeviceId);
    }
    
    pool.end();
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        pool.end();
        process.exit(1);
    });
}

module.exports = {
    generateDeviceToken,
    decodeToken,
    generateForDevice,
    generateForAll
};
