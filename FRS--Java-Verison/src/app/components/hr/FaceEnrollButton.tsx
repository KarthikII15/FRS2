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
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
} from 'lucide-react';
import { authConfig } from '../../config/authConfig';
import { useAuth } from '../../contexts/AuthContext';

import { PhotoViewerModal } from './PhotoViewerModal';

export interface EnrollmentEmbedding {
  id: string;
  modelVersion?: string;
  qualityScore?: number;
  isPrimary?: boolean;
  enrolledAt?: string;
  angle?: string;
  photoUrl?: string; 
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

type PanelState =
  | 'idle' | 'selecting' | 'preview' | 'uploading' | 'enrolling-cam' | 'success' | 'error'
  | 'multi-capture' | 'multi-review' | 'multi-submitting'
  | 'jetson-multi' | 'jetson-multi-done';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const ANGLES = [
  { id: 'front', label: 'Front',  hint: 'Look straight at the camera',   Icon: null },
  { id: 'left',  label: 'Left',   hint: 'Turn your head slightly left',  Icon: ChevronLeft },
  { id: 'right', label: 'Right',  hint: 'Turn your head slightly right', Icon: ChevronRight },
  { id: 'up',    label: 'Up',     hint: 'Tilt your chin slightly upward',Icon: ChevronUp },
  { id: 'down',  label: 'Down',   hint: 'Gently tilt your chin down',    Icon: ChevronDown },
] as const;

export const FaceEnrollButton: React.FC<FaceEnrollButtonProps> = ({
  employeeId, employeeName, enrolled, onEnrolled, compact,
}) => {
  const { accessToken } = useAuth();
  // Keep a ref so async loops always use the latest token even if it refreshes mid-flight
  const accessTokenRef = useRef(accessToken);
  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);
  const getToken = () => accessTokenRef.current;

  const [panelState, setPanelState] = useState<PanelState>('idle');
  const [isEnrolled, setIsEnrolled] = useState(!!enrolled);
  const [status, setStatus] = useState<EnrollmentStatus | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<{ name: string; id: string } | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [jetsonOnline, setJetsonOnline] = useState<boolean | null>(null);

  // Multi-angle state (webcam)
  const [captureStep, setCaptureStep] = useState(0);
  const [capturedBlobs, setCapturedBlobs] = useState<(Blob | null)[]>([null, null, null, null, null]);
  const [capturedThumbs, setCapturedThumbs] = useState<(string | null)[]>([null, null, null, null, null]);
  const [submitProgress, setSubmitProgress] = useState(0);

  // Jetson multi-angle state
  type JetsonAngleResult = { frame: string | null; confidence: number | null; done: boolean };
  const [jetsonStep, setJetsonStep] = useState(0);
  const [jetsonCapturing, setJetsonCapturing] = useState(false);
  const [jetsonResults, setJetsonResults] = useState<JetsonAngleResult[]>(
    Array(5).fill({ frame: null, confidence: null, done: false })
  );

  // Calculate enrollment quality status
  const getEnrollmentQuality = (embeddings: EnrollmentEmbedding[]) => {
    if (!embeddings || embeddings.length === 0) {
      return { status: 'poor', label: 'Not Enrolled', color: 'bg-red-100 text-red-800 border-red-300' };
    }
    
    const count = embeddings.length;
    const avgQuality = embeddings.reduce((sum, e) => sum + (e.qualityScore || 0), 0) / count;
    
    if (count >= 5 && avgQuality >= 0.70) {
      return { status: 'excellent', label: 'Excellent', color: 'bg-green-100 text-green-800 border-green-300' };
    } else if (count >= 3 && avgQuality >= 0.60) {
      return { status: 'good', label: 'Good', color: 'bg-blue-100 text-blue-800 border-blue-300' };
    } else if (count >= 1) {
      return { status: 'fair', label: 'Fair', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' };
    } else {
      return { status: 'poor', label: 'Poor', color: 'bg-red-100 text-red-800 border-red-300' };
    }
  };

  const enrollmentQuality = status?.embeddings ? getEnrollmentQuality(status.embeddings) : null;

  // Analyze enrollment quality by angle
  const analyzeEnrollment = (embeddings: EnrollmentEmbedding[]) => {
    const excellent = embeddings.filter(e => (e.qualityScore || 0) >= 0.75);
    const needsImprovement = embeddings.filter(e => (e.qualityScore || 0) < 0.60);
    const allAngles = ['front', 'left', 'right', 'up', 'down'];
    const capturedAngles = new Set(embeddings.map(e => e.angle?.toLowerCase()).filter(Boolean));
    const missingAngles = allAngles.filter(a => !capturedAngles.has(a));
    
    return { excellent, needsImprovement, missingAngles };
  };

  const analysis = status?.embeddings ? analyzeEnrollment(status.embeddings) : null;

  // Generate smart recommendations
  const getRecommendations = (embeddings: EnrollmentEmbedding[], analysis: any) => {
    const recommendations = [];
    
    if (analysis.missingAngles.length > 0) {
      recommendations.push({
        type: 'info',
        icon: Info,
        message: `Capture ${analysis.missingAngles.length} missing angle${analysis.missingAngles.length > 1 ? 's' : ''}: ${analysis.missingAngles.join(', ')}`
      });
    }
    
    if (analysis.needsImprovement.length > 0) {
      recommendations.push({
        type: 'warning',
        icon: AlertTriangle,
        message: `Re-capture ${analysis.needsImprovement.length} low-quality angle${analysis.needsImprovement.length > 1 ? 's' : ''} for better recognition`
      });
    }
    
    if (embeddings.length >= 5 && analysis.needsImprovement.length === 0 && analysis.missingAngles.length === 0) {
      recommendations.push({
        type: 'success',
        icon: CheckCircle2,
        message: 'Enrollment complete! All angles captured with good quality.'
      });
    }
    
    return recommendations;
  };

  const recommendations = analysis && status?.embeddings ? getRecommendations(status.embeddings, analysis) : [];

  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);

  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const checkJetson = useCallback(async () => {
    if (!getToken()) return;
    try {
      const r = await fetch(`${authConfig.apiBaseUrl}/jetson/health`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        signal: AbortSignal.timeout(4000),
      });
      setJetsonOnline(r.ok);
    } catch {
      setJetsonOnline(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authConfig.mode === 'mock' || !accessToken) return;
    let mounted = true;
    fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/enroll-face`, {
      headers: { Authorization: `Bearer ${getToken()}` },
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
  // Cleanup multi-capture thumb URLs on unmount
  useEffect(() => () => { capturedThumbs.forEach(u => { if (u) URL.revokeObjectURL(u); }); }, []);

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

  const stopStream = () => {
    if (stream) { stream.getTracks().forEach(t => t.stop()); setStream(null); }
  };

  const resetToIdle = () => {
    stopStream();
    setPanelState('idle');
    setSelectedFile(null);
    setPreviewUrl(null);
    setErrorMessage(null);
    setDuplicateOf(null);
    setCaptureStep(0);
    setCapturedBlobs([null, null, null, null, null]);
    setCapturedThumbs(prev => { prev.forEach(u => { if (u) URL.revokeObjectURL(u); }); return [null, null, null, null, null]; });
    setSubmitProgress(0);
  };

  const handleFile = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) { toast.error('Use JPG, PNG or WEBP'); return; }
    if (file.size > MAX_SIZE_BYTES) { toast.error('Max 5 MB'); return; }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setPanelState('preview');
  };

  // ── Jetson 5-angle wizard ──────────────────────────────────────────────────
  const startJetsonMulti = () => {
    if (authConfig.mode === 'mock') {
      const s: EnrollmentStatus = { enrolled: true, embeddingCount: 5, embeddings: [] };
      setIsEnrolled(true); setStatus(s); setPanelState('success'); onEnrolled?.(s);
      return;
    }
    setJetsonStep(0);
    setJetsonResults(Array(5).fill({ frame: null, confidence: null, done: false }));
    setJetsonCapturing(false);
    setPanelState('jetson-multi');
  };

  const captureJetsonAngle = async (step: number) => {
    setJetsonCapturing(true);
    const angle = ANGLES[step].id;
    try {
      const resp = await fetch(`${authConfig.apiBaseUrl}/jetson/enroll-angle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ employee_id: String(employeeId), cam_id: 'entrance-cam-01', angle }),
        signal: AbortSignal.timeout(35000),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || data.message || 'Capture failed');

      const frame = data.frameBase64 || (data.frameUrl ? `${authConfig.apiBaseUrl.replace('/api', '')}${data.frameUrl}` : null);
      setJetsonResults(prev => {
        const n = [...prev];
        n[step] = { frame, confidence: data.confidence ?? null, done: true };
        return n;
      });
      if (step < 4) {
        setJetsonStep(step + 1);
      } else {
        setPanelState('jetson-multi-done');
      }
    } catch (e: any) {
      const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      toast.error('Capture failed', {
        description: isTimeout
          ? 'Timed out — ensure frs-runner is running (sudo systemctl start frs-runner)'
          : e?.message,
      });
    } finally {
      setJetsonCapturing(false);
    }
  };

  const finishJetsonEnroll = async () => {
    const successCount = jetsonResults.filter(r => r.done).length;
    const statusResp = await fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/enroll-face`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }).catch(() => null);
    const statusData = statusResp?.ok ? await statusResp.json().catch(() => null) : null;
    const s: EnrollmentStatus = statusData
      ? { enrolled: true, embeddingCount: statusData.embeddingCount || successCount, embeddings: statusData.embeddings || [] }
      : { enrolled: true, embeddingCount: successCount, embeddings: [] };
    setIsEnrolled(true); setStatus(s); setPanelState('success'); onEnrolled?.(s);
    toast.success(`${employeeName} enrolled`, { description: `${successCount}/5 angles via Jetson camera` });
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
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 503) {
        if (jetsonOnline) { toast.info('Trying camera enrollment instead...'); return startWebcam(); }
        throw new Error('No face embedding service available. Use "Use Webcam" to enroll from your browser camera.');
      }
      if (!resp.ok) {
        const msg = data?.message || 'Enrollment failed';
        if (resp.status === 409 || data?.duplicate_of) {
          setDuplicateOf({ name: data.duplicate_of?.name || 'another employee', id: data.duplicate_of?.id || '' });
          throw new Error('DUPLICATE_FACE');
        }
        if (resp.status === 422) {
          if (msg.toLowerCase().includes('no face')) throw new Error('No face detected — use a clear, front-facing photo');
          if (msg.toLowerCase().includes('multiple')) throw new Error('Multiple faces detected — only one person should be in frame');
          if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already enrolled')) {
            setDuplicateOf({ name: data.duplicate_of?.name || 'another employee', id: data.duplicate_of?.id || '' });
            throw new Error('DUPLICATE_FACE');
          }
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
        method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) throw new Error('Failed to remove');
      toast.success('Enrollment removed', { description: `${employeeName} can be re-enrolled.` });
      setIsEnrolled(false); setStatus(null); resetToIdle();
      onEnrolled?.({ enrolled: false, embeddingCount: 0, embeddings: [] });
    } catch (e) {
      toast.error('Delete failed', { description: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  // ── Single webcam ──────────────────────────────────────────────────────────
  const startWebcam = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      setStream(media);
      setPanelState('selecting');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (videoRef.current) { videoRef.current.srcObject = media; videoRef.current.play().catch(() => {}); }
      }));
    } catch {
      toast.error('Webcam unavailable', { description: 'Allow camera access in browser settings, or upload a photo instead.' });
    }
  };

  const captureWebcam = () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(async (blob) => {
      if (!blob) return;
      stopStream();
      setPanelState('uploading');
      try {
        let embedding: number[] | null = null;
        let confidence = 0.8;
        if (jetsonOnline) {
          const imgForm = new FormData();
          imgForm.append('image', new File([blob], 'webcam.jpg', { type: 'image/jpeg' }));
          const jetsonResp = await fetch(`${authConfig.apiBaseUrl}/jetson/enroll-image`, {
            method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: imgForm,
          });
          const jd = await jetsonResp.json().catch(() => ({}));
          if (jd?.embedding?.length === 512) { embedding = jd.embedding; confidence = jd.confidence || 0.8; }
        }
        let resp: Response;
        if (embedding) {
          resp = await fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/enroll-face-direct`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ embedding, confidence, source: 'webcam' }),
          });
        } else {
          const form = new FormData();
          form.append('photo', new File([blob], 'webcam.jpg', { type: 'image/jpeg' }));
          resp = await fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/enroll-face`, {
            method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: form,
          });
        }
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.message || data.error || `Upload failed (${resp.status})`);
        const s: EnrollmentStatus = { enrolled: true, embeddingCount: data.embeddingCount || 1, embeddings: data.embeddings || [] };
        setStatus(s); setIsEnrolled(true); setPanelState('success');
        toast.success(`${employeeName} enrolled via webcam`);
        onEnrolled?.(s);
      } catch (e: any) {
        setPanelState('error');
        setErrorMessage(e?.message || 'Webcam enrollment failed');
        toast.error('Enrollment failed', { description: e?.message });
      }
    }, 'image/jpeg', 0.95);
  };

  // ── 5-angle capture ────────────────────────────────────────────────────────
  const startMultiCapture = async () => {
    setCaptureStep(0);
    setCapturedBlobs([null, null, null, null, null]);
    setCapturedThumbs(prev => { prev.forEach(u => { if (u) URL.revokeObjectURL(u); }); return [null, null, null, null, null]; });
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      setStream(media);
      setPanelState('multi-capture');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (videoRef.current) { videoRef.current.srcObject = media; videoRef.current.play().catch(() => {}); }
      }));
    } catch {
      toast.error('Webcam unavailable', { description: 'Allow camera access in browser settings.' });
    }
  };

  const captureCurrentAngle = () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob) return;
      const thumbUrl = URL.createObjectURL(blob);
      setCapturedBlobs(prev => { const n = [...prev]; n[captureStep] = blob; return n; });
      setCapturedThumbs(prev => {
        const n = [...prev];
        if (n[captureStep]) URL.revokeObjectURL(n[captureStep]!);
        n[captureStep] = thumbUrl;
        return n;
      });
      if (captureStep < 4) {
        setCaptureStep(s => s + 1);
      } else {
        // All 5 captured — stop webcam and show review
        stopStream();
        setPanelState('multi-review');
      }
    }, 'image/jpeg', 0.95);
  };

  const retakeAngle = (idx: number) => {
    setCapturedBlobs(prev => { const n = [...prev]; n[idx] = null; return n; });
    setCapturedThumbs(prev => {
      const n = [...prev];
      if (n[idx]) URL.revokeObjectURL(n[idx]!);
      n[idx] = null;
      return n;
    });
    setCaptureStep(idx);
    // Restart webcam if needed
    if (!stream) {
      navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } })
        .then(media => {
          setStream(media);
          setPanelState('multi-capture');
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (videoRef.current) { videoRef.current.srcObject = media; videoRef.current.play().catch(() => {}); }
          }));
        }).catch(() => toast.error('Webcam unavailable'));
    } else {
      setPanelState('multi-capture');
    }
  };

  const submitAllAngles = async () => {
    if (authConfig.mode === 'mock') {
      const s: EnrollmentStatus = { enrolled: true, embeddingCount: 5, embeddings: [] };
      setIsEnrolled(true); setStatus(s); setPanelState('success'); onEnrolled?.(s);
      return;
    }
    setPanelState('multi-submitting');
    setSubmitProgress(0);
    let successCount = 0;
    let firstError = '';
    for (let i = 0; i < 5; i++) {
      const blob = capturedBlobs[i];
      if (!blob) { setSubmitProgress(i + 1); continue; }
      try {
        const form = new FormData();
        form.append('photo', new File([blob], `${ANGLES[i].id}.jpg`, { type: 'image/jpeg' }));
        form.append('angle', ANGLES[i].id);
        const resp = await fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/enroll-face`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
          body: form,
        });
        if (resp.ok) {
          successCount++;
        } else {
          const d = await resp.json().catch(() => ({}));
          const msg = d.message || d.error || `HTTP ${resp.status}`;
          if (!firstError) firstError = `${ANGLES[i].label}: ${msg}`;
          toast.warning(`${ANGLES[i].label} angle skipped`, { description: msg });
        }
      } catch (e: any) {
        const msg = e?.message || 'Network error';
        if (!firstError) firstError = `${ANGLES[i].label}: ${msg}`;
      }
      setSubmitProgress(i + 1);
    }

    if (successCount > 0) {
      const statusResp = await fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/enroll-face`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }).catch(() => null);
      const statusData = statusResp?.ok ? await statusResp.json().catch(() => null) : null;
      const s: EnrollmentStatus = statusData
        ? { enrolled: true, embeddingCount: statusData.embeddingCount || successCount, embeddings: statusData.embeddings || [] }
        : { enrolled: true, embeddingCount: successCount, embeddings: [] };
      setIsEnrolled(true); setStatus(s); setPanelState('success'); onEnrolled?.(s);
      toast.success(`${employeeName} enrolled`, { description: `${successCount}/5 angles stored` });
    } else {
      const hint = firstError.toLowerCase().includes('no face')
        ? 'Face not detected — ensure good lighting and look directly at the camera for each capture.'
        : firstError || 'All angle submissions failed.';
      setErrorMessage(hint);
      setPanelState('error');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const cardCn = cn('border rounded-xl p-4 space-y-4',
    lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-900 dark:border-border');

  const currentAngle = ANGLES[captureStep];
  const AngleIcon = currentAngle?.Icon;

  return (
    <div className="space-y-4">
      {/* Enrolled status bar */}
      {isEnrolled && panelState === 'idle' && (
        <div className={cn('p-3 rounded-lg border flex items-start gap-3',
          lightTheme.background.secondary, lightTheme.border.default, 'dark:bg-slate-900/40 dark:border-border')}>
          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className={cn('text-xs font-bold', lightTheme.text.primary, 'dark:text-white')}>Face enrolled</p>
              {enrollmentQuality && (
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-semibold', enrollmentQuality.color)}>
                  {enrollmentQuality.label}
                </span>
              )}
            </div>
            <p className={cn('text-[11px]', lightTheme.text.muted, 'dark:text-slate-500')}>
              {status?.embeddingCount ?? 1} angle(s) · {status?.embeddings ? (status.embeddings.reduce((sum, e) => sum + (e.qualityScore || 0), 0) / status.embeddings.length * 100).toFixed(0) : 0}% avg quality
              {primaryEmbedding?.enrolledAt ? ` · ${new Date(primaryEmbedding.enrolledAt).toLocaleDateString()}` : ''}
            </p>
            {status?.embeddings && status.embeddings.some(e => e.photoUrl) && (
              <div className="flex gap-1 mt-2">
                {status.embeddings.filter(e => e.photoUrl).slice(0, 5).map((emb, idx) => {
  // Calculate quality badge color
  const quality = emb.qualityScore || 0;
  const qualityClass = quality >= 0.75 
    ? 'border-green-500 border-2' 
    : quality >= 0.60 
    ? 'border-yellow-500 border-2' 
    : 'border-red-500 border-2';
  
  return (
    <div key={emb.id} className="relative">
      <img
        src={`http://172.20.100.222:8080${emb.photoUrl}`}
        alt={emb.angle || 'face'}
        className={cn(
          "w-12 h-12 rounded object-cover hover:scale-110 transition-transform cursor-pointer",
          qualityClass
        )}
        title={`${emb.angle || 'unknown'} · ${(quality * 100).toFixed(0)}%${emb.isPrimary ? ' · Primary' : ''}`}
        onClick={() => {
          setPhotoViewerIndex(idx);
          setPhotoViewerOpen(true);
        }}
      />
      {emb.isPrimary && (
        <div className="absolute -top-1 -right-1 bg-yellow-400 rounded-full p-0.5">
          <svg className="w-2.5 h-2.5 text-yellow-900" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </div>
      )}
    </div>
  );
})}
            
            {/* Smart Recommendations */}
            {recommendations.length > 0 && (
              <div className="mt-2 space-y-1">
                {recommendations.map((rec, idx) => {
                  const Icon = rec.icon;
                  const colorClass = rec.type === 'success' 
                    ? 'text-green-700 dark:text-green-400' 
                    : rec.type === 'warning' 
                    ? 'text-yellow-700 dark:text-yellow-400' 
                    : 'text-blue-700 dark:text-blue-400';
                  
                  return (
                    <div key={idx} className="flex items-start gap-1.5">
                      <Icon className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', colorClass)} />
                      <span className={cn('text-[11px] font-medium', colorClass)}>
                        {rec.message}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
              </div>
            )}
            
            {/* Quality Analysis Panel */}
            {analysis && status?.embeddings && status.embeddings.length > 0 && (
              <div className="mt-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded text-[11px] space-y-1">
                {analysis.excellent.length > 0 && (
                  <div className="flex items-start gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-600 mt-0.5 shrink-0" />
                    <span className="text-green-700 dark:text-green-400 font-medium">
                      Excellent: {analysis.excellent.map(e => `${e.angle} (${((e.qualityScore || 0) * 100).toFixed(0)}%)`).join(', ')}
                    </span>
                  </div>
                )}
                
                {analysis.needsImprovement.length > 0 && (
                  <div className="flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 text-yellow-600 mt-0.5 shrink-0" />
                    <span className="text-yellow-700 dark:text-yellow-400 font-medium">
                      Needs improvement: {analysis.needsImprovement.map(e => `${e.angle} (${((e.qualityScore || 0) * 100).toFixed(0)}%)`).join(', ')}
                    </span>
                  </div>
                )}
                
                {analysis.missingAngles.length > 0 && (
                  <div className="flex items-start gap-1">
                    <Info className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
                    <span className="text-slate-600 dark:text-slate-400">
                      Missing angles: {analysis.missingAngles.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            )}
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
          {/* Jetson camera */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {jetsonOnline === true  && <Wifi    className="w-3.5 h-3.5 text-emerald-500" />}
              {jetsonOnline === false && <WifiOff className="w-3.5 h-3.5 text-red-400" />}
              {jetsonOnline === null  && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
              <span className={cn('text-xs font-semibold',
                jetsonOnline === true ? 'text-emerald-600 dark:text-emerald-400' :
                jetsonOnline === false ? 'text-red-500 dark:text-red-400' : 'text-slate-400')}>
                Jetson Runner {jetsonOnline === true ? '· Online' : jetsonOnline === false ? '· Offline' : '· Checking...'}
              </span>
              <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={checkJetson}>
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
            <Button className="w-full" disabled={jetsonOnline !== true} onClick={startJetsonMulti}>
              <ScanFace className="w-4 h-4 mr-2" />
              {isEnrolled ? 'Re-Enroll: 5-Angle Camera' : 'Enroll from Camera (5 Angles)'}
            </Button>
            {jetsonOnline === false && (
              <p className="text-[11px] text-red-500 dark:text-red-400">
                On Jetson: <code className="font-mono bg-red-50 dark:bg-red-900/20 px-1 rounded">sudo systemctl start frs-runner</code>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-700" />
            <span className="text-xs text-slate-400 shrink-0">or use browser camera</span>
            <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-700" />
          </div>

          <div className="space-y-3">
            {/* 5-angle capture — recommended */}
            <Button
              className="w-full bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
              disabled={jetsonOnline === false}
              onClick={startMultiCapture}
            >
              <ScanFace className="w-4 h-4 mr-2" />
              {isEnrolled ? 'Re-Enroll: 5-Angle Capture' : 'Enroll with 5-Angle Capture'}
              <span className="ml-2 text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">Recommended</span>
            </Button>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={jetsonOnline === false} onClick={() => inputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />Upload Photo
              </Button>
              <Button variant="outline" size="sm" disabled={jetsonOnline === false} onClick={startWebcam}>
                <Camera className="w-4 h-4 mr-2" />Single Webcam
              </Button>
            </div>

            {jetsonOnline === false ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900/40 px-3 py-2">
                <WifiOff className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400">Jetson AI runner required for all enrollment paths</p>
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                    On the Jetson: <code className="font-mono bg-red-100 dark:bg-red-900/40 px-1 rounded">sudo systemctl start frs-runner</code>
                  </p>
                </div>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300 px-3 py-1 rounded-full">
                <Info className="w-3 h-3" />
                One face · Good lighting · No sunglasses
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Jetson 5-angle wizard ── */}
      {(panelState === 'jetson-multi' || panelState === 'jetson-multi-done') && (() => {
        const step = panelState === 'jetson-multi-done' ? 4 : jetsonStep;
        const current = ANGLES[step];
        const CurIcon = current.Icon;
        const allDone = panelState === 'jetson-multi-done';

        return (
          <div className={cardCn}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Jetson Camera · 5-Angle Capture
              </span>
              <span className="text-xs font-bold text-blue-500">
                {jetsonResults.filter(r => r.done).length} / 5
              </span>
            </div>

            {/* Progress bar */}
            <div className="flex gap-1.5">
              {ANGLES.map((a, i) => (
                <div key={a.id} className={cn(
                  'flex-1 h-1.5 rounded-full transition-all',
                  jetsonResults[i]?.done ? 'bg-emerald-500' :
                  i === jetsonStep && !allDone ? 'bg-blue-500 animate-pulse' :
                  'bg-slate-200 dark:bg-slate-700'
                )} />
              ))}
            </div>

            {/* Current angle instruction (only while capturing) */}
            {!allDone && (
              <div className="flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/40">
                {CurIcon
                  ? <CurIcon className="w-7 h-7 text-blue-500 shrink-0" />
                  : <ScanFace className="w-7 h-7 text-blue-500 shrink-0" />
                }
                <div>
                  <p className="text-sm font-bold text-blue-800 dark:text-blue-200">{current.label}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-300">{current.hint}</p>
                </div>
              </div>
            )}

            {/* Frame grid — shows captured frames one by one */}
            <div className="grid grid-cols-5 gap-2">
              {ANGLES.map((a, i) => {
                const result = jetsonResults[i];
                const isActive = i === jetsonStep && !allDone;
                const AIco = a.Icon;
                return (
                  <div key={a.id} className="space-y-1">
                    <div className={cn(
                      'relative w-full aspect-square rounded-lg border-2 overflow-hidden flex items-center justify-center',
                      result?.done
                        ? 'border-emerald-500'
                        : isActive
                          ? 'border-blue-400 border-dashed animate-pulse'
                          : 'border-slate-200 dark:border-slate-700 border-dashed'
                    )}>
                      {result?.done && result.frame ? (
                        <img
                          src={result.frame}
                          alt={a.label}
                          className="w-full h-full object-cover"
                        />
                      ) : result?.done ? (
                        /* No frame returned — show checkmark */
                        <div className="flex flex-col items-center gap-0.5">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          <span className="text-[9px] text-emerald-600 font-bold">OK</span>
                        </div>
                      ) : isActive && jetsonCapturing ? (
                        <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                      ) : isActive ? (
                        <div className="flex flex-col items-center gap-0.5">
                          {AIco ? <AIco className="w-5 h-5 text-blue-400" /> : <Camera className="w-5 h-5 text-blue-400" />}
                          <span className="text-[9px] text-blue-400 font-bold">Ready</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300 dark:text-slate-600 font-bold">{i + 1}</span>
                      )}
                    </div>
                    <p className="text-[9px] text-center text-slate-400 font-medium uppercase">{a.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Action buttons */}
            {allDone ? (
              <div className="flex gap-2">
                <Button className="flex-1" onClick={finishJetsonEnroll}>
                  <CheckCircle2 className="w-4 h-4 mr-2" />Complete Enrollment
                </Button>
                <Button variant="outline" onClick={startJetsonMulti}>
                  <RefreshCw className="w-3 h-3 mr-1" />Redo
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={jetsonCapturing}
                  onClick={() => captureJetsonAngle(jetsonStep)}
                >
                  {jetsonCapturing
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Capturing…</>
                    : <><Camera className="w-4 h-4 mr-2" />Capture {current.label}</>
                  }
                </Button>
                <Button variant="outline" size="sm" onClick={() => { resetToIdle(); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}

            {jetsonCapturing && (
              <p className="text-[11px] text-slate-400 text-center">
                Jetson: ISAPI snapshot → YOLOv8 → ArcFace… (up to 30s)
              </p>
            )}
          </div>
        );
      })()}

      {/* Single webcam */}
      {panelState === 'selecting' && (
        <div className={cardCn}>
          <div className="relative overflow-hidden rounded-lg">
            <video ref={videoRef} className="w-full rounded-lg" autoPlay muted playsInline onLoadedMetadata={() => videoRef.current?.play()} />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-48 h-64 border-2 border-emerald-400/70 rounded-full bg-emerald-500/5" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={captureWebcam}><Camera className="w-4 h-4 mr-2" />Capture</Button>
            <Button variant="outline" className="flex-1" onClick={() => { stopStream(); resetToIdle(); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* 5-angle capture wizard */}
      {panelState === 'multi-capture' && (
        <div className={cardCn}>
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">5-Angle Capture</span>
            <span className="text-xs font-bold text-blue-500">{captureStep + 1} / 5</span>
          </div>
          <div className="flex gap-1.5 mb-3">
            {ANGLES.map((a, i) => (
              <div key={a.id} className={cn(
                'flex-1 h-1.5 rounded-full transition-all',
                i < captureStep ? 'bg-emerald-500' : i === captureStep ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-700'
              )} />
            ))}
          </div>

          {/* Angle instruction */}
          <div className="flex items-center justify-center gap-3 py-2 px-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/40 mb-2">
            {AngleIcon
              ? <AngleIcon className="w-6 h-6 text-blue-500 shrink-0" />
              : <ScanFace className="w-6 h-6 text-blue-500 shrink-0" />
            }
            <div>
              <p className="text-sm font-bold text-blue-800 dark:text-blue-200">{currentAngle.label}</p>
              <p className="text-xs text-blue-600 dark:text-blue-300">{currentAngle.hint}</p>
            </div>
          </div>

          {/* Camera feed */}
          <div className="relative overflow-hidden rounded-lg">
            <video ref={videoRef} className="w-full rounded-lg" autoPlay muted playsInline onLoadedMetadata={() => videoRef.current?.play()} />
            {/* Face oval overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className={cn(
                'w-44 h-60 border-2 rounded-full',
                captureStep === 0 ? 'border-blue-400/80 bg-blue-500/5' : 'border-emerald-400/60 bg-emerald-500/5'
              )} />
            </div>
            {/* Tip overlay */}
            <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex justify-center">
              <span className="text-[10px] text-white/80 bg-black/40 rounded px-2 py-0.5">
                Fill the oval · good lighting · {captureStep === 0 ? 'face camera directly' : currentAngle.hint}
              </span>
            </div>
            {/* Direction arrow overlay */}
            {AngleIcon && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <AngleIcon className="w-16 h-16 text-white/50 drop-shadow-lg" />
              </div>
            )}
          </div>

          {/* Thumbnail strip of captured angles */}
          <div className="flex gap-1.5 mt-1">
            {ANGLES.map((a, i) => (
              <div key={a.id} className="flex-1 space-y-1">
                {capturedThumbs[i] ? (
                  <img src={capturedThumbs[i]!} alt={a.label}
                    className="w-full aspect-square object-cover rounded border-2 border-emerald-500" />
                ) : (
                  <div className={cn(
                    'w-full aspect-square rounded border-2 flex items-center justify-center',
                    i === captureStep
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50'
                  )}>
                    <span className="text-[10px] text-slate-400">{i + 1}</span>
                  </div>
                )}
                <p className="text-[9px] text-center text-slate-400 font-medium uppercase">{a.label}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-2">
            <Button className="flex-1" onClick={captureCurrentAngle}>
              <Camera className="w-4 h-4 mr-2" />Capture {currentAngle.label}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { stopStream(); resetToIdle(); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 5-angle review */}
      {panelState === 'multi-review' && (
        <div className={cardCn}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800 dark:text-white">Review Captures</p>
            <span className="text-xs text-emerald-600 font-semibold">All 5 angles captured</span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {ANGLES.map((a, i) => (
              <div key={a.id} className="space-y-1">
                <div className="relative">
                  {capturedThumbs[i] ? (
                    <img src={capturedThumbs[i]!} alt={a.label}
                      className="w-full aspect-square object-cover rounded-lg border-2 border-emerald-500" />
                  ) : (
                    <div className="w-full aspect-square rounded-lg border-2 border-dashed border-red-300 bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    </div>
                  )}
                  <button
                    onClick={() => retakeAngle(i)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-slate-700 hover:bg-blue-600 text-white rounded-full flex items-center justify-center transition-colors"
                    title={`Retake ${a.label}`}
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                  </button>
                </div>
                <p className="text-[10px] text-center text-slate-500 font-medium uppercase">{a.label}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400">
            Click <RefreshCw className="w-3 h-3 inline" /> on any thumbnail to retake that angle.
          </p>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={submitAllAngles}>
              <ScanFace className="w-4 h-4 mr-2" />Enroll All 5 Angles
            </Button>
            <Button variant="outline" onClick={() => { setCaptureStep(0); startMultiCapture(); }}>
              Retake All
            </Button>
          </div>
        </div>
      )}

      {/* Submitting all angles */}
      {panelState === 'multi-submitting' && (
        <div className={cardCn}>
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
            <div>
              <p className={cn('text-sm font-medium', lightTheme.text.primary, 'dark:text-white')}>
                Enrolling angle {submitProgress + 1} / 5…
              </p>
              <p className={cn('text-xs', lightTheme.text.muted, 'dark:text-slate-400')}>
                Running face detection and ArcFace embedding for each angle
              </p>
            </div>
          </div>
          <Progress value={(submitProgress / 5) * 100} className="h-2" />
          <div className="flex gap-1">
            {ANGLES.map((a, i) => (
              <div key={a.id} className={cn(
                'flex-1 flex flex-col items-center gap-1',
              )}>
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[10px]',
                  i < submitProgress ? 'bg-emerald-500 text-white' :
                  i === submitProgress ? 'bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-500 text-blue-600' :
                  'bg-slate-100 dark:bg-slate-800 text-slate-400'
                )}>
                  {i < submitProgress ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className="text-[9px] text-slate-400 uppercase">{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Single photo preview */}
      {panelState === 'preview' && previewUrl && (
        <div className={cardCn}>
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

      {/* Processing */}
      {(panelState === 'uploading' || panelState === 'enrolling-cam') && (
        <div className={cardCn}>
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
          <Button variant="outline" size="sm" onClick={resetToIdle}>Add More Angles</Button>
        </div>
      )}

      {/* Error */}
      {panelState === 'error' && (
        <div className="space-y-3">
          {duplicateOf ? (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-bold">Duplicate face detected</p>
                <p className="text-xs mt-0.5">
                  This face is already enrolled as <strong>{duplicateOf.name}</strong>. Each person can only have one face profile.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="text-sm">{errorMessage || 'Enrollment failed. Try again.'}</span>
            </div>
          )}
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
      
      {/* Photo Viewer Modal */}
      {photoViewerOpen && status?.embeddings && (
        <PhotoViewerModal
          photos={status.embeddings.filter((e): e is EnrollmentEmbedding & Required<Pick<EnrollmentEmbedding, 'photoUrl'>> => Boolean(e?.photoUrl)) as any[]}
          initialIndex={photoViewerIndex}
          onClose={() => setPhotoViewerOpen(false)}
onDelete={async (id, angle) => {
  if (!confirm(`Delete ${angle || 'this'} photo? This will reduce enrollment quality.`)) {
    return;
  }
  
  try {
    console.log('Delete - getToken():', getToken());
    console.log('Delete - employeeId:', employeeId);
    console.log('Delete - embeddingId:', id);
    const response = await fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/embeddings/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to delete embedding');
    }
    
    const data = await response.json();
    
    // Close modal
    setPhotoViewerOpen(false);
    
    // Refresh enrollment status
    const statusResp = await fetch(`${authConfig.apiBaseUrl}/employees/${employeeId}/enroll-face`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const statusData = statusResp.ok ? await statusResp.json() : null;
    const newStatus: EnrollmentStatus = statusData 
      ? { enrolled: !!statusData.enrolled, embeddingCount: statusData.embeddingCount || 0, embeddings: statusData.embeddings || [] }
      : { enrolled: false, embeddingCount: 0, embeddings: [] };
    setStatus(newStatus);
    setIsEnrolled(newStatus.enrolled);
    onEnrolled?.(newStatus);
    
    toast.success('Photo deleted successfully');
    
  } catch (error) {
    console.error('Delete failed:', error);
    alert('Failed to delete photo. Please try again.');
  }
}}
        />
      )}
    </div>
  );
};
