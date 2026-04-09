import express from 'express';
import { requireAuth } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import authenticateDevice from '../middleware/authenticateDevice.js';
import http from 'http';
import path from 'path';
import { pool } from '../db/pool.js';

const router = express.Router();
const JETSON_URL = process.env.JETSON_SIDECAR_URL || 'http://172.18.3.202:5000';

// GET /api/attendance/photos/:filename — proxy photo from Jetson
router.get('/photos/:filename', asyncHandler(async (req, res) => {
  // SECURITY FIX: Prevent path traversal
  const filename = path.basename(req.params.filename);

  // SECURITY FIX: Whitelist allowed extensions
  if (!/[\w\-\.]+\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
    return res.status(400).json({
      error: 'Invalid filename. Only image files are allowed.'
    });
  }

  const url = `${JETSON_URL}/photos/${filename}`;
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

// Camera heartbeat from Jetson — device JWT auth, NOT Keycloak
// Use router.all so it matches any HTTP method the Jetson sends (POST, PUT, etc.)
router.all('/:camId/heartbeat', authenticateDevice, asyncHandler(async (req, res) => {
  const { camId } = req.params;
  const { status = 'online' } = req.body || {};
  await pool.query(
    `UPDATE frs_camera SET status=$2, last_active=NOW() WHERE cam_id=$1`,
    [camId, status]
  );
  await pool.query(
    `UPDATE facility_device SET status=$2, last_active=NOW() WHERE external_device_id=$1`,
    [camId, status]
  );
  return res.json({ success: true });
}));

// Skip Keycloak auth for device heartbeat paths (belt-and-suspenders with the route above)
router.use((req, res, next) => {
  if (/^\/[^/]+\/heartbeat\/?$/.test(req.path) || req.path === '/enroll-angle') return next();
  return requireAuth(req, res, next);
});

// POST /api/jetson/enroll-angle — enroll one angle from Jetson camera + return captured frame
// Calls /enroll on Jetson, then tries /last-frame or /snapshot to get the captured JPEG back
router.post('/enroll-angle', asyncHandler(async (req, res) => {
  const { employee_id, cam_id = 'entrance-cam-01', angle = 'front' } = req.body || {};
  if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });

  const finalPayload = JSON.stringify({ employee_id: String(employee_id), cam_id, angle });
  const targetUrl = new URL(`${JETSON_URL}/enroll`);

  // 1. Enroll via Jetson (native HTTP to avoid chunking issues)
  let jetsonData = {};
  try {
    jetsonData = await new Promise((resolve, reject) => {
      const options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || 80,
        path: targetUrl.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(finalPayload) },
        timeout: 35000,
      };
      const hreq = http.request(options, (hres) => {
        let raw = '';
        hres.on('data', c => { raw += c; });
        hres.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
      });
      hreq.on('error', reject);
      hreq.on('timeout', () => { hreq.destroy(); reject(new Error('timeout')); });
      hreq.write(finalPayload);
      hreq.end();
    });
  } catch (e) {
    return res.status(503).json({ error: 'Jetson unreachable', details: e.message });
  }

  if (!jetsonData?.success) {
    return res.status(422).json({ error: jetsonData?.error || jetsonData?.message || 'Jetson enrollment failed', ...jetsonData });
  }

  // 2. Save embedding to DB if Jetson returned one
  if (Array.isArray(jetsonData.embedding) && jetsonData.embedding.length === 512) {
    try {
      const vectorStr = `[${jetsonData.embedding.join(',')}]`;
      const photoPath = jetsonData.photo_path || null;
      const enrolledBy = req.auth?.user?.id || null;

      const { rows: existing } = await pool.query(
        `SELECT id FROM employee_face_embeddings WHERE employee_id = $1 ORDER BY enrolled_at ASC`,
        [employee_id]
      );
      if (existing.length >= 8) {
        await pool.query(`DELETE FROM employee_face_embeddings WHERE id = $1`, [existing[0].id]);
      }
      const isPrimary = existing.length === 0;

      await pool.query(
        `INSERT INTO employee_face_embeddings
           (employee_id, embedding, quality_score, is_primary, enrolled_by, model_version, angle, photo_path)
         VALUES ($1, $2::vector, $3, $4, $5, $6, $7, $8)`,
        [employee_id, vectorStr, jetsonData.confidence || null, isPrimary, enrolledBy, 'arcface-r50-fp16', angle, photoPath]
      );
      console.log(`[enroll-angle] Saved embedding for employee ${employee_id}, angle=${angle}, confidence=${jetsonData.confidence}`);
    } catch (dbErr) {
      console.error('[enroll-angle] DB save failed:', dbErr.message);
      // Don't fail the request — frame was captured, just log the error
    }
  }

  // 3. Try to get the captured frame back as base64
  // Jetson may expose /last-frame, /snapshot, or include frame_url in the enroll response
  let frameBase64 = jetsonData.frame_base64 || jetsonData.frame || null;
  let frameUrl    = jetsonData.frame_url    || null;

  if (!frameBase64 && !frameUrl) {
    // Try Jetson snapshot endpoints (returns JPEG of most recently captured face)
    for (const snapPath of ['/last-frame', '/snapshot', `/frame/${employee_id}`]) {
      try {
        const snap = await fetch(`${JETSON_URL}${snapPath}`, { signal: AbortSignal.timeout(3000) });
        if (snap.ok && snap.headers.get('content-type')?.includes('image')) {
          const buf = await snap.arrayBuffer();
          frameBase64 = `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
          break;
        }
      } catch { /* endpoint not available */ }
    }
  }

  // 4. If Jetson returned a photo filename, build a proxied URL
  if (!frameBase64 && !frameUrl && jetsonData.photo_path) {
    const filename = path.basename(String(jetsonData.photo_path));
    frameUrl = `/api/jetson/photos/${filename}`;
  }

  return res.json({
    success:     true,
    angle,
    confidence:  jetsonData.confidence,
    frameBase64: frameBase64 || null,
    frameUrl:    frameUrl    || null,
  });
}));

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
