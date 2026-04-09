/**
 * FIX #1: Path Traversal Vulnerability in Photo Proxy
 * 
 * SEVERITY: CRITICAL
 * FILE: backend/src/routes/liveRoutes.js (or jetsonRoutes.js)
 * VULNERABILITY: Allows arbitrary file read from Jetson via path traversal
 * 
 * ATTACK EXAMPLE:
 *   GET /api/jetson/photos/../../../../etc/passwd
 *   → Proxies to http://172.18.3.202:8000/photos/../../../../etc/passwd
 *   → Exposes sensitive files from Jetson device
 * 
 * FIX: Sanitize filename with path.basename() + extension whitelist
 * IMPACT: +3 points to security score
 */

const path = require('path'); // ADD THIS IMPORT AT TOP OF FILE

// REPLACE THE EXISTING PHOTO PROXY ROUTE WITH THIS SECURED VERSION:

router.get('/jetson/photos/:filename', async (req, res) => {
    try {
        // SECURITY FIX: Prevent path traversal attacks
        // path.basename() strips any directory path components
        const filename = path.basename(req.params.filename);
        
        // SECURITY FIX: Whitelist allowed file extensions
        // Only allow image files, prevent access to config/binary files
        if (!/^[\w\-\.]+\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
            return res.status(400).json({ 
                error: 'Invalid filename. Only image files (jpg, png, gif, webp) are allowed.' 
            });
        }
        
        const jetsonUrl = process.env.JETSON_URL || 'http://172.18.3.202:8000';
        const url = `${jetsonUrl}/photos/${filename}`; // Now safe - filename is sanitized
        
        console.log(`[Photo Proxy] Fetching: ${url}`);
        
        const response = await fetch(url, {
            timeout: 5000 // 5 second timeout
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                return res.status(404).json({ error: 'Photo not found on device' });
            }
            return res.status(response.status).json({ 
                error: `Device returned error: ${response.statusText}` 
            });
        }
        
        // Forward the image with proper content type
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        res.setHeader('X-Content-Type-Options', 'nosniff'); // Prevent MIME sniffing
        
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
        
    } catch (error) {
        console.error('[Photo Proxy] Error:', error.message);
        
        if (error.name === 'TimeoutError') {
            return res.status(504).json({ error: 'Device request timeout' });
        }
        
        res.status(500).json({ error: 'Failed to fetch photo from device' });
    }
});

/**
 * TESTING:
 * 
 * 1. Valid image (should work):
 *    curl http://172.20.100.222:8080/api/jetson/photos/face_ML003_1234567890.jpg
 * 
 * 2. Path traversal attempt (should be blocked):
 *    curl http://172.20.100.222:8080/api/jetson/photos/../../etc/passwd
 *    → Returns 400: "Invalid filename"
 * 
 * 3. Non-image file (should be blocked):
 *    curl http://172.20.100.222:8080/api/jetson/photos/config.json
 *    → Returns 400: "Invalid filename. Only image files..."
 * 
 * 4. Verify in browser:
 *    Open: http://172.20.100.222:8080/api/jetson/photos/valid_image.jpg
 *    → Should display image
 */

/**
 * ALTERNATIVE: Rate Limiting (Optional Enhancement)
 * 
 * If photo proxy is being abused, add rate limiting:
 */

// At the top of the file:
// const rateLimit = require('express-rate-limit');

// const photoProxyLimiter = rateLimit({
//     windowMs: 1 * 60 * 1000, // 1 minute
//     max: 20, // 20 requests per minute per IP
//     message: { error: 'Too many photo requests, please try again later' },
//     standardHeaders: true,
//     legacyHeaders: false,
// });

// Then apply to the route:
// router.get('/jetson/photos/:filename', photoProxyLimiter, async (req, res) => {
