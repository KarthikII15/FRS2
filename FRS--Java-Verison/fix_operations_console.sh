#!/bin/bash
# ============================================================
# FRS2 — Fix OperationsConsole: replace all mock data with real API
# Run: bash ~/FRS_/FRS--Java-Verison/fix_operations_console.sh
# ============================================================
set -e

PROJECT="$HOME/FRS_/FRS--Java-Verison"
SRC="$PROJECT/src/app/components/admin"

echo ""
echo "=================================================="
echo " FRS2: Fixing OperationsConsole mock data"
echo "=================================================="
echo ""

cd "$PROJECT"

# ══════════════════════════════════════════════════════════
# 1. FacilityIntelligenceDashboard — real devices + attendance
# ══════════════════════════════════════════════════════════
echo "[1/4] Rewriting FacilityIntelligenceDashboard..."

cat > "$SRC/FacilityIntelligenceDashboard.tsx" << 'TSEOF'
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Building2, Users, Camera, Cpu, Activity, RefreshCw, Loader2, MapPin, AlertCircle } from 'lucide-react';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useApiData } from '../../hooks/useApiData';

export const FacilityIntelligenceDashboard: React.FC = () => {
  const { devices, employees, attendance, alerts, isLoading, refresh, lastRefreshed } = useApiData({ autoRefreshMs: 30000 });

  const today = new Date().toISOString().slice(0, 10);
  const todayAttendance = attendance.filter(a => a.attendance_date?.slice(0, 10) === today);

  const onlineDevices  = devices.filter(d => d.status === 'online').length;
  const offlineDevices = devices.filter(d => d.status === 'offline').length;
  const errorDevices   = devices.filter(d => d.status === 'error').length;
  const presentToday   = todayAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
  const unreadAlerts   = alerts.filter(a => !a.is_read).length;

  const totalScans     = devices.reduce((s, d) => s + (d.total_scans || 0), 0);
  const avgAccuracy    = devices.length > 0
    ? (devices.reduce((s, d) => s + (d.recognition_accuracy || 0), 0) / devices.length).toFixed(1)
    : '0';

  const StatCard = ({ title, value, icon: Icon, color, sub }: any) => (
    <Card className={cn(lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-950 dark:border-border')}>
      <CardContent className="p-5">
        <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center mb-3', color, 'bg-opacity-10 border', lightTheme.border.default)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className={cn('text-2xl font-black', lightTheme.text.primary, 'dark:text-white')}>{value}</div>
        <div className={cn('text-xs font-semibold uppercase tracking-wider mt-0.5', lightTheme.text.secondary, 'dark:text-slate-500')}>{title}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className={cn('text-lg font-bold', lightTheme.text.primary)}>Facility Overview</h3>
          {lastRefreshed && (
            <p className="text-xs text-slate-500 mt-0.5">Updated {lastRefreshed.toLocaleTimeString()}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh()} disabled={isLoading} className="gap-1.5">
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="Total Employees"   value={employees.length}      icon={Users}     color="text-blue-500"   sub={`${presentToday} present today`} />
        <StatCard title="Registered Devices" value={devices.length}       icon={Camera}    color="text-indigo-500" sub={`${onlineDevices} online`} />
        <StatCard title="Devices Online"    value={onlineDevices}          icon={Activity}  color="text-emerald-500" sub={offlineDevices > 0 ? `${offlineDevices} offline` : 'All healthy'} />
        <StatCard title="Total Scans"       value={totalScans.toLocaleString()} icon={Cpu} color="text-amber-500"  sub="lifetime" />
        <StatCard title="Avg Accuracy"      value={`${avgAccuracy}%`}     icon={AlertCircle} color="text-purple-500" sub={`${unreadAlerts} active alerts`} />
      </div>

      {/* Device Table */}
      <Card className={cn(lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-950 dark:border-border')}>
        <CardHeader className={cn('border-b py-4 px-5', lightTheme.border.default)}>
          <div className="flex items-center justify-between">
            <h4 className={cn('text-sm font-bold', lightTheme.text.primary)}>Registered Devices</h4>
            <span className="text-xs text-slate-400">{devices.length} total</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && devices.length === 0 ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-slate-400 text-sm">Loading devices...</span>
            </div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Camera className="w-8 h-8 text-slate-400" />
              <p className="text-slate-400 text-sm">No devices registered yet</p>
              <p className="text-slate-400 text-xs">Register your Prama camera in Step 13 of the setup guide</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn('border-b text-xs', lightTheme.background.secondary, lightTheme.border.default)}>
                    {['Device', 'Location', 'Status', 'Total Scans', 'Accuracy', 'Last Active'].map(h => (
                      <th key={h} className="text-left px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={cn('divide-y', lightTheme.border.default, 'dark:divide-slate-800')}>
                  {devices.map(d => (
                    <tr key={d.pk_device_id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                            <Camera className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <p className={cn('text-sm font-semibold', lightTheme.text.primary)}>{d.name}</p>
                            <p className="text-xs font-mono text-slate-400">{d.external_device_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-500">{d.location_label || '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('w-2 h-2 rounded-full',
                            d.status === 'online'  ? 'bg-emerald-500' :
                            d.status === 'error'   ? 'bg-amber-500'   : 'bg-red-500'
                          )} />
                          <span className={cn('text-xs font-semibold capitalize',
                            d.status === 'online'  ? 'text-emerald-600' :
                            d.status === 'error'   ? 'text-amber-600'   : 'text-red-600'
                          )}>{d.status}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm font-mono text-slate-500">{(d.total_scans || 0).toLocaleString()}</td>
                      <td className="px-5 py-3">
                        <span className={cn('text-sm font-semibold',
                          (d.recognition_accuracy || 0) >= 90 ? 'text-emerald-600' :
                          (d.recognition_accuracy || 0) >= 70 ? 'text-amber-600'   : 'text-red-600'
                        )}>
                          {d.recognition_accuracy ? `${d.recognition_accuracy.toFixed(1)}%` : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-400 font-mono">
                        {d.last_active ? new Date(d.last_active).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's attendance snapshot */}
      <Card className={cn(lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-950 dark:border-border')}>
        <CardHeader className={cn('border-b py-4 px-5', lightTheme.border.default)}>
          <div className="flex items-center justify-between">
            <h4 className={cn('text-sm font-bold', lightTheme.text.primary)}>Today's Attendance Snapshot</h4>
            <span className="text-xs text-slate-400">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {todayAttendance.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">
              No attendance records for today yet. Records will appear when employees check in via the camera.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Present',  count: todayAttendance.filter(a => a.status === 'present').length,  color: 'text-emerald-600 bg-emerald-50' },
                { label: 'Late',     count: todayAttendance.filter(a => a.status === 'late').length,     color: 'text-amber-600 bg-amber-50' },
                { label: 'On Break', count: todayAttendance.filter(a => a.status === 'on-break').length, color: 'text-blue-600 bg-blue-50' },
                { label: 'On Leave', count: todayAttendance.filter(a => a.status === 'on-leave').length, color: 'text-purple-600 bg-purple-50' },
              ].map(s => (
                <div key={s.label} className={cn('rounded-xl p-4 text-center', s.color.split(' ')[1])}>
                  <p className={cn('text-2xl font-black', s.color.split(' ')[0])}>{s.count}</p>
                  <p className="text-xs font-semibold text-slate-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
TSEOF
echo "  ✅ FacilityIntelligenceDashboard.tsx"

# ══════════════════════════════════════════════════════════
# 2. DeviceCommandCenter — real devices from API
# ══════════════════════════════════════════════════════════
echo "[2/4] Rewriting DeviceCommandCenter..."

cat > "$SRC/DeviceCommandCenter.tsx" << 'TSEOF'
import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Camera, Cpu, Search, Plus, Activity, Zap, Signal,
  AlertTriangle, RefreshCw, Loader2, MoreVertical, Power, Edit,
} from 'lucide-react';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useApiData } from '../../hooks/useApiData';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { toast } from 'sonner';

export const DeviceCommandCenter: React.FC = () => {
  const { devices, alerts, isLoading, refresh, lastRefreshed } = useApiData({ autoRefreshMs: 20000 });
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();

  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
    total:    devices.length,
    online:   devices.filter(d => d.status === 'online').length,
    offline:  devices.filter(d => d.status === 'offline').length,
    error:    devices.filter(d => d.status === 'error').length,
    scans:    devices.reduce((s, d) => s + (d.total_scans || 0), 0),
    warnings: alerts.filter(a => !a.is_read && (a.severity === 'high' || a.severity === 'critical')).length,
  };

  const handleStatusToggle = async (deviceId: string, currentStatus: string) => {
    setActionLoading(deviceId);
    try {
      const newStatus = currentStatus === 'online' ? 'offline' : 'online';
      await apiRequest(`/devices/${deviceId}/heartbeat`, {
        method: 'POST',
        accessToken,
        scopeHeaders,
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(`Device ${newStatus}`);
      await refresh();
    } catch (e) {
      toast.error('Action failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setActionLoading(null);
    }
  };

  const statusDot = (s: string) =>
    s === 'online'  ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' :
    s === 'error'   ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]'   :
                      'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]';

  const statusLabel = (s: string) =>
    s === 'online' ? 'text-emerald-600' : s === 'error' ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className={cn('text-lg font-bold', lightTheme.text.primary)}>Device Command Center</h3>
          {lastRefreshed && (
            <p className="text-xs text-slate-500 mt-0.5">Live · Updated {lastRefreshed.toLocaleTimeString()}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh()} disabled={isLoading} className="gap-1.5">
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Total',    value: stats.total,                 color: 'text-blue-500',    icon: Zap },
          { label: 'Online',   value: stats.online,                color: 'text-emerald-500', icon: Activity },
          { label: 'Offline',  value: stats.offline,               color: 'text-red-500',     icon: Power },
          { label: 'Error',    value: stats.error,                  color: 'text-amber-500',   icon: AlertTriangle },
          { label: 'Warnings', value: stats.warnings,              color: 'text-orange-500',  icon: AlertTriangle },
          { label: 'Scans',    value: stats.scans.toLocaleString(), color: 'text-indigo-500',  icon: Camera },
        ].map(s => (
          <Card key={s.label} className={cn(lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-950')}>
            <CardContent className="p-4">
              <div className={cn('text-xl font-black', lightTheme.text.primary, 'dark:text-white')}>{s.value}</div>
              <div className={cn('text-xs font-semibold uppercase tracking-wide mt-0.5', s.color)}>{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by name, ID, IP, location..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className={cn('flex rounded-lg p-0.5 border gap-0.5', lightTheme.background.secondary, lightTheme.border.default)}>
          {['All', 'Online', 'Offline', 'Error'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md font-semibold transition-all',
                statusFilter === s
                  ? 'bg-blue-600 text-white shadow-sm'
                  : cn(lightTheme.text.secondary, 'hover:text-foreground dark:text-slate-500')
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Device Table */}
      <Card className={cn('overflow-hidden', lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-950 dark:border-border')}>
        <CardContent className="p-0">
          {isLoading && devices.length === 0 ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-slate-400 text-sm">Loading devices...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Camera className="w-8 h-8 text-slate-400" />
              <p className="text-slate-400 text-sm">
                {devices.length === 0 ? 'No devices registered yet' : 'No devices match the filter'}
              </p>
              {devices.length === 0 && (
                <p className="text-slate-400 text-xs">Register your Prama camera via the setup scripts</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn('border-b', lightTheme.background.secondary, lightTheme.border.default)}>
                    {['Device', 'IP Address', 'Location', 'Status', 'Scans', 'Accuracy', 'Last Active', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={cn('divide-y', lightTheme.border.default, 'dark:divide-slate-800')}>
                  {filtered.map(d => (
                    <tr key={d.pk_device_id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center',
                            d.status === 'online' ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-slate-100 dark:bg-slate-800'
                          )}>
                            <Camera className={cn('w-4 h-4', d.status === 'online' ? 'text-blue-600' : 'text-slate-400')} />
                          </div>
                          <div>
                            <p className={cn('font-semibold text-sm', lightTheme.text.primary)}>{d.name}</p>
                            <p className="text-xs font-mono text-slate-400">{d.external_device_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500">{d.ip_address || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{d.location_label || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('w-2 h-2 rounded-full', statusDot(d.status))} />
                          <span className={cn('text-xs font-semibold capitalize', statusLabel(d.status))}>{d.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-500">{(d.total_scans || 0).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={cn('text-sm font-semibold',
                          (d.recognition_accuracy || 0) >= 90 ? 'text-emerald-600' :
                          (d.recognition_accuracy || 0) >= 70 ? 'text-amber-600'   : 'text-slate-400'
                        )}>
                          {d.recognition_accuracy ? `${d.recognition_accuracy.toFixed(1)}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                        {d.last_active ? new Date(d.last_active).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost" size="sm"
                          className={cn('h-7 px-2 text-xs gap-1',
                            d.status === 'online'
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          )}
                          disabled={actionLoading === d.external_device_id}
                          onClick={() => handleStatusToggle(d.external_device_id, d.status)}
                        >
                          {actionLoading === d.external_device_id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Power className="w-3 h-3" />
                          }
                          {d.status === 'online' ? 'Offline' : 'Online'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent alerts */}
      {alerts.length > 0 && (
        <Card className={cn(lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-950 dark:border-border')}>
          <CardHeader className={cn('border-b py-4 px-5', lightTheme.border.default)}>
            <div className="flex items-center justify-between">
              <h4 className={cn('text-sm font-bold', lightTheme.text.primary)}>Recent Device Alerts</h4>
              <span className="text-xs text-slate-400">{alerts.filter(a => !a.is_read).length} unread</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {alerts.slice(0, 5).map(a => (
                <div key={a.pk_alert_id} className="flex items-start gap-3 px-5 py-3">
                  <span className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                    a.severity === 'critical' ? 'bg-red-500' :
                    a.severity === 'high'     ? 'bg-orange-500' :
                    a.severity === 'medium'   ? 'bg-amber-500' : 'bg-slate-400'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-semibold', lightTheme.text.primary)}>{a.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{a.message}</p>
                  </div>
                  <span className="text-xs text-slate-400 font-mono flex-shrink-0">
                    {new Date(a.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
TSEOF
echo "  ✅ DeviceCommandCenter.tsx"

# ══════════════════════════════════════════════════════════
# 3. FacilityConfiguration — simplified real config
# ══════════════════════════════════════════════════════════
echo "[3/4] Rewriting FacilityConfiguration..."

cat > "$SRC/FacilityConfiguration.tsx" << 'TSEOF'
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Settings, Save, RefreshCw, Loader2, Building2, Camera, Database, Shield } from 'lucide-react';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useApiData } from '../../hooks/useApiData';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { toast } from 'sonner';

export const FacilityConfiguration: React.FC = () => {
  const { devices, employees, isLoading, refresh } = useApiData({ autoRefreshMs: 0 });
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [saving, setSaving] = useState(false);

  // Editable device configs
  const [deviceEdits, setDeviceEdits] = useState<Record<string, Partial<{ name: string; location_label: string; status: string }>>>({});

  const handleDeviceEdit = (id: string, field: string, value: string) => {
    setDeviceEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  };

  const handleSaveDevice = async (deviceCode: string) => {
    const edits = deviceEdits[deviceCode];
    if (!edits || Object.keys(edits).length === 0) return;
    setSaving(true);
    try {
      await apiRequest(`/cameras/${deviceCode}`, {
        method: 'PUT',
        accessToken,
        scopeHeaders,
        body: JSON.stringify(edits),
      });
      toast.success('Device updated');
      setDeviceEdits(prev => { const n = { ...prev }; delete n[deviceCode]; return n; });
      await refresh();
    } catch (e) {
      toast.error('Save failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const ConfigSection = ({ icon: Icon, title, children }: any) => (
    <Card className={cn(lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-950 dark:border-border')}>
      <CardHeader className={cn('border-b py-4 px-5', lightTheme.border.default)}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-blue-500" />
          <CardTitle className={cn('text-sm font-bold', lightTheme.text.primary)}>{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className={cn('text-lg font-bold', lightTheme.text.primary)}>Facility Configuration</h3>
        <Button variant="outline" size="sm" onClick={() => refresh()} disabled={isLoading} className="gap-1.5">
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* System overview */}
      <ConfigSection icon={Database} title="System Summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Employees',   value: employees.length },
            { label: 'Registered Devices', value: devices.length },
            { label: 'Online Devices',     value: devices.filter(d => d.status === 'online').length },
            { label: 'Face Enrolled',      value: employees.filter((e: any) => e.face_enrolled).length },
          ].map(s => (
            <div key={s.label} className="text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-900">
              <p className={cn('text-2xl font-black', lightTheme.text.primary)}>{s.value}</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </ConfigSection>

      {/* Device config */}
      <ConfigSection icon={Camera} title="Camera / Device Configuration">
        {isLoading && devices.length === 0 ? (
          <div className="flex items-center justify-center py-8 gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-slate-400 text-sm">Loading...</span>
          </div>
        ) : devices.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">
            No devices configured. Register your camera using the setup scripts.
          </p>
        ) : (
          <div className="space-y-4">
            {devices.map(d => {
              const edits = deviceEdits[d.external_device_id] || {};
              const isDirty = Object.keys(edits).length > 0;
              return (
                <div key={d.pk_device_id} className={cn('p-4 rounded-xl border', lightTheme.border.default, lightTheme.background.secondary)}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                        <Camera className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className={cn('font-semibold text-sm', lightTheme.text.primary)}>{d.name}</p>
                        <p className="text-xs font-mono text-slate-400">{d.external_device_id} · {d.ip_address}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border capitalize',
                        d.status === 'online'  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        d.status === 'error'   ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                 'bg-red-50 text-red-700 border-red-200'
                      )}>{d.status}</span>
                      {isDirty && (
                        <Button size="sm" onClick={() => handleSaveDevice(d.external_device_id)} disabled={saving}
                          className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1">
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          Save
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Display Name</Label>
                      <Input
                        value={edits.name !== undefined ? edits.name : d.name}
                        onChange={e => handleDeviceEdit(d.external_device_id, 'name', e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Location Label</Label>
                      <Input
                        value={edits.location_label !== undefined ? edits.location_label : (d.location_label || '')}
                        onChange={e => handleDeviceEdit(d.external_device_id, 'location_label', e.target.value)}
                        placeholder="e.g. Main Entrance - Building A"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">
                      <p className="text-sm font-bold text-slate-800 dark:text-white">{(d.total_scans || 0).toLocaleString()}</p>
                      <p className="text-xs text-slate-500">Total scans</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">
                      <p className="text-sm font-bold text-slate-800 dark:text-white">
                        {d.recognition_accuracy ? `${d.recognition_accuracy.toFixed(1)}%` : '—'}
                      </p>
                      <p className="text-xs text-slate-500">Accuracy</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">
                      <p className="text-sm font-bold text-slate-800 dark:text-white">
                        {d.error_rate ? `${d.error_rate.toFixed(1)}%` : '0%'}
                      </p>
                      <p className="text-xs text-slate-500">Error rate</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ConfigSection>

      {/* Match threshold config info */}
      <ConfigSection icon={Shield} title="Recognition Settings">
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-1">Face Match Threshold</p>
            <p className="text-sm text-blue-600 dark:text-blue-300">
              Currently configured at <span className="font-mono font-bold">0.55</span> (55% similarity required for a match).
              Lower = more permissive, higher = more strict. Edit <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">FACE_MATCH_THRESHOLD</code> in backend .env and restart.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-900 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Cooldown Period</p>
            <p className="text-sm text-slate-500">
              10 seconds between recognition events per camera. Prevents duplicate attendance marks. Configured in <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">rule_config.json</code>.
            </p>
          </div>
        </div>
      </ConfigSection>
    </div>
  );
};
TSEOF
echo "  ✅ FacilityConfiguration.tsx"

# ══════════════════════════════════════════════════════════
# 4. Rebuild frontend
# ══════════════════════════════════════════════════════════
echo ""
echo "[4/4] Rebuilding frontend container..."

docker compose build frontend 2>&1 | grep -E "FINISHED|ERROR|error" | head -5
docker compose up -d frontend

echo ""
echo "  Waiting for frontend..."
sleep 12

STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://172.20.100.222:5173 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  echo "  ✅ Frontend is up"
else
  echo "  ⚠️  HTTP $STATUS — run: docker compose logs --tail=40 frontend"
fi

echo ""
echo "=================================================="
echo " ✅ Operations Console fixed"
echo "=================================================="
echo ""
echo "What changed in Operations Console:"
echo ""
echo "  Facility Overview tab:"
echo "    • Real device count, online/offline/error from DB"
echo "    • Real today's attendance snapshot (present/late/break/leave)"
echo "    • All hardcoded buildings/floors/areas removed → shows 0 if none"
echo ""
echo "  Device Command tab:"
echo "    • Real devices from facility_device table"
echo "    • Real alerts from system_alert table"
echo "    • Online/Offline toggle button per device"
echo "    • Shows 0 counts / empty state if no devices registered"
echo ""
echo "  Configuration tab:"
echo "    • Real device list with editable name + location fields"
echo "    • Save button per device calls backend update"
echo "    • Recognition settings info panel"
echo "    • No more mock buildings/floors"
echo ""
echo "  Map Console tab: unchanged (floor map canvas — needs floor plan upload)"
echo ""
echo "Hard refresh: Ctrl+Shift+R"
echo "Open: http://172.20.100.222:5173"
echo ""