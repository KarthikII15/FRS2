import React, { useState, useEffect } from 'react';
import { Search, Mail, RefreshCw, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { PendingEnrollmentApprovals } from './PendingEnrollmentApprovals';
import { cn } from '../ui/utils';
import { authConfig } from '../../config/authConfig';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { Button } from '../ui/button';
import { toast } from 'sonner';

interface Employee {
  pk_employee_id: number;
  employee_code: string;
  full_name: string;
  email: string;
  phone_number?: string;
  enrolled: boolean;
  embeddingCount: number;
}

interface Invitation {
  pk_invitation_id: number;
  fk_employee_id: number;
  employee_code: string;
  full_name: string;
  email: string;
  status: string;
  display_status: string;
  approval_status: string;
  average_quality?: number;
  sent_at: string;
  expires_at: string;
  opened_at?: string;
  completed_at?: string;
}

export const RemoteEnrollmentManager: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'not_enrolled' | 'all'>('not_enrolled');
  const [activeTab, setActiveTab] = useState<'select' | 'invitations' | 'pending-approvals'>('select');
  
  useEffect(() => {
    loadEmployees();
    loadInvitations();
  }, []);
  
  const loadEmployees = async () => {
    if (!accessToken) {
      console.warn('No access token available');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`${authConfig.apiBaseUrl}/enroll/employees`, {
        headers: { Authorization: `Bearer ${accessToken}`, ...scopeHeaders }
      });

      if (response.ok) {
        const responseData = await response.json();
        setEmployees(responseData.employees || []);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };
  
  const loadInvitations = async () => {
    if (!accessToken) return;
    
    try {
      const response = await fetch(`${authConfig.apiBaseUrl}/enroll/invitations?limit=100`, {
        headers: { Authorization: `Bearer ${accessToken}`, ...scopeHeaders }
      });
      
      if (response.ok) {
        const data = await response.json();
        setInvitations(data.invitations || []);
      }
    } catch (err) {
      console.error('Failed to load invitations:', err);
    }
  };
  
  const handleSelectAll = () => {
    const filtered = getFilteredEmployees();
    if (selectedEmployees.size === filtered.length) {
      setSelectedEmployees(new Set());
    } else {
      setSelectedEmployees(new Set(filtered.map(e => e.pk_employee_id)));
    }
  };
  
  const toggleEmployee = (id: number) => {
    const newSelected = new Set(selectedEmployees);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedEmployees(newSelected);
  };
  
  const getFilteredEmployees = () => {
    let filtered = employees;
    
    // Filter by enrollment status
    if (filterStatus === 'not_enrolled') {
      filtered = filtered.filter(e => !e.enrolled || e.embeddingCount < 5);
    }
    
    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e => 
        e.full_name.toLowerCase().includes(term) ||
        e.employee_code.toLowerCase().includes(term) ||
        e.email?.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  };
  
  const handleSendInvitations = async () => {
    if (selectedEmployees.size === 0) {
      toast.error('Please select at least one employee');
      return;
    }
    
    if (!window.confirm(`Send enrollment invitations to ${selectedEmployees.size} employee(s)?`)) {
      return;
    }
    
    setSending(true);
    try {
      const response = await fetch(`${authConfig.apiBaseUrl}/enroll/send-invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...scopeHeaders
        },
        body: JSON.stringify({
          employeeIds: Array.from(selectedEmployees)
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast.success('Invitations sent!', {
          description: `Sent: ${data.summary.sent}, Failed: ${data.summary.failed}, Skipped: ${data.summary.skipped}`
        });
        
        // Show details if any failed
        if (data.results.failed.length > 0) {
          console.error('Failed invitations:', data.results.failed);
        }
        if (data.results.skipped.length > 0) {
          console.warn('Skipped invitations:', data.results.skipped);
        }
        
        setSelectedEmployees(new Set());
        await loadInvitations();
        setActiveTab('invitations');
      } else {
        throw new Error(data.message || 'Failed to send invitations');
      }
    } catch (err: any) {
      toast.error('Failed to send invitations', { description: err.message });
    } finally {
      setSending(false);
    }
  };
  
  const handleResend = async (invitationId: number) => {
    try {
      const response = await fetch(
        `${authConfig.apiBaseUrl}/enroll/invitations/${invitationId}/resend`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, ...scopeHeaders }
        }
      );

      if (response.ok) {
        toast.success('Invitation resent');
      } else {
        throw new Error('Failed to resend');
      }
    } catch (err) {
      toast.error('Failed to resend invitation');
    }
  };
  
  const getStatusBadge = (status: string) => {
    const badges = {
      pending: { label: 'Pending', class: 'bg-slate-100 text-slate-700', icon: Clock },
      opened: { label: 'Opened', class: 'bg-blue-100 text-blue-700', icon: Mail },
      in_progress: { label: 'In Progress', class: 'bg-yellow-100 text-yellow-700', icon: RefreshCw },
      completed: { label: 'Completed', class: 'bg-green-100 text-green-700', icon: CheckCircle2 },
      expired: { label: 'Expired', class: 'bg-red-100 text-red-700', icon: XCircle },
      approved: { label: 'Approved', class: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 }
    };
    
    const badge = badges[status as keyof typeof badges] || badges.pending;
    const Icon = badge.icon;
    
    return (
      <span className={cn('inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded', badge.class)}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };
  
  const filteredEmployees = getFilteredEmployees();
  
  return (
    <div className="space-y-4 p-6 bg-white dark:bg-slate-900 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Remote Enrollment</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Send enrollment invitations to employees</p>
        </div>
        <Button onClick={loadEmployees} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('select')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'select'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-800'
          )}
        >
          Select Employees
        </button>
        <button
          onClick={() => setActiveTab('invitations')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'invitations'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-800'
          )}
        >
        Invitations ({invitations.length})
        </button>
        <button
          onClick={() => setActiveTab('pending-approvals')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'pending-approvals'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-800'
          )}
        >
          Pending Approvals
        </button>
      </div>
      
      {/* Select Employees Tab */}
      {activeTab === 'select' && (
        <>
          {/* Filters */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, code, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="not_enrolled">Not Enrolled / Incomplete</option>
              <option value="all">All Employees</option>
            </select>
          </div>
          
          {/* Employee List */}
          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No employees found</div>
          ) : (
            <>
              <div className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedEmployees.size === filteredEmployees.length && filteredEmployees.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Select All ({filteredEmployees.length})
                  </span>
                </label>
                
                {selectedEmployees.size > 0 && (
                  <Button onClick={handleSendInvitations} disabled={sending}>
                    <Mail className="w-4 h-4 mr-2" />
                    {sending ? 'Sending...' : `Send to ${selectedEmployees.size} employee(s)`}
                  </Button>
                )}
              </div>
              
              <div className="space-y-2">
                {filteredEmployees.map((employee) => (
                  <label
                    key={employee.pk_employee_id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                      selectedEmployees.has(employee.pk_employee_id)
                        ? 'bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700'
                        : 'bg-white border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedEmployees.has(employee.pk_employee_id)}
                      onChange={() => toggleEmployee(employee.pk_employee_id)}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800 dark:text-white">
                          {employee.full_name}
                        </span>
                        <span className="text-xs text-slate-500">
                          ({employee.employee_code})
                        </span>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        {employee.email || 'No email'}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      {employee.enrolled ? (
                        <span className="text-xs text-green-600 dark:text-green-400">
                          ✓ Enrolled ({employee.embeddingCount}/5)
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">
                          Not enrolled
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </>
      )}
      
      {/* Invitations Tab */}
      {activeTab === 'invitations' && (
        <div className="space-y-3">
          {invitations.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No invitations sent yet</div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">Employee</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">Quality</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">Sent</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {invitations.map((inv) => (
                    <tr key={inv.pk_invitation_id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 dark:text-white">{inv.full_name}</div>
                        <div className="text-xs text-slate-500">{inv.employee_code}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {inv.email}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(inv.display_status)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {inv.average_quality != null ? `${Number(inv.average_quality).toFixed(0)}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(inv.sent_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {(inv.display_status === 'pending' || inv.display_status === 'expired') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResend(inv.pk_invitation_id)}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Resend
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      
      {/* Pending Approvals Tab */}
      {activeTab === 'pending-approvals' && (
        <PendingEnrollmentApprovals />
      )}
    </div>
  );
};
