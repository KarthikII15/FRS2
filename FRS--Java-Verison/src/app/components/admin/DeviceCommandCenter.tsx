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
                          {d.recognition_accuracy ? `${Number(d.recognition_accuracy).toFixed(1)}%` : '—'}
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
