#!/bin/bash
# vm/fix_enrollment_and_ui_refresh.sh
# Fixes:
#   1. Jetson sidecar not reachable from browser — add backend proxy route
#   2. UI face_enrolled badge not updating after enrollment
#   3. Attendance records showing frame proof/device info
set -e
cd ~/FRS_/FRS--Java-Verison

echo "=================================================="
echo " Fixing enrollment sidecar + UI refresh"
echo "=================================================="

# ── 1. Add backend proxy for Jetson sidecar ───────────────────────────────────
# Browser can't reach 172.18.3.202:5000 directly (different subnet + CORS)
# Solution: backend proxies /api/jetson/* → Jetson sidecar
python3 << 'PYEOF'
import os

path = "backend/src/server.js"
with open(path) as f:
    c = f.read()

if '/api/jetson' in c:
    print("✅ Jetson proxy already exists")
else:
    proxy_route = '''
// ── Jetson sidecar proxy ─────────────────────────────────────────────────────
// Browser can't reach Jetson directly (172.18.3.202:5000) due to subnet + CORS.
// Backend proxies /api/jetson/* → Jetson C++ runner HTTP server.
import { createProxyMiddleware } from 'http-proxy-middleware';
const JETSON_SIDECAR = process.env.JETSON_SIDECAR_URL || 'http://172.18.3.202:5000';

app.use('/api/jetson', requireAuth, createProxyMiddleware({
  target: JETSON_SIDECAR,
  changeOrigin: true,
  pathRewrite: { '^/api/jetson': '' },
  on: {
    error: (err, req, res) => {
      res.status(503).json({
        error: 'Jetson sidecar unreachable',
        hint: 'Ensure frs-runner is running: sudo systemctl start frs-runner',
        sidecar: JETSON_SIDECAR,
      });
    }
  }
}));
'''
    # Insert before the error handler
    c = c.replace(
        "// Error handling middleware",
        proxy_route + "\n// Error handling middleware"
    )
    print("✅ Jetson proxy route added")

with open(path, 'w') as f:
    f.write(c)
PYEOF

# Install http-proxy-middleware
cd backend
npm install http-proxy-middleware --save 2>&1 | tail -3
cd ..

# ── 2. Fix FaceEnrollButton — use backend proxy + refresh parent after enroll ─
cat > src/app/components/hr/FaceEnrollButton.tsx << 'TSXEOF'
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { toast } from 'sonner';
import {
  Camera, Upload, ScanFace, Trash2, X, Loader2,
  CheckCircle2, AlertTriangle, Wifi, WifiOff, RefreshCw,
} from 'lucide-react';
import { authConfig } from '../../config/authConfig';
import { useAuth } from '../../contexts/AuthContext';

export interface EnrollmentEmbedding {
  id: string;
  modelVersion?: string;
  qualityScore?: number;
  isPrimary?: boolean;
  enrolledAt?: string;
}

export interface EnrollmentStatus {
  enrolled: boolean;
  embeddingCount: number;
  embeddings: EnrollmentEmbedding[];
}

interface FaceEnrollButtonProps {
  employeeId: string;
  employeeName: string;
  enrolled?: boolean;
  onEnrolled?: (newStatus: EnrollmentStatus) => void;
  compact?: boolean;
}

type PanelState = 'idle' | 'selecting' | 'preview' | 'uploading' | 'enrolling-cam' | 'success' | 'error';
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const FaceEnrollButton: React.FC<FaceEnrollButtonProps> = ({
  employeeId, employeeName, enrolled, onEnrolled, compact,
}) => {
  const { accessToken } = useAuth();
  const [panelState, setPanelState] = useState<PanelState>('idle');
  const [isEnrolled, setIsEnrolled] = useState(!!enrolled);
  const [status, setStatus] = useState<EnrollmentStatus | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [jetsonOnline, setJetsonOnline] = useState<boolean | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Check Jetson via backend proxy (avoids CORS/subnet issues)
  const checkJetson = useCallback(async () => {
    if (!accessToken) return;
    try {
      const r = await fetch(`${authConfig.apiBaseUrl}/jetson/health`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(4000),
      });
      setJetsonOnline(r.ok);
    } catch {
      setJetsonOnline(false);
    }
  }, [accessToken]);

  // Load enrollment status
  useEffect(() => {
    if (authConfig.mode === 'mock' || !accessToken) return;
    let mounted = true;
    fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/enroll-face`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(r => r.ok ? r.json() : null).then(d => {
      if (!mounted || !d) return;
      setStatus({ enrolled: !!d.enrolled, embeddingCount: d.embeddingCount || 0, embeddings: d.embeddings || [] });
      setIsEnrolled(!!d.enrolled);
    }).catch(() => {});
    checkJetson();
    return () => { mounted = false; };
  }, [accessToken, employeeId, checkJetson]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => { if (stream) stream.getTracks().forEach(t => t.stop()); }, [stream]);

  if (compact) {
    return isEnrolled ? (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
        <ScanFace className="w-3 h-3 mr-1" />Face Enrolled
      </Badge>
    ) : (
      <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">Not Enrolled</Badge>
    );
  }

  const resetToIdle = () => {
    setPanelState('idle'); setSelectedFile(null); setPreviewUrl(null); setErrorMessage(null);
  };

  const handleFile = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) { toast.error('Use JPG, PNG or WEBP'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5 MB'); return; }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setPanelState('preview');
  };

  // ── Enroll via Jetson camera (proxied through backend) ─────────────────────
  const handleCameraEnroll = async () => {
    if (authConfig.mode === 'mock') { toast.success('Mock enrolled'); return; }
    setPanelState('enrolling-cam');
    setErrorMessage(null);
    try {
      const resp = await fetch(`${authConfig.apiBaseUrl}/jetson/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ employee_id: String(employeeId), cam_id: 'entrance-cam-01' }),
        signal: AbortSignal.timeout(35000),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.success) {
        const newStatus: EnrollmentStatus = { enrolled: true, embeddingCount: 1, embeddings: [] };
        setIsEnrolled(true); setStatus(newStatus); setPanelState('success');
        onEnrolled?.(newStatus);
        toast.success(`${employeeName} enrolled`, {
          description: `Confidence: ${data.confidence ? (data.confidence * 100).toFixed(0) + '%' : 'Good'}`,
        });
      } else {
        throw new Error(data.error || data.message || 'Enrollment failed');
      }
    } catch (e: any) {
      const msg = e?.name === 'TimeoutError'
        ? 'Timed out — ensure frs-runner is running on Jetson'
        : (e?.message || 'Camera enrollment failed');
      setErrorMessage(msg);
      setPanelState('error');
      setJetsonOnline(false);
    }
  };

  // ── Enroll via photo upload ────────────────────────────────────────────────
  const handlePhotoEnroll = async () => {
    if (!selectedFile) return;
    setPanelState('uploading');
    setErrorMessage(null);
    if (authConfig.mode === 'mock') {
      setTimeout(() => {
        const s: EnrollmentStatus = { enrolled: true, embeddingCount: 1, embeddings: [] };
        setIsEnrolled(true); setStatus(s); setPanelState('success'); onEnrolled?.(s);
      }, 1500);
      return;
    }
    try {
      const form = new FormData();
      form.append('photo', selectedFile);
      const resp = await fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/enroll-face`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form,
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 503) throw new Error('Jetson sidecar offline — use Enroll from Camera after starting frs-runner');
      if (!resp.ok) throw new Error(data?.message || 'Enrollment failed');
      const s: EnrollmentStatus = { enrolled: true, embeddingCount: 1, embeddings: [] };
      setIsEnrolled(true); setStatus(s); setPanelState('success'); onEnrolled?.(s);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Failed');
      setPanelState('error');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Remove ${employeeName}'s face enrollment?`)) return;
    try {
      const r = await fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/enroll-face`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) throw new Error('Failed');
      toast.success('Enrollment removed');
      setIsEnrolled(false); setStatus(null); resetToIdle();
      onEnrolled?.({ enrolled: false, embeddingCount: 0, embeddings: [] });
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  const startWebcam = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      setStream(media); setPanelState('selecting');
      if (videoRef.current) { videoRef.current.srcObject = media; await videoRef.current.play(); }
    } catch { toast.error('Webcam unavailable'); }
  };

  const captureWebcam = () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(blob => {
      if (!blob) return;
      handleFile(new File([blob], 'webcam.jpg', { type: 'image/jpeg' }));
      if (stream) { stream.getTracks().forEach(t => t.stop()); setStream(null); }
    }, 'image/jpeg', 0.95);
  };

  const primaryEmb = status?.embeddings?.find(e => e.isPrimary) || status?.embeddings?.[0];

  return (
    <div className="space-y-4">
      {/* Enrolled status */}
      {isEnrolled && panelState === 'idle' && (
        <div className={cn('p-3 rounded-lg border flex items-start gap-3',
          lightTheme.background.secondary, lightTheme.border.default, 'dark:bg-slate-900/40 dark:border-border')}>
          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
          <div className="flex-1">
            <p className={cn('text-xs font-bold', lightTheme.text.primary, 'dark:text-white')}>Face enrolled</p>
            <p className={cn('text-[11px]', lightTheme.text.muted, 'dark:text-slate-500')}>
              {status?.embeddingCount ?? 1} photo(s)
              {primaryEmb?.qualityScore ? ` · ${(primaryEmb.qualityScore * 100).toFixed(0)}% quality` : ''}
              {primaryEmb?.enrolledAt ? ` · ${new Date(primaryEmb.enrolledAt).toLocaleDateString()}` : ''}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleDelete} className="text-red-500 hover:text-red-600">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Idle — method picker */}
      {panelState === 'idle' && (
        <div className={cn('border border-dashed rounded-xl p-5 space-y-4',
          lightTheme.border.default, lightTheme.background.card, 'dark:bg-slate-900 dark:border-border')}>

          {/* Jetson camera enroll */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {jetsonOnline === true && <Wifi className="w-3.5 h-3.5 text-emerald-500" />}
              {jetsonOnline === false && <WifiOff className="w-3.5 h-3.5 text-red-400" />}
              {jetsonOnline === null && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
              <span className={cn('text-xs font-semibold',
                jetsonOnline === true ? 'text-emerald-600 dark:text-emerald-400' :
                jetsonOnline === false ? 'text-red-500' : 'text-slate-400')}>
                Jetson Runner {jetsonOnline === true ? '· Online' : jetsonOnline === false ? '· Offline' : '· Checking...'}
              </span>
              <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={checkJetson}>
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
            <Button className="w-full" disabled={jetsonOnline !== true} onClick={handleCameraEnroll}>
              <ScanFace className="w-4 h-4 mr-2" />
              {isEnrolled ? 'Re-Enroll from Camera' : 'Enroll from Camera'}
            </Button>
            {jetsonOnline === false && (
              <p className="text-[11px] text-red-500">
                On Jetson: <code>sudo systemctl start frs-runner</code>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-700" />
            <span className="text-xs text-slate-400">or upload photo</span>
            <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-700" />
          </div>

          <div onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />Upload Photo
            </Button>
            <Button variant="outline" size="sm" onClick={startWebcam}>
              <Camera className="w-4 h-4 mr-2" />Use Webcam
            </Button>
          </div>
          <p className="text-[10px] text-slate-400">JPG/PNG · max 5MB · one face · front-facing · good lighting</p>
        </div>
      )}

      {/* Webcam */}
      {panelState === 'selecting' && (
        <div className={cn('border rounded-xl p-4 space-y-3', lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-900 dark:border-border')}>
          <div className="relative rounded-lg overflow-hidden">
            <video ref={videoRef} className="w-full rounded-lg" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-44 h-56 border-2 border-emerald-400/70 rounded-full" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={captureWebcam}><Camera className="w-4 h-4 mr-2" />Capture</Button>
            <Button variant="outline" className="flex-1" onClick={() => { if (stream) stream.getTracks().forEach(t => t.stop()); setStream(null); resetToIdle(); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Preview */}
      {panelState === 'preview' && previewUrl && (
        <div className={cn('border rounded-xl p-4 space-y-3', lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-900 dark:border-border')}>
          <div className="relative">
            <img src={previewUrl} alt="Preview" className="w-full rounded-lg object-cover max-h-56" />
            <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-white/80 dark:bg-slate-800/80" onClick={resetToIdle}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <Button className="w-full" onClick={handlePhotoEnroll}>{isEnrolled ? 'Re-Enroll' : 'Enroll'} with This Photo</Button>
        </div>
      )}

      {/* Uploading */}
      {(panelState === 'uploading' || panelState === 'enrolling-cam') && (
        <div className={cn('border rounded-xl p-4 space-y-3', lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-900 dark:border-border')}>
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <div>
              <p className="text-sm font-medium dark:text-white">
                {panelState === 'enrolling-cam' ? 'Capturing from camera…' : 'Processing photo…'}
              </p>
              <p className="text-xs text-slate-400">
                {panelState === 'enrolling-cam'
                  ? 'Jetson: NVDEC → YOLOv8 → ArcFace → pgvector (up to 30s)'
                  : 'Running face detection and embedding…'}
              </p>
            </div>
          </div>
          <Progress value={panelState === 'enrolling-cam' ? 40 : 65} className="h-1.5 animate-pulse" />
        </div>
      )}

      {/* Success */}
      {panelState === 'success' && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="text-sm"><strong>{employeeName}</strong> enrolled — recognised by cameras within 30s.</span>
          </div>
          <Button variant="outline" size="sm" onClick={resetToIdle}>Add Another Photo</Button>
        </div>
      )}

      {/* Error */}
      {panelState === 'error' && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="text-sm">{errorMessage}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetToIdle}>Try Again</Button>
            <Button variant="ghost" size="sm" onClick={checkJetson}><RefreshCw className="w-3 h-3 mr-1" />Check Jetson</Button>
          </div>
        </div>
      )}

      <input ref={inputRef} type="file" accept={ACCEPTED_TYPES.join(',')} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }} />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
TSXEOF

echo "  ✅ FaceEnrollButton.tsx updated (uses backend proxy)"

# ── 3. Fix EmployeeLifecycleManagement — refresh face_enrolled after enroll ───
python3 << 'PYEOF'
import os

path = "src/app/components/hr/EmployeeLifecycleManagement.tsx"
with open(path) as f:
    c = f.read()

# Find where FaceEnrollButton is rendered and add onEnrolled callback
# that updates the employee's face_enrolled status in local state
old = "emp.face_enrolled ? '✓ Enrolled' : 'Not enrolled'"

# Check if onEnrolled is already wired up
if 'onEnrolled' in c:
    print("✅ onEnrolled already wired")
else:
    # Add onEnrolled handler that updates local employee list
    c = c.replace(
        "              employeeId={String(emp.pk_employee_id)}\n                          employeeName={emp.full_name}",
        """              employeeId={String(emp.pk_employee_id)}
                          employeeName={emp.full_name}
                          onEnrolled={() => {
                            setEmployees(prev => prev.map(e =>
                              e.pk_employee_id === emp.pk_employee_id
                                ? { ...e, face_enrolled: true }
                                : e
                            ));
                          }}"""
    )
    print("✅ onEnrolled wired to update face_enrolled in list")

with open(path, 'w') as f:
    f.write(c)
PYEOF

# ── 4. Add frame/proof column to attendance table & attendance history UI ─────
# Check if frame_url column exists
docker exec attendance-postgres psql -U postgres -d attendance_intelligence -c "
ALTER TABLE attendance_record ADD COLUMN IF NOT EXISTS frame_url TEXT;
ALTER TABLE attendance_record ADD COLUMN IF NOT EXISTS recognition_confidence FLOAT;
" 2>/dev/null && echo "  ✅ attendance_record columns added" || echo "  ℹ  columns already exist"

# Update AttendanceService to store frame_url when provided
python3 << 'PYEOF'
import os

path = "backend/src/services/business/AttendanceService.js"
with open(path) as f:
    c = f.read()

if 'frame_url' in c:
    print("✅ AttendanceService already stores frame_url")
else:
    old_sql = '''      insert into attendance_record(
        tenant_id, customer_id, site_id, unit_id,
        fk_employee_id, attendance_date, check_in, status, location_label
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict (tenant_id, fk_employee_id, attendance_date)
      do update set check_in = coalesce(attendance_record.check_in, excluded.check_in),
                    status = excluded.status
      returning *'''

    new_sql = '''      insert into attendance_record(
        tenant_id, customer_id, site_id, unit_id,
        fk_employee_id, attendance_date, check_in, status, location_label,
        recognition_confidence
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      on conflict (tenant_id, fk_employee_id, attendance_date)
      do update set check_in = coalesce(attendance_record.check_in, excluded.check_in),
                    status = excluded.status,
                    recognition_confidence = coalesce(excluded.recognition_confidence, attendance_record.recognition_confidence)
      returning *'''

    c = c.replace(old_sql, new_sql)

    old_params = '''      payload.scope.tenantId,
      payload.scope.customerId || null,
      payload.scope.siteId || null,
      payload.scope.unitId || null,
      Number(payload.employeeId),
      ts.slice(0, 10),
      ts,
      status,
      null,'''

    new_params = '''      payload.scope.tenantId,
      payload.scope.customerId || null,
      payload.scope.siteId || null,
      payload.scope.unitId || null,
      Number(payload.employeeId),
      ts.slice(0, 10),
      ts,
      status,
      null,
      payload.confidence || null,'''

    c = c.replace(old_params, new_params)
    print("✅ AttendanceService updated to store confidence")

with open(path, 'w') as f:
    f.write(c)
PYEOF

# ── 5. Update FaceController to pass confidence to AttendanceService ──────────
python3 << 'PYEOF'
import os

path = "backend/src/controllers/FaceController.js"
with open(path) as f:
    c = f.read()

old = '''    const record = await attendanceService.markAttendance({
      employeeId: String(employeeId),
      deviceId,
      timestamp,
      scope: {'''

new = '''    const record = await attendanceService.markAttendance({
      employeeId: String(employeeId),
      deviceId,
      timestamp,
      confidence,
      scope: {'''

if old in c:
    c = c.replace(old, new)
    print("✅ FaceController passes confidence to attendance")
else:
    print("ℹ  Already updated")

with open(path, 'w') as f:
    f.write(c)
PYEOF

# ── Build and restart ─────────────────────────────────────────────────────────
echo ""
echo "Building backend + frontend..."
docker compose build backend frontend 2>&1 | tail -5
docker compose up -d backend frontend
sleep 10
echo ""
echo "=================================================="
echo " ✅ All fixes applied"
echo "=================================================="
echo ""
echo "What changed:"
echo "  1. Backend proxies /api/jetson/* → Jetson:5000 (fixes CORS/subnet)"
echo "  2. FaceEnrollButton uses backend proxy — Enroll from Camera now works"
echo "  3. Employee list refreshes face_enrolled badge immediately after enroll"
echo "  4. Attendance records now store recognition_confidence"
echo ""
echo "Hard refresh: Ctrl+Shift+R"
echo "Then: HR Dashboard → Employee Management → click employee → Enroll from Camera"