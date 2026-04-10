import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Eye, RefreshCw, Calendar, User } from 'lucide-react';
import { cn } from '../ui/utils';
import { authConfig } from '../../config/authConfig';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { Button } from '../ui/button';
import { toast } from 'sonner';

interface PendingApproval {
  pk_invitation_id: number;
  fk_employee_id: number;
  employee_code: string;
  full_name: string;
  email: string;
  average_quality: number;
  quality_scores: { [angle: string]: number };
  photo_paths: { [angle: string]: string };
  completed_at: string;
  approval_status: string;
  device_info?: any;
}

export const PendingEnrollmentApprovals: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
const [actionLoading, setActionLoading] = useState(false);
  
  const [photoData, setPhotoData] = useState<{ [key: string]: string }>({});
  
  useEffect(() => {
    loadPendingApprovals();
  }, []);
  
  useEffect(() => {
    // Load photos for all approvals
    approvals.forEach(approval => {
      Object.values(approval.photo_paths || {}).forEach(photoPath => {
        const filename = photoPath.split('/').pop();
        if (filename && !photoData[filename]) {
          fetchPhoto(filename);
        }
      });
    });
  }, [approvals]);
  
  const loadPendingApprovals = async () => {
    if (!accessToken) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${authConfig.apiBaseUrl}/enroll/pending-approvals`, {
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          ...scopeHeaders
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setApprovals(data.pendingApprovals || []);
      }
    } catch (err) {
      console.error('Failed to load pending approvals:', err);
      toast.error('Failed to load pending approvals');
    } finally {
      setLoading(false);
    }
  };
  
  const handleApprove = async (invitationId: number) => {
    if (!window.confirm('Approve this enrollment? This will create face embeddings for the employee.')) {
      return;
    }
    
    setActionLoading(true);
    try {
      const response = await fetch(
        `${authConfig.apiBaseUrl}/enroll/invitations/${invitationId}/approve`,
        {
          method: 'POST',
          headers: { 
            Authorization: `Bearer ${accessToken}`,
            ...scopeHeaders
          }
        }
      );
      
      if (response.ok) {
        toast.success('Enrollment approved! Embeddings created.');
        setSelectedApproval(null);
        await loadPendingApprovals();
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Approval failed');
      }
    } catch (err: any) {
      toast.error('Failed to approve enrollment', { description: err.message });
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleReject = async (invitationId: number) => {
    const reason = window.prompt('Reason for rejection (optional):');
    if (reason === null) return; // User cancelled
    
    setActionLoading(true);
    try {
      const response = await fetch(
        `${authConfig.apiBaseUrl}/enroll/invitations/${invitationId}/reject`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            ...scopeHeaders
          },
          body: JSON.stringify({ reason: reason || 'Poor photo quality' })
        }
      );
      
      if (response.ok) {
        toast.success('Enrollment rejected');
        setSelectedApproval(null);
        await loadPendingApprovals();
      } else {
        throw new Error('Rejection failed');
      }
    } catch (err) {
      toast.error('Failed to reject enrollment');
    } finally {
      setActionLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="text-center py-8">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
        <p className="text-slate-600 dark:text-slate-400">Loading pending approvals...</p>
      </div>
    );
  }
  
  if (approvals.length === 0) {
    return (
      <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">All caught up!</h3>
        <p className="text-slate-600 dark:text-slate-400">No pending enrollment approvals</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">Pending Approvals</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {approvals.length} enrollment{approvals.length !== 1 ? 's' : ''} awaiting review
          </p>
        </div>
        <Button onClick={loadPendingApprovals} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      {/* Approvals Grid */}
      <div className="grid gap-4">
        {approvals.map((approval) => (
          <div
            key={approval.pk_invitation_id}
            className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-slate-800 dark:text-white">
                    {approval.full_name}
                  </h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {approval.employee_code} • {approval.email}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 flex items-center gap-1 mt-1">
                    <Calendar className="w-3 h-3" />
                    Completed {new Date(approval.completed_at).toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-800 dark:text-white">
                  {Math.round(approval.average_quality * 100)}%
                </div>
                <div className="text-xs text-slate-500">Avg Quality</div>
              </div>
            </div>
            
            {/* Photos Preview */}
            <div className="grid grid-cols-5 gap-2 mb-4">
              {['front', 'left', 'right', 'up', 'down'].map((angle) => {
                const photoPath = approval.photo_paths?.[angle];
                const quality = approval.quality_scores?.[angle];
                
                return (
                  <div key={angle} className="text-center">
                    <div className="aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 mb-1">
                      {photoPath && getPhotoUrl(photoPath) ? (
                        <img
                          src={getPhotoUrl(photoPath)}
                          alt={angle}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 capitalize">
                      {angle}
                    </p>
                    {quality != null && (
                      <p className={cn(
                        'text-xs font-semibold',
                        quality >= 0.75 ? 'text-green-600' : 
                        quality >= 0.60 ? 'text-yellow-600' : 
                        'text-red-600'
                      )}>
                        {Math.round(quality * 100)}%
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <Button
                onClick={() => setSelectedApproval(selectedApproval?.pk_invitation_id === approval.pk_invitation_id ? null : approval)}
                variant="outline"
                size="sm"
              >
                <Eye className="w-4 h-4 mr-2" />
                {selectedApproval?.pk_invitation_id === approval.pk_invitation_id ? 'Hide' : 'View'} Details
              </Button>
              
              <div className="flex-1" />
              
              <Button
                onClick={() => handleReject(approval.pk_invitation_id)}
                variant="outline"
                size="sm"
                disabled={actionLoading}
                className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
              
              <Button
                onClick={() => handleApprove(approval.pk_invitation_id)}
                size="sm"
                disabled={actionLoading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Approve & Create Embeddings
              </Button>
            </div>
            
            {/* Expanded Details */}
            {selectedApproval?.pk_invitation_id === approval.pk_invitation_id && (
              <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <h5 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">
                  Enrollment Details
                </h5>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">Employee ID</p>
                    <p className="font-medium text-slate-800 dark:text-white">{approval.fk_employee_id}</p>
                  </div>
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">Code</p>
                    <p className="font-medium text-slate-800 dark:text-white">{approval.employee_code}</p>
                  </div>
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">Completed</p>
                    <p className="font-medium text-slate-800 dark:text-white">
                      {new Date(approval.completed_at).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">Average Quality</p>
                    <p className="font-medium text-slate-800 dark:text-white">
                      {Math.round(approval.average_quality * 100)}%
                    </p>
                  </div>
                </div>
                
                {approval.device_info && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <p className="text-xs text-slate-500 dark:text-slate-500">
                      Device: {approval.device_info.browser || 'Unknown'} on {approval.device_info.os || 'Unknown'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
