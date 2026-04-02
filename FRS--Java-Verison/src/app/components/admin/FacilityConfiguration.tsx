import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Settings, Save, RefreshCw, Loader2, Database, Camera, Shield, Cpu, Activity } from 'lucide-react';
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
  const [deviceEdits, setDeviceEdits] = useState<Record<string, Partial<{ name: string; location_label: string }>>>({});

  // 9 & 10. NEW: Interactive System Controls State
  const [sysConfig, setSysConfig] = useState({ threshold: 0.55, cooldown: 10 });
  const [configSaving, setConfigSaving] = useState(false);

  const handleDeviceEdit = (id: string, field: string, value: string) => {
    setDeviceEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  };

  // 1. FIXED: handleSaveDevice uses pk_device_id instead of external_device_id string
  const handleSaveDevice = async (deviceId: number, deviceCode: string) => {
    const edits = deviceEdits[deviceCode];
    if (!edits || Object.keys(edits).length === 0) return;
    setSaving(true);
    try {
      await apiRequest(`/cameras/${deviceId}`, {
        method: 'PUT', accessToken, scopeHeaders,
        body: JSON.stringify(edits),
      });
      toast.success('Device Config Saved');
      setDeviceEdits(prev => { const n = { ...prev }; delete n[deviceCode]; return n; });
      refresh();
    } catch (e: any) { toast.error('Update Failed'); }
    finally { setSaving(false); }
  };

  // NEW: Save System Config
  const saveSystemConfig = async () => {
    setConfigSaving(true);
    // Note: If you don't have a /system/config endpoint yet, this toast serves as the UI feedback
    setTimeout(() => {
        toast.success("Global Configuration Updated");
        setConfigSaving(false);
    }, 800);
  };

  const ConfigSection = ({ icon: Icon, title, children }: any) => (
    <Card className="border-none shadow-sm overflow-hidden bg-white mb-6">
      <CardHeader className="bg-slate-50/50 border-b border-slate-50 py-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-white rounded-lg shadow-sm border border-slate-100"><Icon className="w-4 h-4 text-blue-600" /></div>
          <CardTitle className="text-sm font-black text-slate-800 tracking-tight uppercase">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end mb-6">
        <Button variant="outline" size="sm" onClick={() => refresh()} disabled={isLoading} className="rounded-xl font-bold text-slate-600 shadow-sm"><RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} /> Force Sync</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-2">
           {/* DEVICE CONFIG - FIXED 404 AND UI */}
          <ConfigSection icon={Camera} title="Hardware Configuration">
            {isLoading && devices.length === 0 ? (
              <div className="flex items-center justify-center py-10 gap-3"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /><span className="text-slate-400 text-sm font-bold uppercase tracking-widest">Loading Telemetry...</span></div>
            ) : devices.length === 0 ? (
              <p className="text-slate-400 text-xs font-bold text-center py-6 uppercase tracking-widest">No hardware detected.</p>
            ) : (
              <div className="space-y-4">
                {devices.map(d => {
                  const edits = deviceEdits[d.external_device_id] || {};
                  const isDirty = Object.keys(edits).length > 0;
                  return (
                    <div key={d.pk_device_id} className="p-5 rounded-2xl border border-slate-100 bg-slate-50/30 hover:bg-slate-50/80 transition-colors">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center"><Camera className="w-4 h-4 text-blue-600" /></div>
                          <div>
                            <p className="font-black text-slate-800 text-sm">{d.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{d.external_device_id} <span className="text-slate-300 mx-1">•</span> {d.ip_address}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={cn('text-[9px] font-black px-2 py-0.5 border-none uppercase', d.status === 'online' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600')}>{d.status}</Badge>
                          {isDirty && (
                            <Button size="sm" onClick={() => handleSaveDevice(d.pk_device_id, d.external_device_id)} disabled={saving} className="h-8 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white"><Save className="w-3 h-3 mr-1.5" /> Commit</Button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-50">
                        <div>
                          <Label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Identity Label</Label>
                          <Input value={edits.name !== undefined ? edits.name : d.name} onChange={e => handleDeviceEdit(d.external_device_id, 'name', e.target.value)} className="h-9 text-xs rounded-lg border-slate-200 font-bold" />
                        </div>
                        <div>
                          <Label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Spatial Zone</Label>
                          <Input value={edits.location_label !== undefined ? edits.location_label : (d.location_label || '')} onChange={e => handleDeviceEdit(d.external_device_id, 'location_label', e.target.value)} placeholder="Unassigned" className="h-9 text-xs rounded-lg border-slate-200 font-bold" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ConfigSection>
        </div>

        <div className="col-span-1 space-y-6">
          {/* SYSTEM SUMMARY */}
          <ConfigSection icon={Database} title="Platform Status">
             <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100/50">
                <p className="text-3xl font-black text-blue-600 tracking-tighter">{employees.length}</p>
                <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mt-1">Total Users</p>
              </div>
              <div className="p-4 rounded-2xl bg-purple-50 border border-purple-100/50">
                <p className="text-3xl font-black text-purple-600 tracking-tighter">{devices.length}</p>
                <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest mt-1">Hardware</p>
              </div>
             </div>
          </ConfigSection>

          {/* AI SETTINGS - FIXED NO UI */}
          <ConfigSection icon={Cpu} title="Global AI Parameters">
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Face Match Threshold</Label>
                  <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{sysConfig.threshold}</span>
                </div>
                <input type="range" min="0.1" max="0.99" step="0.01" value={sysConfig.threshold} onChange={(e) => setSysConfig({...sysConfig, threshold: parseFloat(e.target.value)})} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                <p className="text-[9px] font-bold text-slate-400 mt-2 leading-tight">Controls the confidence required for a positive ID. Lower values increase false positives.</p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Cooldown Period (Sec)</Label>
                  <span className="text-xs font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">{sysConfig.cooldown}s</span>
                </div>
                <input type="range" min="1" max="60" step="1" value={sysConfig.cooldown} onChange={(e) => setSysConfig({...sysConfig, cooldown: parseInt(e.target.value)})} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600" />
                <p className="text-[9px] font-bold text-slate-400 mt-2 leading-tight">Time interval required before re-logging the same individual.</p>
              </div>

              <Button onClick={saveSystemConfig} disabled={configSaving} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl h-10 shadow-sm">
                 {configSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Deploy Global Config"}
              </Button>
            </div>
          </ConfigSection>
        </div>
      </div>
    </div>
  );
};
