import { useDepartmentsAndShifts } from '../../hooks/useDepartmentsAndShifts';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { toast } from 'sonner';
import {
  Camera, Upload, ScanFace, Trash2, X, Loader2,
  CheckCircle2, AlertTriangle, Wifi, WifiOff, RefreshCw, Info,
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
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

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

  // Check Jetson via backend proxy — avoids CORS/subnet issues
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

  // Load enrollment status on mount
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

  const primaryEmbedding = status?.embeddings?.find(e => e.isPrimary) || status?.embeddings?.[0];

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
    if (file.size > MAX_SIZE_BYTES) { toast.error('Max 5 MB'); return; }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setPanelState('preview');
  };

  // ── Enroll from Jetson camera via backend proxy ─────────────────────────────
  const handleCameraEnroll = async () => {
    if (authConfig.mode === 'mock') {
      const s: EnrollmentStatus = { enrolled: true, embeddingCount: 1, embeddings: [] };
      setIsEnrolled(true); setStatus(s); setPanelState('success'); onEnrolled?.(s);
      return;
    }
    setPanelState('enrolling-cam');
    setErrorMessage(null);
    try {
      const resp = await fetch(`${authConfig.apiBaseUrl}/jetson/enroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ employee_id: String(employeeId), cam_id: 'entrance-cam-01' }),
        signal: AbortSignal.timeout(35000),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.success) {
        const s: EnrollmentStatus = { enrolled: true, embeddingCount: 1, embeddings: [] };
        setIsEnrolled(true); setStatus(s); setPanelState('success');
        onEnrolled?.(s);
        toast.success(`${employeeName} enrolled`, {
          description: `Confidence: ${data.confidence ? (data.confidence * 100).toFixed(0) + '%' : 'Good'}`,
        });
      } else {
        throw new Error(data.error || data.message || 'Enrollment failed');
      }
    } catch (e: any) {
      const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      const msg = isTimeout
        ? 'Timed out — ensure frs-runner is running on Jetson (sudo systemctl start frs-runner)'
        : (e?.message || 'Camera enrollment failed');
      setErrorMessage(msg);
      setPanelState('error');
      setJetsonOnline(false);
    }
  };

  // ── Enroll via photo upload ────────────────────────────────────────────────
  const handlePhotoEnroll = async () => {
    if (!selectedFile) return;
    if (authConfig.mode === 'mock') {
      setTimeout(() => {
        const s: EnrollmentStatus = { enrolled: true, embeddingCount: 1, embeddings: [] };
        setIsEnrolled(true); setStatus(s); setPanelState('success'); onEnrolled?.(s);
      }, 1500);
      return;
    }
    setPanelState('uploading');
    setErrorMessage(null);
    try {
      const form = new FormData();
      form.append('photo', selectedFile);
      const resp = await fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/enroll-face`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 503) {
        // Try Jetson camera enrollment as fallback
        if (jetsonOnline) {
          toast.info('Trying camera enrollment instead...');
          return enrollFromCamera();
        }
        throw new Error('No face embedding service available. Use "Use Webcam" to enroll from your browser camera.');
      }
      if (!resp.ok) {
        const msg = data?.message || 'Enrollment failed';
        if (resp.status === 422) {
          if (msg.toLowerCase().includes('no face')) throw new Error('No face detected — use a clear, front-facing photo');
          if (msg.toLowerCase().includes('multiple')) throw new Error('Multiple faces detected — only one person should be in frame');
        }
        throw new Error(msg);
      }
      const s: EnrollmentStatus = { enrolled: true, embeddingCount: data.embeddingCount || 1, embeddings: data.embeddings || [] };
      setIsEnrolled(true); setStatus(s); setPanelState('success'); onEnrolled?.(s);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Enrollment failed');
      setPanelState('error');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Remove ${employeeName}'s face enrollment? They won't be recognised by cameras.`)) return;
    if (authConfig.mode === 'mock') { setIsEnrolled(false); setStatus(null); resetToIdle(); return; }
    try {
      const r = await fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/enroll-face`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) throw new Error('Failed to remove');
      toast.success('Enrollment removed', { description: `${employeeName} can be re-enrolled.` });
      setIsEnrolled(false); setStatus(null); resetToIdle();
      onEnrolled?.({ enrolled: false, embeddingCount: 0, embeddings: [] });
    } catch (e) {
      toast.error('Delete failed', { description: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  const startWebcam = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      setStream(media);
      setPanelState('selecting');
      // Wait for next render cycle so video element exists in DOM
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = media;
            videoRef.current.play().catch(() => {});
          }
        });
      });
    } catch (err) {
      console.error('Webcam error:', err);
      toast.error('Webcam unavailable', {
        description: 'Allow camera access in browser settings, or upload a photo instead.',
      });
    }
  };

  const captureWebcam = () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(async (blob) => {
      if (!blob) return;
      if (stream) { stream.getTracks().forEach(t => t.stop()); setStream(null); }
      // Send webcam capture directly via enroll-face multipart — same as photo upload
      setPanelState('uploading');
      try {
        // Step 1: Get embedding from Jetson by sending the image
        let embedding: number[] | null = null;
        let confidence = 0.8;
        if (jetsonOnline) {
          const imgForm = new FormData();
          imgForm.append('image', new File([blob], 'webcam.jpg', { type: 'image/jpeg' }));
          const jetsonResp = await fetch(`${authConfig.apiBaseUrl}/jetson/enroll-image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: imgForm,
          });
          const jd = await jetsonResp.json().catch(() => ({}));
          if (jd?.embedding?.length === 512) {
            embedding = jd.embedding;
            confidence = jd.confidence || 0.8;
          }
        }

        let resp: Response;
        if (embedding) {
          // Use pre-computed embedding
          resp = await fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/enroll-face-direct`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ embedding, confidence, source: 'webcam' }),
          });
        } else {
          // Fallback: upload photo directly
          const form = new FormData();
          form.append('photo', new File([blob], 'webcam.jpg', { type: 'image/jpeg' }));
          resp = await fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/enroll-face`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form,
          });
        }
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data.message || data.error || `Upload failed (${resp.status})`);
        }
        const s: EnrollmentStatus = { enrolled: true, embeddingCount: data.embeddingCount || 1, embeddings: data.embeddings || [] };
        setStatus(s); setIsEnrolled(true); setPanelState('success');
        toast.success(`${employeeName} enrolled via webcam`);
        onEnrolled?.(s);
      } catch (e: any) {
        setPanelState('error');
        setErrorMsg(e?.message || 'Webcam enrollment failed');
        toast.error('Enrollment failed', { description: e?.message });
      }
    }, 'image/jpeg', 0.95);
  };

  return (
    <div className="space-y-4">
      {/* Enrolled status bar */}
      {isEnrolled && panelState === 'idle' && (
        <div className={cn('p-3 rounded-lg border flex items-start gap-3',
          lightTheme.background.secondary, lightTheme.border.default, 'dark:bg-slate-900/40 dark:border-border')}>
          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className={cn('text-xs font-bold', lightTheme.text.primary, 'dark:text-white')}>Face enrolled</p>
            <p className={cn('text-[11px]', lightTheme.text.muted, 'dark:text-slate-500')}>
              {status?.embeddingCount ?? 1} photo(s)
              {primaryEmbedding?.qualityScore ? ` · ${(primaryEmbedding.qualityScore * 100).toFixed(0)}% quality` : ''}
              {primaryEmbedding?.enrolledAt ? ` · ${new Date(primaryEmbedding.enrolledAt).toLocaleDateString()}` : ''}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleDelete} className="text-red-500 hover:text-red-600 shrink-0">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Idle — method picker */}
      {panelState === 'idle' && (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          className={cn('border border-dashed rounded-xl p-5 space-y-4',
            lightTheme.border.default, lightTheme.background.card, 'dark:bg-slate-900 dark:border-border')}
        >
          {/* Jetson camera enroll — primary method */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {jetsonOnline === true  && <Wifi      className="w-3.5 h-3.5 text-emerald-500" />}
              {jetsonOnline === false && <WifiOff   className="w-3.5 h-3.5 text-red-400" />}
              {jetsonOnline === null  && <Loader2   className="w-3.5 h-3.5 animate-spin text-slate-400" />}
              <span className={cn('text-xs font-semibold',
                jetsonOnline === true  ? 'text-emerald-600 dark:text-emerald-400' :
                jetsonOnline === false ? 'text-red-500 dark:text-red-400' :
                'text-slate-400')}>
                Jetson Runner {jetsonOnline === true ? '· Online' : jetsonOnline === false ? '· Offline' : '· Checking...'}
              </span>
              <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={checkJetson}>
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
            <Button
              className="w-full"
              disabled={jetsonOnline !== true}
              onClick={handleCameraEnroll}
            >
              <ScanFace className="w-4 h-4 mr-2" />
              {isEnrolled ? 'Re-Enroll from Camera' : 'Enroll from Camera'}
            </Button>
            {jetsonOnline === false && (
              <p className="text-[11px] text-red-500 dark:text-red-400">
                On Jetson: <code className="font-mono bg-red-50 dark:bg-red-900/20 px-1 rounded">sudo systemctl start frs-runner</code>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-700" />
            <span className="text-xs text-slate-400 shrink-0">or upload photo</span>
            <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-700" />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />Upload Photo
              </Button>
              <Button variant="outline" size="sm" onClick={startWebcam}>
                <Camera className="w-4 h-4 mr-2" />Use Webcam
              </Button>
            </div>
            <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300 px-3 py-1 rounded-full">
              <Info className="w-3 h-3" />
              One face · Front-facing · Good lighting · No sunglasses
            </div>
          </div>
        </div>
      )}

      {/* Webcam capture */}
      {panelState === 'selecting' && (
        <div className={cn('border rounded-xl p-4 space-y-4',
          lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-900 dark:border-border')}>
          <div className="relative overflow-hidden rounded-lg">
            <video ref={videoRef} className="w-full rounded-lg" autoPlay muted playsInline onLoadedMetadata={() => videoRef.current?.play()} />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-48 h-64 border-2 border-emerald-400/70 rounded-full bg-emerald-500/5" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={captureWebcam}><Camera className="w-4 h-4 mr-2" />Capture</Button>
            <Button variant="outline" className="flex-1" onClick={() => {
              if (stream) stream.getTracks().forEach(t => t.stop()); setStream(null); resetToIdle();
            }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Photo preview */}
      {panelState === 'preview' && previewUrl && (
        <div className={cn('border rounded-xl p-4 space-y-4',
          lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-900 dark:border-border')}>
          <div className="relative">
            <img src={previewUrl} alt="Preview" className="w-full rounded-lg object-cover max-h-64" />
            <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-white/80 dark:bg-slate-800/80" onClick={resetToIdle}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <Button onClick={handlePhotoEnroll} className="w-full">
            {isEnrolled ? 'Re-Enroll with This Photo' : 'Enroll with This Photo'}
          </Button>
        </div>
      )}

      {/* Processing spinners */}
      {(panelState === 'uploading' || panelState === 'enrolling-cam') && (
        <div className={cn('border rounded-xl p-4 space-y-3',
          lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-900 dark:border-border')}>
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
            <div>
              <p className={cn('text-sm font-medium', lightTheme.text.primary, 'dark:text-white')}>
                {panelState === 'enrolling-cam' ? 'Capturing from camera…' : 'Processing photo…'}
              </p>
              <p className={cn('text-xs', lightTheme.text.muted, 'dark:text-slate-400')}>
                {panelState === 'enrolling-cam'
                  ? 'Jetson: ISAPI snapshot → YOLOv8 → ArcFace → pgvector (up to 30s)'
                  : 'Running face detection and ArcFace embedding…'}
              </p>
            </div>
          </div>
          <Progress value={panelState === 'enrolling-cam' ? 45 : 65} className="h-1.5 animate-pulse" />
        </div>
      )}

      {/* Success */}
      {panelState === 'success' && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="text-sm">
              <strong>{employeeName}</strong> enrolled — will be recognised by cameras within 30 seconds.
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={resetToIdle}>Add Another Photo</Button>
        </div>
      )}

      {/* Error */}
      {panelState === 'error' && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="text-sm">{errorMessage || 'Enrollment failed. Try again.'}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetToIdle}>Try Again</Button>
            <Button variant="ghost" size="sm" onClick={checkJetson}>
              <RefreshCw className="w-3 h-3 mr-1" />Check Jetson
            </Button>
          </div>
        </div>
      )}

      <input ref={inputRef} type="file" accept={ACCEPTED_TYPES.join(',')} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }} />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
