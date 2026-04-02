import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { apiRequest } from '../../services/http/apiClient';
import { cn } from '../ui/utils';
import { toast } from 'sonner';
import {
  Globe, Clock, Save, MapPin, Building2, Plus, Loader2,
  Edit2, Trash2, ChevronDown, ChevronRight, Layers, X, Check,
  RefreshCw, Settings, Wifi
} from 'lucide-react';

interface Site { pk_site_id: string; site_name: string; timezone: string; timezone_label: string; location_address: string; }
interface Building { pk_building_id: string; name: string; address: string; floor_count: number; nug_count: number; camera_count: number; }
interface Floor { pk_floor_id: string; fk_building_id: string; floor_number: number; floor_name: string; nug_count: number; camera_count: number; }

const TIMEZONES = [
  { iana: 'Asia/Kolkata', label: 'IST — India Standard Time (UTC+5:30)' },
  { iana: 'Asia/Dubai', label: 'GST — Gulf Standard Time (UTC+4)' },
  { iana: 'Asia/Singapore', label: 'SGT — Singapore Time (UTC+8)' },
  { iana: 'Europe/London', label: 'GMT — Greenwich Mean Time (UTC+0)' },
  { iana: 'America/New_York', label: 'EST — Eastern Standard Time (UTC-5)' },
  { iana: 'America/Los_Angeles', label: 'PST — Pacific Standard Time (UTC-8)' },
  { iana: 'UTC', label: 'UTC — Coordinated Universal Time' },
];

const input = "w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white";

export default function SiteSettings() {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [settings, setSettings] = useState<Site | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());

  // Modals
  const [buildingModal, setBuildingModal] = useState<{mode:'add'|'edit';data?:Building}|null>(null);
  const [floorModal, setFloorModal] = useState<{mode:'add'|'edit';data?:Floor;buildingId?:string}|null>(null);
  const [buildingForm, setBuildingForm] = useState({name:'',address:''});
  const [floorForm, setFloorForm] = useState({floor_number:'',floor_name:''});

  const fetchAll = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const [site, bldgs] = await Promise.all([
        apiRequest<Site>('/site/settings', { accessToken, scopeHeaders }),
        apiRequest<{data:Building[]}>('/devices/buildings', { accessToken, scopeHeaders }),
      ]);
      setSettings(site);
      setBuildings(bldgs.data || []);
      // Fetch floors for all buildings
      if (bldgs.data?.length) {
        const allFloors: Floor[] = [];
        for (const b of bldgs.data) {
          try {
            const fr = await apiRequest<{data:Floor[]}>(`/devices/buildings/${b.pk_building_id}/floors`, { accessToken, scopeHeaders });
            allFloors.push(...(fr.data || []));
          } catch {}
        }
        setFloors(allFloors);
      }
    } catch { toast.error('Failed to load site profile'); }
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Live clock
  useEffect(() => {
    if (!settings?.timezone) return;
    const t = setInterval(() => {
      try {
        setCurrentTime(new Intl.DateTimeFormat('en-IN', {
          timeZone: settings.timezone,
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        }).format(new Date()));
      } catch { setCurrentTime('Invalid TZ'); }
    }, 1000);
    return () => clearInterval(t);
  }, [settings?.timezone]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await apiRequest('/site/settings', {
        accessToken, scopeHeaders, method: 'PATCH',
        body: JSON.stringify({
          name: settings.site_name,
          timezone: settings.timezone,
          timezone_label: TIMEZONES.find(t => t.iana === settings.timezone)?.label.split('—')[0].trim() || settings.timezone_label,
          address: settings.location_address
        }),
      });
      toast.success('Site profile saved');
      fetchAll();
    } catch { toast.error('Save failed'); }
    setSaving(false);
  };

  const saveBuilding = async () => {
    const method = buildingModal?.mode === 'edit' ? 'PUT' : 'POST';
    const path = buildingModal?.mode === 'edit' ? `/devices/buildings/${buildingModal.data!.pk_building_id}` : '/devices/buildings';
    await apiRequest(path, { accessToken, scopeHeaders, method, body: JSON.stringify(buildingForm) });
    setBuildingModal(null); fetchAll();
  };

  const deleteBuilding = async (id: string) => {
    if (!confirm('Delete this building and all its floors?')) return;
    await apiRequest(`/devices/buildings/${id}`, { accessToken, scopeHeaders, method: 'DELETE' });
    fetchAll();
  };

  const saveFloor = async () => {
    const method = floorModal?.mode === 'edit' ? 'PUT' : 'POST';
    const path = floorModal?.mode === 'edit' ? `/devices/floors/${floorModal.data!.pk_floor_id}` : `/devices/buildings/${floorModal?.buildingId}/floors`;
    await apiRequest(path, { accessToken, scopeHeaders, method, body: JSON.stringify(floorForm) });
    setFloorModal(null); fetchAll();
  };

  const deleteFloor = async (id: string) => {
    if (!confirm('Delete this floor?')) return;
    await apiRequest(`/devices/floors/${id}`, { accessToken, scopeHeaders, method: 'DELETE' });
    fetchAll();
  };

  const toggleBuilding = (id: string) => setExpandedBuildings(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Site Management</h2>
          <p className="text-xs text-slate-400 mt-0.5">Configure facility profile, timezone and building hierarchy</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">Site ID: {settings?.pk_site_id}</span>
          <button onClick={fetchAll} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><RefreshCw className="w-4 h-4 text-slate-500" /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Site Settings */}
        <div className="lg:col-span-2 space-y-4">

          {/* Identity */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Identity & Location</span>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Facility Name</label>
                <input value={settings?.site_name || ''} onChange={e => setSettings(s => s ? {...s, site_name: e.target.value} : s)} className={cn(input, "mt-1")} placeholder="e.g. Motivity HQ" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Physical Address</label>
                <input value={settings?.location_address || ''} onChange={e => setSettings(s => s ? {...s, location_address: e.target.value} : s)} className={cn(input, "mt-1")} placeholder="e.g. Hyderabad, India" />
              </div>
            </div>
          </div>

          {/* Timezone */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Regional Timezone</span>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Primary Timezone</label>
                <select value={settings?.timezone || 'UTC'} onChange={e => setSettings(s => s ? {...s, timezone: e.target.value} : s)} className={cn(input, "mt-1")}>
                  {TIMEZONES.map(tz => <option key={tz.iana} value={tz.iana}>{tz.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                <Clock className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">Live Site Time</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white font-mono">{currentTime || '—'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Save */}
          <button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Site Profile'}
          </button>

          {/* Buildings & Floors */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Buildings & Floors</span>
                <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-semibold">{buildings.length}</span>
              </div>
              <button onClick={() => { setBuildingForm({name:'',address:''}); setBuildingModal({mode:'add'}); }} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 border border-blue-200 dark:border-blue-800 rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Add Building
              </button>
            </div>
            <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {buildings.map(b => {
                const bFloors = floors.filter(f => f.fk_building_id === b.pk_building_id);
                const expanded = expandedBuildings.has(b.pk_building_id);
                return (
                  <div key={b.pk_building_id}>
                    <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <button onClick={() => toggleBuilding(b.pk_building_id)} className="flex items-center gap-3 flex-1 text-left">
                        <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{b.name}</p>
                          <p className="text-xs text-slate-400">{b.address || '—'} · {bFloors.length} floors · {b.nug_count} NUG · {b.camera_count} cameras</p>
                        </div>
                        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      </button>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setFloorForm({floor_number:'',floor_name:''}); setFloorModal({mode:'add',buildingId:b.pk_building_id}); }} className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg" title="Add Floor"><Plus className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { setBuildingForm({name:b.name,address:b.address||''}); setBuildingModal({mode:'edit',data:b}); }} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteBuilding(b.pk_building_id)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    {expanded && (
                      <div className="bg-slate-50/50 dark:bg-slate-800/10">
                        {bFloors.map(f => (
                          <div key={f.pk_floor_id} className="flex items-center gap-3 px-8 py-2 border-t border-slate-50 dark:border-slate-800/50">
                            <Layers className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{f.floor_name || `Floor ${f.floor_number}`}</p>
                              <p className="text-[10px] text-slate-400">Floor {f.floor_number} · {f.nug_count} NUG · {f.camera_count} cameras</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => { setFloorForm({floor_number:String(f.floor_number),floor_name:f.floor_name||''}); setFloorModal({mode:'edit',data:f}); }} className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"><Edit2 className="w-3 h-3" /></button>
                              <button onClick={() => deleteFloor(f.pk_floor_id)} className="p-1 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </div>
                        ))}
                        {bFloors.length === 0 && (
                          <div className="px-8 py-2 text-xs text-slate-400 italic">No floors added yet</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {buildings.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No buildings yet — add one to get started</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right — Status panel */}
        <div className="space-y-4">
          {/* Status card */}
          <div className="bg-slate-900 dark:bg-slate-800 rounded-2xl p-5 text-white space-y-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Registry Status</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Deployment</span>
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Site ID</span>
              <span className="text-xs font-mono text-blue-400">#{settings?.pk_site_id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Timezone</span>
              <span className="text-xs font-bold text-white">{settings?.timezone_label || settings?.timezone}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Buildings</span>
              <span className="text-xs font-bold text-white">{buildings.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Floors</span>
              <span className="text-xs font-bold text-white">{floors.length}</span>
            </div>
          </div>

          {/* Note */}
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">⚠ Important</p>
            <p className="text-xs text-amber-600 dark:text-amber-500">Changing timezone affects all check-in/out calculations and reporting for this facility.</p>
          </div>

          {/* Quick stats */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Facility Summary</p>
            {buildings.map(b => (
              <div key={b.pk_building_id} className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400 font-medium">{b.name}</span>
                <div className="flex items-center gap-2 text-slate-400">
                  <span>{floors.filter(f=>f.fk_building_id===b.pk_building_id).length}F</span>
                  <span>{b.nug_count}N</span>
                  <span>{b.camera_count}C</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Building Modal */}
      {buildingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setBuildingModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white">{buildingModal.mode==='add'?'Add Building':'Edit Building'}</h3>
              <button onClick={() => setBuildingModal(null)}><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="text-xs font-semibold text-slate-500 uppercase">Name *</label><input value={buildingForm.name} onChange={e=>setBuildingForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Block A" className={cn(input,"mt-1")}/></div>
              <div><label className="text-xs font-semibold text-slate-500 uppercase">Address</label><input value={buildingForm.address} onChange={e=>setBuildingForm(f=>({...f,address:e.target.value}))} placeholder="e.g. Hyderabad" className={cn(input,"mt-1")}/></div>
              <div className="flex gap-2 pt-2">
                <button onClick={saveBuilding} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"><Check className="w-4 h-4"/>Save</button>
                <button onClick={()=>setBuildingModal(null)} className="px-4 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floor Modal */}
      {floorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setFloorModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white">{floorModal.mode==='add'?'Add Floor':'Edit Floor'}</h3>
              <button onClick={() => setFloorModal(null)}><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="text-xs font-semibold text-slate-500 uppercase">Floor Number *</label><input type="number" value={floorForm.floor_number} onChange={e=>setFloorForm(f=>({...f,floor_number:e.target.value}))} placeholder="7" className={cn(input,"mt-1")}/></div>
              <div><label className="text-xs font-semibold text-slate-500 uppercase">Floor Name</label><input value={floorForm.floor_name} onChange={e=>setFloorForm(f=>({...f,floor_name:e.target.value}))} placeholder="e.g. Floor 7" className={cn(input,"mt-1")}/></div>
              <div className="flex gap-2 pt-2">
                <button onClick={saveFloor} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"><Check className="w-4 h-4"/>Save</button>
                <button onClick={()=>setFloorModal(null)} className="px-4 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
