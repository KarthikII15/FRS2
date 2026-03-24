import express from 'express';
import { requireAuth } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import http from 'http';

const router = express.Router();
const JETSON_URL = process.env.JETSON_SIDECAR_URL || 'http://172.18.3.202:5000';

// GET /api/attendance/photos/:filename — proxy photo from Jetson
router.get('/photos/:filename', asyncHandler(async (req, res) => {
  const url = `${JETSON_URL}/photos/${req.params.filename}`;
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!upstream.ok) return res.status(404).json({ error: 'Photo not found' });
    const buf = await upstream.arrayBuffer();
    res.set('Content-Type', 'image/jpeg');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(Buffer.from(buf));
  } catch {
    return res.status(503).json({ error: 'Jetson unreachable' });
  }
}));

router.use(requireAuth);

// BULLETPROOF ENROLL ROUTE USING NATIVE HTTP (Bypasses 'fetch' chunking issues)
router.post('/enroll', asyncHandler(async (req, res) => {
  let payloadObj = { employee_id: "unknown", cam_id: "entrance-cam-01" };
  
  if (req.body && Object.keys(req.body).length > 0) {
    payloadObj.employee_id = req.body.employee_id || req.body.employeeId || req.body.id || "unknown";
    payloadObj.cam_id = req.body.cam_id || req.body.camId || "entrance-cam-01";
  }

  const finalPayload = JSON.stringify(payloadObj);
  console.log(`[Enroll Proxy] Native HTTP Payload: ${finalPayload}`);

  const targetUrl = new URL(`${JETSON_URL}/enroll`);
  
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || 80,
    path: targetUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(finalPayload)
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    let rawData = '';
    proxyRes.on('data', (chunk) => { rawData += chunk; });
    proxyRes.on('end', () => {
      console.log(`[Enroll Proxy] Jetson Reply: ${rawData}`);
      try {
        return res.status(proxyRes.statusCode).json(JSON.parse(rawData));
      } catch (e) {
        return res.status(502).json({ error: 'Jetson returned invalid JSON', raw: rawData.slice(0, 100) });
      }
    });
  });

  proxyReq.on('error', (err) => {
    console.error('[Enroll Proxy Error]', err.message);
    if (!res.headersSent) return res.status(503).json({ error: 'Jetson unreachable', details: err.message });
  });

  // Write the exact bytes directly to the socket, bypassing chunked encoding
  proxyReq.write(finalPayload);
  proxyReq.end();
}));

// Fallback Proxy for anything else
router.all('/*', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const path = req.path;
  const url  = JETSON_URL + path;
  const opts = {
    method: req.method,
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(35000),
  };
  if (req.headers['content-type']) opts.headers['Content-Type'] = req.headers['content-type'];
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    opts.body = req.headers['content-type']?.includes('multipart/form-data') ? (req.rawBody || req.body) : JSON.stringify(req.body || {});
  }
  try {
    const upstream = await fetch(url, opts);
    const text = await upstream.text();
    if (!text || !text.trim()) return res.status(502).json({ error: 'Jetson returned empty response' });
    try { return res.status(upstream.status).json(JSON.parse(text)); } 
    catch { return res.status(502).json({ error: 'Invalid JSON', raw: text.slice(0, 100) }); }
  } catch (e) {
    return res.status(503).json({ error: 'Jetson sidecar unreachable' });
  }
}));

export { router as jetsonRoutes };
