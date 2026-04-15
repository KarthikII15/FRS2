import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { env } from "./config/env.js";
import { authRoutes } from "./routes/authRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { liveRoutes } from "./routes/liveRoutes.js";
import { meRoutes } from "./routes/meRoutes.js";
import { deviceRoutes } from "./routes/deviceRoutes.js";
import rbacRoutes from "./routes/rbacRoutes.js";
import { updateAllMetrics, getMetrics } from "./services/metricsService.js";
import { attendanceRoutes } from "./routes/attendanceRoutes.js";
import { employeeRoutes } from "./routes/employeeRoutes.js";
import { dashboardRoutes } from "./routes/dashboardRoutes.js";
import { searchRoutes } from "./routes/searchRoutes.js";
import { faceRoutes } from "./routes/faceRoutes.js";
import { reportRoutes } from "./routes/reportRoutes.js";
import { userRoutes } from "./routes/userRoutes.js";
import { hrRoutes } from "./routes/hrRoutes.js";
import { jetsonRoutes } from "./routes/jetsonRoutes.js";
import enrollmentRoutes from "./routes/enrollmentRoutes.js";
import { cameraRoutes } from "./routes/cameraRoutes.js";
import { siteRoutes } from "./routes/siteRoutes.js";
import deviceManagementRoutes from "./routes/deviceManagementRoutes.js";
import hrmsIntegrationRoutes from './routes/hrmsIntegrationRoutes.js';
import siteManagementRoutes from "./routes/siteManagementRoutes.js";
import monitoringRoutes from "./routes/monitoringRoutes.js";
import configRoutes from "./routes/configRoutes.js";
import { pool, warmPool } from "./db/pool.js";
import { globalRateLimiter } from "./middleware/rateLimit.js";
import { extractScope, validateScopeAccess } from "./middleware/scopeExtractor.js";

// Import core services
import shutdownManager from "./core/managers/ShutdownManager.js";
// import modelManager from "./core/managers/ModelManager.js"; // disabled until Jetson online
const modelManager = { initialize: async()=>{} };
import validationService from "./core/services/ValidationService.js";
// import inferenceProcessor from "./core/services/InferenceProcessorCore.js"; // disabled until Jetson online
const inferenceProcessor = { initialize: async()=>{}, getStats: ()=>null, on: ()=>{} };
import { configLoaders } from "./config/loaders.js";
import wsManager from "./websocket/index.js";
import { setAuditWsManager } from "./middleware/auditLog.js";
import attendanceService from "./services/business/AttendanceService.js";
import uploadSnapshotPushService from "./core/services/UploadSnapshotPushService.js";
import livePresenceService from "./services/business/LivePresenceService.js";
import kafkaEventService from "./core/kafka/KafkaEventService.js";

const app = express();
app.use(compression());
app.use(helmet());
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-tenant-id",
      "x-customer-id",
      "x-site-id",
      "x-unit-id",
    ],
  })
);

// Granular body parser limits for production security
// Standard API routes are limited to 1MB to prevent memory exhaustion
app.use("/api/auth", express.json({ limit: "1mb" }));
app.use("/api/live", express.json({ limit: "1mb" }));
app.use("/api/me", express.json({ limit: "1mb" }));
app.use("/api/users", express.json({ limit: "1mb" }));

// Catch-all with slightly larger limit, but specific frame endpoints have their own
app.use(express.json({ limit: "50mb" })); // Keep for potential large employee/shift data
app.use(express.raw({ type: 'image/*', limit: '50mb' })); 

// 1. General IP Throttling for all API endpoints
app.use("/api", globalRateLimiter);

// Deep Health check endpoint (Liveness & Readiness probe)
app.get("/api/health", async (req, res) => {
  const dbStart = Date.now();
  let dbStatus = 'DOWN';
  let dbLatency = 0;
  
  try {
    const { rows } = await pool.query("SELECT 1 as ok");
    if (rows?.[0]?.ok === 1) {
      dbStatus = 'UP';
      dbLatency = Date.now() - dbStart;
    }
  } catch (_) {
    dbStatus = 'DOWN';
  }

  const status = dbStatus === 'UP' ? 'UP' : 'DEGRADED';
  res.status(status === 'UP' ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: { status: dbStatus, latency: `${dbLatency}ms` },
      validation: validationService.getAllStats() ? 'UP' : 'DOWN',
      inference: inferenceProcessor.getStats() ? 'UP' : 'DOWN'
    }
  });
});

// System metrics endpoint (like SystemMetricsController)
app.get("/api/metrics", async (req, res) => {
  const metrics = {
    system: {
      memory: modelManager.getMemoryInfo(),
      uptime: process.uptime(),
      shutdownStatus: shutdownManager.isShuttingDown
    },
    cameras: validationService.getAllStats(),
    inference: inferenceProcessor.getStats(),
    queues: {
      pendingEvents: shutdownManager.pendingEvents.length,
      cameraQueues: Object.fromEntries(
        Array.from(shutdownManager.cameraQueues.entries()).map(([id, queue]) => [
          id,
          { size: queue.frames.length, maxSize: queue.maxSize }
        ])
      )
    }
  };
  
  res.json(metrics);
});

// Prometheus metrics endpoint
app.get("/metrics", async (req, res) => {
  try {
    const metrics = await getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.end(metrics);
  } catch (error) {
    console.error('Metrics collection error:', error);
    res.status(500).end('Error collecting metrics');
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/admin/rbac", rbacRoutes);
app.use("/api/me", meRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/device-management", deviceManagementRoutes);
app.use('/api/hrms', hrmsIntegrationRoutes);
app.use("/api/site-management", siteManagementRoutes);
app.use("/api/monitoring", monitoringRoutes);
app.use("/api/config", configRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/face", faceRoutes);
app.use("/api/site", siteRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/users", userRoutes);
app.use("/api/hr", hrRoutes);
app.use("/api/cameras", cameraRoutes);
app.use("/api/jetson", jetsonRoutes);
app.use("/api/enroll", enrollmentRoutes);
// Apply extractScope before auth to parse headers, then validate after auth
app.use("/api/live", extractScope, liveRoutes);

// RTSP frame endpoint (like /controller/rtspframe)
app.post("/api/frames/rtsp/:cameraId", async (req, res) => {
  try {
    const { cameraId } = req.params;
    const frameData = req.body.frame || req.body; // Support both formats
    const metadata = {
      ...req.body.metadata,
      timestamp: req.body.timestamp || new Date().toISOString(),
      source: 'rtsp',
      contentType: req.headers['content-type']
    };

    const result = await validationService.validateAndQueueFrame(cameraId, frameData, metadata);
    
    if (result.queued) {
      res.status(202).json(result); // 202 Accepted
    } else {
      res.status(429).json(result); // 429 Too Many Requests
    }
  } catch (error) {
    console.error('Frame processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Smart search frame endpoint (like /controller/smartframe)
app.post("/api/frames/smart/:cameraId", async (req, res) => {
  try {
    const { cameraId } = req.params;
    const { frame, profileId, searchParams } = req.body;
    
    // Similar to RTSP but with smart search profile
    const result = await validationService.validateAndQueueFrame(cameraId, frame, {
      ...req.body.metadata,
      timestamp: new Date().toISOString(),
      source: 'smart_search',
      profileId,
      searchParams
    });
    
    res.status(202).json(result);
  } catch (error) {
    console.error('Smart frame processing error:', error);
    res.status(500).json({ error: error.message });
  }
});


// ── Jetson sidecar proxy ─────────────────────────────────────────────────────
// Browser can't reach Jetson directly (172.18.3.202:5000) due to subnet + CORS.
// Backend proxies /api/jetson/* → Jetson C++ runner HTTP server.


// Error handling middleware
app.use((err, _req, res, _next) => {
  // JWT / Keycloak token errors → 401, not 500
  const jwtCodes = ['ERR_JWS_INVALID', 'ERR_JWT_EXPIRED', 'ERR_JWT_CLAIM_VALIDATION_FAILED',
                    'ERR_JWKS_NO_MATCHING_KEY', 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED'];
  if (err.code && jwtCodes.includes(err.code)) {
    return res.status(401).json({ message: 'invalid or expired token' });
  }
  if (err.message?.toLowerCase().includes('jwt') || err.message?.toLowerCase().includes('audience')) {
    return res.status(401).json({ message: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({
    message: "internal server error",
    error: env.nodeEnv === 'development' ? err.message : undefined
  });
});

// Initialize services and start server
async function startServer() {
  try {
    // Load configurations
    await configLoaders.syncAllConfigs();
    await warmPool();
    console.log('✅ Configurations loaded');
    
    // Initialize model manager
    await modelManager.initialize();
    console.log('✅ Model manager initialized');
    
    // Initialize inference processor
    await inferenceProcessor.initialize();
    console.log('✅ Inference processor initialized');
    
    // Validation service auto-initializes in constructor
    
    // Set up event handlers
    inferenceProcessor.on('eventsGenerated', (data) => {
      // Queue events for pushing (like EventPushService)
      data.events.forEach(event => {
        shutdownManager.queueEvent({
          ...event,
          cameraId: data.cameraId,
          timestamp: new Date().toISOString()
        });
      });
    });

    inferenceProcessor.on('memoryPressure', (memoryInfo) => {
      console.warn('⚠️ Memory pressure detected:', memoryInfo);
      // Could implement circuit breaker here
    });

    // Initialize snapshot uploader
    try {
      await uploadSnapshotPushService.initialize();
      console.log('✅ Snapshot uploader initialized');
    } catch (e) {
      console.warn('Snapshot uploader init failed:', e.message);
    }

    // Start server
// Update metrics every 30 seconds
setInterval(async () => {
  try {
    await updateAllMetrics();
  } catch (error) {
    console.error("Periodic metrics update error:", error);
  }
}, 30000);


    const server = app.listen(env.port, () => {
      console.log(`🚀 Backend API listening on http://localhost:${env.port}`);
      console.log(`📹 Video analytics service ready`);
    });
    try {
      await wsManager.initialize(server);
      console.log("✅ WebSocket initialized");
      setAuditWsManager(wsManager);

      // Broadcast device status every 10s to all connected clients
      setInterval(async () => {
        try {
          const { pool } = await import('./db/pool.js');
          const { rows: tenants } = await pool.query('SELECT pk_tenant_id FROM frs_tenant');
          for (const t of tenants) {
            const { rows: devices } = await pool.query(
              `UPDATE facility_device
               SET status = CASE
                 WHEN status = 'online' AND last_active < NOW() - INTERVAL '1 minute' THEN 'offline'
                 ELSE status END
               WHERE tenant_id = $1
               RETURNING pk_device_id, external_device_id, name, status, last_active,
                         host(ip_address::inet) as ip_address, location_label,
                         recognition_accuracy, total_scans, model`,
              [t.pk_tenant_id]
            );
            wsManager.broadcastDeviceStatus(String(t.pk_tenant_id), devices);
          }
        } catch (_) {}
      }, 10000);
      attendanceService.setBroadcaster((event, payload) => {
        if (event === "attendance.marked" || event === "attendance.batchMarked") {
          wsManager.emitAttendanceUpdate(payload);
        }
      });
      livePresenceService.setBroadcaster((event, payload) => {
        if (event === "presence.change") {
          wsManager.emitPresenceUpdate(payload);
        }
      });
    } catch (e) {
      console.warn("WebSocket disabled:", e.message);
    }

    // Subscribe to enterprise Kafka topics
    try {
      await kafkaEventService.subscribeToDeviceEvents(async (evt) => {
        wsManager.emitPresenceUpdate({ type: 'device_event', evt });
      });
      await kafkaEventService.subscribeToAIDetections(async (evt) => {
        wsManager.emitAttendanceUpdate({ type: 'ai_detection', evt });
      });
      console.log('✅ Subscribed to enterprise Kafka topics');
    } catch (e) {
      console.warn('Kafka enterprise subscriptions failed:', e.message);
    }

    // Graceful shutdown handler
    const shutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
      
      // Stop accepting new requests
      server.close(async () => {
        // Run shutdown manager
        await shutdownManager.shutdown(signal);
        
        // Close database pool
        await pool.end();
        
        console.log('👋 Shutdown complete');
        process.exit(0);
      });
      
      // Force shutdown after timeout
      setTimeout(() => {
        console.error('Force shutdown due to timeout');
        process.exit(1);
      }, 30000);
    };

    process.on("SIGINT", () => shutdown('SIGINT'));
    process.on("SIGTERM", () => shutdown('SIGTERM'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
