import React, { useState, useEffect, useRef } from 'react';
import { Camera, CheckCircle2, XCircle, Loader2, RefreshCw, ChevronRight } from 'lucide-react';
import { cn } from '../ui/utils';
import { authConfig } from '../../config/authConfig';
import { Button } from '../ui/button';
import { toast } from 'sonner';

const ANGLES = [
  { id: 'front', label: 'Front', hint: 'Look straight at the camera', Icon: Camera },
  { id: 'left', label: 'Left', hint: 'Turn your face to the left', Icon: Camera },
  { id: 'right', label: 'Right', hint: 'Turn your face to the right', Icon: Camera },
  { id: 'up', label: 'Up', hint: 'Tilt your head up', Icon: Camera },
  { id: 'down', label: 'Down', hint: 'Tilt your head down', Icon: Camera }
];

interface EnrollmentData {
  employeeName: string;
  employeeCode: string;
  status: string;
}

export const SelfEnrollmentPortal: React.FC<{ token: string }> = ({ token }) => {
  const [step, setStep] = useState<'loading' | 'welcome' | 'capture' | 'review' | 'complete' | 'error'>('loading');
  const [enrollmentData, setEnrollmentData] = useState<EnrollmentData | null>(null);
  const [currentAngleIndex, setCurrentAngleIndex] = useState(0);
  const [capturedPhotos, setCapturedPhotos] = useState<{ [key: string]: { blob: Blob; url: string; quality?: number } }>({});
  const [capturing, setCapturing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [consent, setConsent] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  useEffect(() => {
    validateToken();
    
    return () => {
      stopCamera();
    };
  }, []);
  
  const validateToken = async () => {
    try {
      const response = await fetch(`${authConfig.apiBaseUrl}/enroll/${token}`);
      
      if (response.ok) {
        const data = await response.json();
        setEnrollmentData(data);
        
        if (data.status === 'completed') {
          setStep('error');
          setErrorMessage('This enrollment link has already been completed.');
        } else if (data.status === 'expired') {
          setStep('error');
          setErrorMessage('This enrollment link has expired. Please contact HR for a new link.');
        } else {
          setStep('welcome');
        }
      } else {
        setStep('error');
        setErrorMessage('Invalid or expired enrollment link.');
      }
    } catch (err) {
      setStep('error');
      setErrorMessage('Failed to validate enrollment link. Please check your internet connection.');
    }
  };
  
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
      }
    } catch (err) {
      console.error('Camera access error:', err);
      toast.error('Camera access denied', {
        description: 'Please allow camera access to continue enrollment'
      });
    }
  };
  
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };
  
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setCapturing(true);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) return;
    
    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw video frame to canvas
    context.drawImage(video, 0, 0);
    
    // Convert to blob
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setCapturing(false);
        toast.error('Failed to capture photo');
        return;
      }
      
      const url = URL.createObjectURL(blob);
      const angle = ANGLES[currentAngleIndex].id;
      
      // Upload photo immediately and get quality score
      try {
        const formData = new FormData();
        formData.append('photo', blob, `${angle}.jpg`);
        formData.append('angle', angle);
        
        const response = await fetch(`${authConfig.apiBaseUrl}/enroll/${token}/upload-angle`, {
          method: 'POST',
          body: formData
        });
        
        if (response.ok) {
          const data = await response.json();
          
          setCapturedPhotos(prev => ({
            ...prev,
            [angle]: { blob, url, quality: data.quality }
          }));
          
          // Show quality feedback
          const qualityPercent = Math.round(data.quality * 100);
          if (qualityPercent >= 70) {
            toast.success(`Good capture! Quality: ${qualityPercent}%`);
          } else if (qualityPercent >= 60) {
            toast.info(`Acceptable. Quality: ${qualityPercent}%`, {
              description: 'You can retake for better quality'
            });
          } else {
            toast.warning(`Low quality: ${qualityPercent}%`, {
              description: 'Please retake in better lighting'
            });
          }
        } else {
          throw new Error('Upload failed');
        }
      } catch (err) {
        console.error('Upload error:', err);
        toast.error('Failed to upload photo');
      } finally {
        setCapturing(false);
      }
    }, 'image/jpeg', 0.9);
  };
  
  const handleNext = () => {
    if (currentAngleIndex < ANGLES.length - 1) {
      setCurrentAngleIndex(currentAngleIndex + 1);
    } else {
      stopCamera();
      setStep('review');
    }
  };
  
  const handleRetake = () => {
    const angle = ANGLES[currentAngleIndex].id;
    if (capturedPhotos[angle]) {
      URL.revokeObjectURL(capturedPhotos[angle].url);
      const newPhotos = { ...capturedPhotos };
      delete newPhotos[angle];
      setCapturedPhotos(newPhotos);
    }
  };
  
  const handleStartEnrollment = async () => {
    if (!consent) {
      toast.error('Please accept the consent to continue');
      return;
    }
    
    setStep('capture');
    await startCamera();
  };
  
  const handleComplete = async () => {
    try {
      const response = await fetch(`${authConfig.apiBaseUrl}/enroll/${token}/complete`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setStep('complete');
      } else {
        throw new Error('Completion failed');
      }
    } catch (err) {
      toast.error('Failed to complete enrollment');
    }
  };
  
  const currentAngle = ANGLES[currentAngleIndex];
  const currentPhoto = capturedPhotos[currentAngle.id];
  const allCaptured = ANGLES.every(a => capturedPhotos[a.id]);
  
  // Loading state
  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Validating enrollment link...</p>
        </div>
      </div>
    );
  }
  
  // Error state
  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">Enrollment Error</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">{errorMessage}</p>
          <p className="text-sm text-slate-500">
Need help? Contact HR at <a href="mailto:hr@company.com" className="text-blue-500 underline">hr@company.com</a>
          </p>
        </div>
      </div>
    );
  }
  
  // Welcome state
  if (step === 'welcome') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="max-w-2xl w-full bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">
              Welcome, {enrollmentData?.employeeName}!
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              You've been invited to complete your face enrollment for the attendance system.
            </p>
          </div>
          
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">📸 What you'll need:</p>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                <li>A device with camera (phone or laptop)</li>
                <li>2-3 minutes in a well-lit area</li>
                <li>Remove glasses/mask temporarily</li>
              </ul>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-4 rounded">
              <p className="text-sm font-semibold text-green-800 dark:text-green-200 mb-2">🎯 The process:</p>
              <p className="text-sm text-green-700 dark:text-green-300 mb-2">
                We'll guide you through capturing 5 photos from different angles:
              </p>
              <p className="text-sm font-bold text-green-800 dark:text-green-200">
                Front, Left, Right, Up, Down
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                This takes about 2 minutes and ensures accurate recognition.
              </p>
            </div>
            
            <div className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 p-4 rounded">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  I consent to providing my facial data for attendance tracking purposes. 
                  I understand this data will be used solely for identity verification within the attendance system.
                </span>
              </label>
            </div>
            
            <div className="flex gap-3">
              <Button
                onClick={handleStartEnrollment}
                disabled={!consent}
                className="flex-1"
              >
                Start Enrollment
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Capture state
  if (step === 'capture') {
    return (
      <div className="min-h-screen bg-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">
              Step {currentAngleIndex + 1} of 5: {currentAngle.label} Face
            </h2>
            <p className="text-slate-300">{currentAngle.hint}</p>
          </div>
          
          {/* Progress */}
          <div className="flex gap-2 mb-6">
            {ANGLES.map((a, i) => (
              <div
                key={a.id}
                className={cn(
                  'flex-1 h-2 rounded-full transition-all',
                  capturedPhotos[a.id] ? 'bg-green-500' :
                  i === currentAngleIndex ? 'bg-blue-500' :
                  'bg-slate-700'
                )}
              />
            ))}
          </div>
          
          {/* Camera Preview */}
          <div className="bg-black rounded-lg overflow-hidden mb-6 relative aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Overlay guide */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-80 border-4 border-white/50 rounded-full" />
            </div>
          </div>
          
          {/* Controls */}
          <div className="flex gap-3 justify-center">
            {currentPhoto ? (
              <>
                <Button variant="outline" onClick={handleRetake}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retake
                </Button>
                <Button onClick={handleNext} className="min-w-[200px]">
                  {currentAngleIndex < ANGLES.length - 1 ? (
                    <>Next Angle <ChevronRight className="w-4 h-4 ml-2" /></>
                  ) : (
                    <>Review Photos <ChevronRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </>
            ) : (
              <Button
                onClick={capturePhoto}
                disabled={capturing || !cameraActive}
                size="lg"
                className="min-w-[200px]"
              >
                {capturing ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Capturing...</>
                ) : (
                  <><Camera className="w-5 h-5 mr-2" />Capture Photo</>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  // Review state
  if (step === 'review') {
    const avgQuality = ANGLES.reduce((sum, a) => sum + (capturedPhotos[a.id]?.quality || 0), 0) / ANGLES.length;
    
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-6 text-center">
              Review Your Photos
            </h2>
            
            <div className="grid grid-cols-5 gap-4 mb-6">
              {ANGLES.map((angle) => {
                const photo = capturedPhotos[angle.id];
                const quality = photo?.quality ? Math.round(photo.quality * 100) : 0;
                
                return (
                  <div key={angle.id} className="text-center">
                    <div className="aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 mb-2">
                      {photo && (
                        <img src={photo.url} alt={angle.label} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{angle.label}</p>
                    <p className={cn(
                      'text-xs font-semibold',
                      quality >= 70 ? 'text-green-600' : quality >= 60 ? 'text-yellow-600' : 'text-red-600'
                    )}>
                      {quality}%
                    </p>
                  </div>
                );
              })}
            </div>
            
            <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4 mb-6 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">Average Quality</p>
              <p className="text-3xl font-bold text-slate-800 dark:text-white">
                {Math.round(avgQuality * 100)}%
              </p>
            </div>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setStep('capture');
                  setCurrentAngleIndex(0);
                  startCamera();
                }}
              >
                Retake All
              </Button>
              <Button
                className="flex-1"
                onClick={handleComplete}
                disabled={!allCaptured}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Submit Enrollment
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Complete state
  if (step === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">
            Enrollment Complete!
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            All 5 photos captured successfully. Your enrollment is now pending HR approval.
          </p>
          <p className="text-sm text-slate-500">
            You'll receive an email once your enrollment is approved.
          </p>
        </div>
      </div>
    );
  }
  
  return null;
};
