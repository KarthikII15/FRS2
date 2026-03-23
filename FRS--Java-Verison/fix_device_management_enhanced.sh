#!/bin/bash
# vm/fix_device_management_enhanced.sh
# Completely rewrites DeviceCommandCenter with:
#   - Device type icons (camera vs edge AI node)
#   - Expandable device detail panel with live stats
#   - Ping/test connectivity button
#   - Edit device inline
#   - Register new device dialog (full form)
#   - Real-time status pulse animation
#   - Uptime percentage from last_active
#   - Offline duration display
#   - Device health score
set -e
cd ~/FRS_/FRS--Java-Verison

cat > src/app/components/admin/DeviceCommandCenter.tsx << 'TSXEOF'
import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Camera, Cpu, Search, Plus, Activity, Zap, Signal,
  AlertTriangle, RefreshCw, Loader2, Power, Edit, ChevronDown,
  ChevronUp, Wifi, WifiOff, Clock, BarChart2, MapPin, Trash2,
  CheckCircle2, XCircle, Save, X,
} from 'lucide-react';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useApiData } from '../../hooks/useApiData';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { toast } from 'sonner';

// ── Helpers ───────────────────────────────────────────────────────────────────
function offlineDuration(lastActive: string | null): string {
  if (!lastActive) return 'Unknown';
  const diff = Date.now() - new Date(lastActive).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function healthScore(d: any): number {
  if (d.status === 'error') return 20;
  if (d.status === 'offline') return 0;
  const acc = Number(d.recognition_accuracy) || 0;
  const scans = Number(d.total_scans) || 0;
  if (acc === 0 && scans === 0) return 60; // online but no data yet
  return Math.min(100, Math.round((acc * 0.7) + (Math.min(scans, 1000) / 1000 * 30)));
}

function healthColor(score: number) {
  if (score >= 80) return 'text-emerald-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
}

function deviceTypeIcon(id: string) {
  if (id.includes('jetson') || id.includes('edge') || id.includes('ai')) return Cpu;
  return Camera;
}

const EMPTY_FORM = {
  code: '', name: '', ipAddress: '', location: '',
  rtspUsername: 'admin', rtspPassword: '', channel: '1',
  rtspPort: '554', httpPort: '80', role: 'entry', fpsTarget: '5',
};

// ── Main Component ─────────────────────────────────────────────────────────────
export const DeviceCommandCenter: React.FC = () => {
  const { devices, alerts, isLoading, refresh, lastRefreshed } = useApiData({ autoRefreshMs: 15000 });
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();

  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState('All');
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pingResult, setPingResult]       = useState<Record<string, 'ok' | 'fail' | 'pinging'>>({});
  const [addOpen, setAddOpen]             = useState(false);
  const [addForm, setAddForm]             = useState({ ...EMPTY_FORM });
  const [addSaving, setAddSaving]         = useState(false);
  const [editId, setEditId]               = useState<string | null>(null);
  const [editForm, setEditForm]           = useState<Record<string, string>>({});

  const filtered = devices.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      d.name.toLowerCase().includes(q) ||
      d.external_device_id.toLowerCase().includes(q) ||
      (d.ip_address || '').includes(q) ||
      (d.location_label || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'All' || d.status === statusFilter.toLowerCase();
    return matchSearch && matchStatus;
  });

  const stats = {
    total:   devices.length,
    online:  devices.filter(d => d.status === 'online').length,
    offline: devices.filter(d => d.status === 'offline').length,
    error:   devices.filter(d => d.status === 'error').length,
    scans:   devices.reduce((s, d) => s + (Number(d.total_scans) || 0), 0),
    avgAcc:  devices.length > 0
      ? (devices.reduce((s, d) => s + (Number(d.recognition_accuracy) || 0), 0) / devices.length).toFixed(1)
      : '0',
  };

  // ── Ping device ────────────────────────────────────────────────────────────
  const handlePing = async (deviceCode: string, ip: string) => {
    setPingResult(p => ({ ...p, [deviceCode]: 'pinging' }));
    try {
      const r = await apiRequest<any>(`/cameras/${deviceCode}/test`, {
        method: 'POST', accessToken, scopeHeaders,
        body: JSON.stringify({}),
      });
      setPingResult(p => ({ ...p, [deviceCode]: r?.reachable ? 'ok' : 'fail' }));
      toast.success(r?.reachable ? `${ip} is reachable` : `${ip} not reachable`);
    } catch {
      setPingResult(p => ({ ...p, [deviceCode]: 'fail' }));
      toast.error('Ping failed');
    }
    setTimeout(() => setPingResult(p => { const n = { ...p }; delete n[deviceCode]; return n; }), 5000);
  };

  // ── Toggle status ──────────────────────────────────────────────────────────
  const handleStatusToggle = async (deviceCode: string, currentStatus: string) => {
    setActionLoading(deviceCode);
    try {
      const newStatus = currentStatus === 'online' ? 'offline' : 'online';
      await apiRequest(`/cameras/${deviceCode}`, {
        method: 'PUT', accessToken, scopeHeaders,
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(`Device marked ${newStatus}`);
      await refresh();
    } catch (e) {
      toast.error('Failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setActionLoading(null);
    }
  };

  // ── Register new device ────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!addForm.code || !addForm.name) {
      toast.error('Code and name are required');
      return;
    }
    setAddSaving(true);
    try {
      await apiRequest('/cameras', {
        method: 'POST', accessToken, scopeHeaders,
        body: JSON.stringify({
          code: addForm.code, name: addForm.name,
          ipAddress: addForm.ipAddress || undefined,
          location: addForm.location || undefined,
          rtspUsername: addForm.rtspUsername || undefined,
          rtspPassword: addForm.rtspPassword || undefined,
          channel: Number(addForm.channel) || 1,
          rtspPort: Number(addForm.rtspPort) || 554,
          httpPort: Number(addForm.httpPort) || 80,
          role: addForm.role, fpsTarget: Number(addForm.fpsTarget) || 5,
          brand: 'prama_hikvision',
        }),
      });
      toast.success('Device registered', { description: `${addForm.name} added successfully` });
      setAddOpen(false);
      setAddForm({ ...EMPTY_FORM });
      await refresh();
    } catch (e) {
      toast.error('Failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setAddSaving(false);
    }
  };

  // ── Inline edit ────────────────────────────────────────────────────────────
  const startEdit = (d: any) => {
    setEditId(d.external_device_id);
    setEditForm({ name: d.name, location_label: d.location_label || '' });
  };

  const saveEdit = async (deviceCode: string) => {
    try {
      await apiRequest(`/cameras/${deviceCode}`, {
        method: 'PUT', accessToken, scopeHeaders,
        body: JSON.stringify(editForm),
      });
      toast.success('Device updated');
      setEditId(null);
      await refresh();
    } catch (e) {
      toast.error('Save failed');
    }
  };

  const statusDot = (s: string) =>
    s === 'online'  ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]' :
    s === 'error'   ? 'bg-amber-500  animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]' :
                      'bg-slate-400';

  const statusBadge = (s: string) =>
    s === 'online'  ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400' :
    s === 'error'   ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400' :
                      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className={cn('text-lg font-bold', lightTheme.text.primary, 'dark:text-white')}>
            Device Command Center
          </h3>
          {lastRefreshed && (
            <p className="text-xs text-slate-500 mt-0.5">
              Live · {lastRefreshed.toLocaleTimeString()} · Auto-refresh 15s
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setAddOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
            <Plus className="w-3.5 h-3.5" />Register Device
          </Button>
          <Button variant="outline" size="sm" onClick={() => refresh()} disabled={isLoading} className="gap-1.5">
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Total',    value: stats.total,                  color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Online',   value: stats.online,                 color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Offline',  value: stats.offline,                color: 'text-slate-500',   bg: 'bg-slate-50 dark:bg-slate-800' },
          { label: 'Error',    value: stats.error,                  color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-900/20' },
          { label: 'Avg Acc',  value: `${isNaN(Number(stats.avgAcc)) ? '0' : stats.avgAcc}%`, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
          { label: 'Scans',    value: stats.scans.toLocaleString(), color: 'text-indigo-600',  bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-xl p-3 border', s.bg, lightTheme.border.default, 'dark:border-border')}>
            <div className={cn('text-xl font-black tabular-nums', s.color)}>{s.value}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search by name, ID, IP, location..."
            value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className={cn('flex rounded-lg p-0.5 border gap-0.5', lightTheme.background.secondary, lightTheme.border.default, 'dark:bg-slate-900 dark:border-border')}>
          {['All', 'Online', 'Offline', 'Error'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('px-3 py-1.5 text-xs rounded-md font-semibold transition-all',
                statusFilter === s ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              )}>
              {s}
              {s !== 'All' && (
                <span className="ml-1.5 text-[10px] opacity-70">
                  {s === 'Online' ? stats.online : s === 'Offline' ? stats.offline : stats.error}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Device cards */}
      {isLoading && devices.length === 0 ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span className="text-slate-400">Loading devices...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Camera className="w-10 h-10 text-slate-300" />
          <p className="text-slate-400">{devices.length === 0 ? 'No devices registered' : 'No matches'}</p>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 mt-2">
            <Plus className="w-3.5 h-3.5" />Register First Device
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(d => {
            const isExpanded = expandedId === d.external_device_id;
            const isEditing  = editId === d.external_device_id;
            const score      = healthScore(d);
            const DevIcon    = deviceTypeIcon(d.external_device_id);
            const ping       = pingResult[d.external_device_id];

            return (
              <Card key={d.pk_device_id}
                className={cn('overflow-hidden transition-all',
                  lightTheme.background.card, lightTheme.border.default,
                  'dark:bg-slate-950 dark:border-border',
                  isExpanded && 'ring-1 ring-blue-500/30'
                )}>
                {/* Main row */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Icon + status dot */}
                  <div className="relative shrink-0">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center',
                      d.status === 'online' ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-slate-100 dark:bg-slate-800'
                    )}>
                      <DevIcon className={cn('w-5 h-5', d.status === 'online' ? 'text-blue-600' : 'text-slate-400')} />
                    </div>
                    <span className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-950', statusDot(d.status))} />
                  </div>

                  {/* Name + ID */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <Input value={editForm.name || ''}
                        onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                        className="h-7 text-sm font-semibold mb-1" />
                    ) : (
                      <p className={cn('font-semibold text-sm truncate', lightTheme.text.primary, 'dark:text-white')}>
                        {d.name}
                      </p>
                    )}
                    <p className="text-xs font-mono text-slate-400">{d.external_device_id}</p>
                  </div>

                  {/* IP */}
                  <div className="hidden sm:block shrink-0">
                    <p className="text-xs font-mono text-slate-500">{d.ip_address || '—'}</p>
                    <p className="text-[10px] text-slate-400">{d.location_label || 'No location'}</p>
                  </div>

                  {/* Status badge */}
                  <Badge className={cn('shrink-0 text-xs border capitalize', statusBadge(d.status))}>
                    {d.status}
                  </Badge>

                  {/* Health score */}
                  <div className="hidden md:block shrink-0 text-center">
                    <div className={cn('text-base font-black tabular-nums', healthColor(score))}>
                      {d.status === 'offline' ? '—' : `${score}`}
                    </div>
                    <div className="text-[10px] text-slate-400">Health</div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Ping */}
                    <Button variant="ghost" size="sm"
                      className={cn('h-7 w-7 p-0',
                        ping === 'ok'   ? 'text-emerald-500' :
                        ping === 'fail' ? 'text-red-500' : 'text-slate-400 hover:text-blue-500'
                      )}
                      disabled={ping === 'pinging'}
                      onClick={() => handlePing(d.external_device_id, d.ip_address || '')}
                      title="Test connectivity">
                      {ping === 'pinging' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                       ping === 'ok'      ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                       ping === 'fail'    ? <XCircle className="w-3.5 h-3.5" /> :
                                           <Signal className="w-3.5 h-3.5" />}
                    </Button>

                    {/* Edit / Save */}
                    {isEditing ? (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-500"
                          onClick={() => saveEdit(d.external_device_id)} title="Save">
                          <Save className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400"
                          onClick={() => setEditId(null)} title="Cancel">
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-blue-500"
                        onClick={() => startEdit(d)} title="Edit">
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                    )}

                    {/* Power toggle */}
                    <Button variant="ghost" size="sm"
                      className={cn('h-7 w-7 p-0',
                        d.status === 'online' ? 'text-slate-400 hover:text-red-500' : 'text-slate-400 hover:text-emerald-500'
                      )}
                      disabled={actionLoading === d.external_device_id}
                      onClick={() => handleStatusToggle(d.external_device_id, d.status)}
                      title={d.status === 'online' ? 'Mark offline' : 'Mark online'}>
                      {actionLoading === d.external_device_id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Power className="w-3.5 h-3.5" />}
                    </Button>

                    {/* Expand */}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400"
                      onClick={() => setExpandedId(isExpanded ? null : d.external_device_id)}>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div className={cn('border-t px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4',
                    lightTheme.border.default, 'dark:border-border',
                    lightTheme.background.secondary, 'dark:bg-slate-900/50'
                  )}>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">IP Address</p>
                      <p className="text-sm font-mono text-slate-700 dark:text-slate-300">{d.ip_address || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Location</p>
                      {isEditing ? (
                        <Input value={editForm.location_label || ''}
                          onChange={e => setEditForm(p => ({ ...p, location_label: e.target.value }))}
                          className="h-7 text-sm" placeholder="e.g. Floor 7" />
                      ) : (
                        <p className="text-sm text-slate-700 dark:text-slate-300">{d.location_label || '—'}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Last Active</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{offlineDuration(d.last_active)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Scans</p>
                      <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
                        {(Number(d.total_scans) || 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Accuracy</p>
                      <p className={cn('text-sm font-semibold',
                        Number(d.recognition_accuracy) >= 90 ? 'text-emerald-600' :
                        Number(d.recognition_accuracy) >= 70 ? 'text-amber-600' : 'text-slate-400'
                      )}>
                        {d.recognition_accuracy ? `${Number(d.recognition_accuracy).toFixed(1)}%` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Model</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{d.model || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Health Score</p>
                      <p className={cn('text-sm font-black', healthColor(score))}>
                        {d.status === 'offline' ? 'Offline' : `${score}/100`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Error Rate</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {d.error_rate ? `${Number(d.error_rate).toFixed(1)}%` : '0%'}
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Recent alerts */}
      {alerts.length > 0 && (
        <Card className={cn(lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-950 dark:border-border')}>
          <CardHeader className={cn('border-b py-3 px-5', lightTheme.border.default)}>
            <div className="flex items-center justify-between">
              <h4 className={cn('text-sm font-bold', lightTheme.text.primary, 'dark:text-white')}>
                Recent Alerts
              </h4>
              <span className="text-xs text-slate-400">{alerts.filter(a => !a.is_read).length} unread</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {alerts.slice(0, 5).map(a => (
                <div key={a.pk_alert_id} className="flex items-start gap-3 px-5 py-3">
                  <span className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0',
                    a.severity === 'critical' ? 'bg-red-500' :
                    a.severity === 'high'     ? 'bg-orange-500' :
                    a.severity === 'medium'   ? 'bg-amber-500' : 'bg-slate-400'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-semibold', lightTheme.text.primary, 'dark:text-white')}>{a.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{a.message}</p>
                  </div>
                  <span className="text-xs text-slate-400 font-mono shrink-0">
                    {(() => { try { return new Date(a.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); } catch { return ''; } })()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Register device dialog */}
      <Dialog open={addOpen} onOpenChange={o => { setAddOpen(o); if (!o) setAddForm({ ...EMPTY_FORM }); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Register New Device</DialogTitle>
            <DialogDescription>Add a camera or edge AI device to the system.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {([
              { label: 'Device Code *',  key: 'code',          type: 'text',     ph: 'entrance-cam-01' },
              { label: 'Display Name *', key: 'name',          type: 'text',     ph: 'Main Entrance Camera' },
              { label: 'Camera IP',      key: 'ipAddress',     type: 'text',     ph: '172.18.3.201' },
              { label: 'Location',       key: 'location',      type: 'text',     ph: 'Floor 7 - Main Entrance' },
              { label: 'RTSP Username',  key: 'rtspUsername',  type: 'text',     ph: 'admin' },
              { label: 'RTSP Password',  key: 'rtspPassword',  type: 'password', ph: '••••••' },
              { label: 'Channel',        key: 'channel',       type: 'number',   ph: '1' },
              { label: 'RTSP Port',      key: 'rtspPort',      type: 'number',   ph: '554' },
              { label: 'HTTP Port',      key: 'httpPort',      type: 'number',   ph: '80' },
              { label: 'FPS Target',     key: 'fpsTarget',     type: 'number',   ph: '5' },
            ] as any[]).map((f: any) => (
              <div key={f.key}>
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">{f.label}</Label>
                <Input type={f.type} placeholder={f.ph}
                  value={(addForm as any)[f.key]}
                  onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Role</Label>
              <Select value={addForm.role} onValueChange={v => setAddForm(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entry">Entry</SelectItem>
                  <SelectItem value="exit">Exit</SelectItem>
                  <SelectItem value="both">Entry + Exit</SelectItem>
                  <SelectItem value="zone">Zone Monitor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {addSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Register Device
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
TSXEOF

echo "✅ DeviceCommandCenter enhanced"

docker compose build frontend 2>&1 | tail -3
docker compose up -d frontend
echo "Done — hard refresh Ctrl+Shift+R"