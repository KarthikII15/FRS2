import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Calendar, Plus, Loader2, RefreshCw, AlertCircle,
  CheckCircle2, XCircle, Clock, User, FileText
} from 'lucide-react';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { useApiData } from '../../hooks/useApiData';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

export const LeaveManagement: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const { employees } = useApiData({ autoRefreshMs: 0 });

  const [leaves, setLeaves]         = useState<any[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [filterStatus, setFilter]   = useState('all');
  const [addOpen, setAddOpen]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState({
    employee_id: '', leave_type: '', start_date: '', end_date: '', reason: '',
  });

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await apiRequest<{ data: any[] }>('/hr/leave', { accessToken, scopeHeaders });
      setLeaves(res.data ?? []);
    } catch (e) { toast.error('Failed to load leave requests'); }
    finally { setIsLoading(false); }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    filterStatus === 'all' ? leaves : leaves.filter(l => l.status === filterStatus),
    [leaves, filterStatus]
  );

  const counts = {
    pending:  leaves.filter(l => l.status === 'Pending').length,
    approved: leaves.filter(l => l.status === 'Approved').length,
    rejected: leaves.filter(l => l.status === 'Rejected').length,
  };

  const handleAdd = async () => {
    if (!form.employee_id || !form.leave_type || !form.start_date || !form.end_date) {
      toast.error('All fields are required'); return;
    }
    setSaving(true);
    try {
      await apiRequest('/hr/leave', {
        method: 'POST', accessToken, scopeHeaders,
        body: JSON.stringify({ ...form, employee_id: Number(form.employee_id) }),
      });
      toast.success('Leave request submitted');
      setAddOpen(false);
      setForm({ employee_id: '', leave_type: '', start_date: '', end_date: '', reason: '' });
      await load();
    } catch (e) { toast.error('Failed', { description: e instanceof Error ? e.message : String(e) });
    } finally { setSaving(false); }
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      await apiRequest(`/hr/leave/${id}/status`, {
        method: 'PUT', accessToken, scopeHeaders, body: JSON.stringify({ status }),
      });
      toast.success(`Leave ${status.toLowerCase()}`);
      await load();
    } catch (e) { toast.error('Failed'); }
  };

  const statusBadge = (s: string) => {
    if (s === 'Approved') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (s === 'Rejected') return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-amber-100 text-amber-700 border-amber-200';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={cn("text-xl font-bold", lightTheme.text.primary)}>Leave Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">{leaves.length} total requests</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={isLoading} className="gap-1.5">
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4" /> New Request
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending',  value: counts.pending,  color: 'text-amber-600',   filter: 'Pending'  },
          { label: 'Approved', value: counts.approved, color: 'text-emerald-600', filter: 'Approved' },
          { label: 'Rejected', value: counts.rejected, color: 'text-red-600',     filter: 'Rejected' },
        ].map(s => (
          <Card key={s.label} className={cn("cursor-pointer transition-all", lightTheme.background.card, lightTheme.border.default,
            filterStatus === s.filter && "ring-2 ring-blue-500")}
            onClick={() => setFilter(prev => prev === s.filter ? 'all' : s.filter)}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-slate-500 font-medium">{s.label}</p>
              <p className={cn("text-2xl font-black mt-1", s.color)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className={cn(lightTheme.background.card, lightTheme.border.default)}>
        <CardContent className="p-0">
          {isLoading && leaves.length === 0 ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-slate-400 text-sm">Loading...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Calendar className="w-8 h-8 text-slate-300" />
              <p className="text-slate-400 text-sm">
                {leaves.length === 0 ? 'No leave requests yet' : 'No requests match the filter'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn("border-b", lightTheme.background.secondary, lightTheme.border.default)}>
                    {['Employee', 'Leave Type', 'Dates', 'Days', 'Reason', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={cn("divide-y", lightTheme.border.default)}>
                  {filtered.map((l, i) => (
                    <tr key={l.pk_leave_id || i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{l.full_name || '—'}</p>
                        <p className="text-xs text-slate-400">{l.department_name || ''}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{l.leave_type}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                        {new Date(l.start_date).toLocaleDateString()} – {new Date(l.end_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold">{l.days}d</td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[150px] truncate">{l.reason || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", statusBadge(l.status))}>
                          {l.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {l.status === 'Pending' && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-emerald-600 hover:bg-emerald-50 text-xs gap-1"
                              onClick={() => updateStatus(l.pk_leave_id, 'Approved')}>
                              <CheckCircle2 className="w-3 h-3" /> Approve
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-red-600 hover:bg-red-50 text-xs gap-1"
                              onClick={() => updateStatus(l.pk_leave_id, 'Rejected')}>
                              <XCircle className="w-3 h-3" /> Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={o => { setAddOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Leave Request</DialogTitle>
            <DialogDescription>Submit a leave request for an employee.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Employee *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm(p => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.pk_employee_id} value={String(e.pk_employee_id)}>
                      {e.full_name} — {e.department_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Leave Type *</Label>
              <Select value={form.leave_type} onValueChange={v => setForm(p => ({ ...p, leave_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {['Annual Leave', 'Sick Leave', 'Casual Leave', 'Maternity Leave', 'Paternity Leave', 'Emergency Leave', 'Unpaid Leave'].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Start Date *</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">End Date *</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Reason</Label>
              <Input placeholder="Optional reason" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Submit Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
