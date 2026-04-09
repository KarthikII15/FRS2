import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Clock, Mail, FileText, Play } from 'lucide-react';
import { cn } from '../ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';

interface ScheduledReport {
  id: string;
  name: string;
  report_type: 'attendance' | 'employees' | 'audit' | 'device_health';
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  recipients: string;
  enabled: boolean;
  last_run?: string;
  next_run?: string;
}

const EMPTY: Omit<ScheduledReport, 'id'> = {
  name: '', report_type: 'attendance', frequency: 'daily',
  time: '08:00', recipients: '', enabled: true,
};

const FREQ_COLORS: Record<string, string> = {
  daily: 'bg-blue-50 text-blue-700 border-blue-200',
  weekly: 'bg-violet-50 text-violet-700 border-violet-200',
  monthly: 'bg-amber-50 text-amber-700 border-amber-200',
};

const TYPE_LABELS: Record<string, string> = {
  attendance: 'Attendance Report',
  employees: 'Employee Roster',
  audit: 'Audit Log',
  device_health: 'Device Health',
};

export const ScheduledReports: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<ScheduledReport, 'id'>>(EMPTY);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ data: ScheduledReport[] }>('/reports/schedules', { accessToken, scopeHeaders });
      setReports(res.data ?? []);
    } catch { setReports([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [accessToken]);

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!form.name || !form.recipients) { toast.error('Name and recipients are required'); return; }
    setSaving(true);
    try {
      await apiRequest('/reports/schedules', {
        method: 'POST', accessToken, scopeHeaders, body: JSON.stringify(form),
      });
      toast.success('Schedule created');
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch { toast.error('Failed to create schedule'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (r: ScheduledReport) => {
    try {
      await apiRequest(`/reports/schedules/${r.id}`, {
        method: 'PATCH', accessToken, scopeHeaders,
        body: JSON.stringify({ enabled: !r.enabled }),
      });
      setReports(prev => prev.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x));
    } catch { toast.error('Update failed'); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this scheduled report?')) return;
    try {
      await apiRequest(`/reports/schedules/${id}`, { method: 'DELETE', accessToken, scopeHeaders });
      setReports(prev => prev.filter(r => r.id !== id));
      toast.success('Schedule deleted');
    } catch { toast.error('Delete failed'); }
  };

  const handleRunNow = async (r: ScheduledReport) => {
    setRunningId(r.id);
    try {
      await apiRequest(`/reports/schedules/${r.id}/run`, { method: 'POST', accessToken, scopeHeaders });
      toast.success(`"${r.name}" sent to ${r.recipients}`);
    } catch { toast.error('Report run failed'); }
    finally { setRunningId(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-slate-800 dark:text-white">Scheduled Reports</h3>
          <p className="text-xs text-slate-400 mt-0.5">Automated report delivery via email</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-1.5">
          <Plus className="w-4 h-4" /> New Schedule
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-blue-500 w-5 h-5" /></div>
      ) : reports.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="p-12 flex flex-col items-center gap-3 text-slate-400">
            <Clock className="w-10 h-10 opacity-20" />
            <p className="text-sm font-medium">No scheduled reports yet</p>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="rounded-xl gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Create First Schedule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <Card key={r.id} className={cn("border-none shadow-sm", !r.enabled && "opacity-60")}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <FileText className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-800 dark:text-white">{r.name}</span>
                    <Badge className={cn("text-[9px] font-black border rounded-full px-2 py-0", FREQ_COLORS[r.frequency])}>
                      {r.frequency.toUpperCase()}
                    </Badge>
                    <span className="text-[10px] text-slate-400 font-medium">{TYPE_LABELS[r.report_type]}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{r.time}</span>
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{r.recipients.split(',').length} recipient{r.recipients.split(',').length > 1 ? 's' : ''}</span>
                    {r.last_run && <span>Last: {new Date(r.last_run).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={r.enabled} onCheckedChange={() => handleToggle(r)} />
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-500 hover:bg-blue-50 rounded-lg" title="Run now" disabled={runningId === r.id} onClick={() => handleRunNow(r)}>
                    {runningId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-500 hover:bg-rose-50 rounded-lg" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle className="font-black text-lg">New Scheduled Report</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Schedule Name</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Daily Attendance Summary" className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Report Type</Label>
                <Select value={form.report_type} onValueChange={v => set('report_type', v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attendance">Attendance</SelectItem>
                    <SelectItem value="employees">Employee Roster</SelectItem>
                    <SelectItem value="audit">Audit Log</SelectItem>
                    <SelectItem value="device_health">Device Health</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Frequency</Label>
                <Select value={form.frequency} onValueChange={v => set('frequency', v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Send Time</Label>
              <Input type="time" value={form.time} onChange={e => set('time', e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Recipients (comma-separated emails)</Label>
              <Input value={form.recipients} onChange={e => set('recipients', e.target.value)} placeholder="hr@company.com, admin@company.com" className="rounded-xl" />
            </div>
            <Button onClick={handleCreate} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 font-bold gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Schedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
