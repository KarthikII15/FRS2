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
                        {d.recognition_accuracy ? `${Number(d.recognition_accuracy).toFixed(1)}%` : '—'}
                      </p>
                      <p className="text-xs text-slate-500">Accuracy</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">
                      <p className="text-sm font-bold text-slate-800 dark:text-white">
                        {d.error_rate ? `${Number(d.error_rate).toFixed(1)}%` : '0%'}
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
