import express from 'express';
import { requireAuth } from '../middleware/authz.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = express.Router();
const JETSON_URL = process.env.JETSON_SIDECAR_URL || 'http://172.18.3.202:5000';

router.use(requireAuth);

// Proxy any request to Jetson sidecar
router.all('/*', asyncHandler(async (req, res) => {
  const path = req.path;
  const url  = JETSON_URL + path;
  
  const opts = {
    method:  req.method,
    headers: { 'Content-Type': 'application/json' },
    signal:  AbortSignal.timeout(35000),
  };
  if (req.method !== 'GET') {
    opts.body = JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(url, opts);
    const data     = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(503).json({
      error:  'Jetson sidecar unreachable',
      hint:   'Run: sudo systemctl start frs-runner on the Jetson',
      sidecar: JETSON_URL,
    });
  }
}));

export { router as jetsonRoutes };
