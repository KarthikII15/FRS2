import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { apiRequest } from '../../services/http/apiClient';
import { cn } from '../ui/utils';
import { toast } from 'sonner';
import {
  Globe, Clock, Save, MapPin, Building2, Plus, Loader2,
  Edit2, Trash2, ChevronDown, ChevronRight, Layers, X, Check,
  RefreshCw, Settings, Wifi, Cpu, LayoutDashboard
} from 'lucide-react';
import { DeviceCommandCenter } from './DeviceCommandCenter';

interface Site { pk_site_id: string; site_name: string; timezone: string; timezone_label: string; location_address: string; status?: 'active' | 'inactive'; }
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

export const SiteSettings: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [settings, setSettings] = useState<Site | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'detail' | 'create'>('list');
  const { sites: authSites, setActiveScope, activeScope, memberships } = useAuth();
  const [siteList, setSiteList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'profile' | 'hardware'>('profile');

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

  const fetchAll = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      if (viewMode === 'list') {
        const res = await apiRequest<{data: any[]}>(`/site`, { 
          accessToken, 
          scopeHeaders: { 'x-tenant-id': activeScope?.tenantId || '' } 
        });
        setSiteList(res.data || []);
      } else {
        const [site, bldgs] = await Promise.all([
          apiRequest<Site>('/site/settings', { accessToken, scopeHeaders }),
          apiRequest<{data:Building[]}>('/devices/buildings', { accessToken, scopeHeaders }),
        ]);
        setSettings(site);
        setBuildings(bldgs.data || []);
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
      }
    } catch { toast.error(viewMode === 'list' ? 'Failed to load sites' : 'Failed to load site profile'); }
    setLoading(false);
  }, [accessToken, viewMode, scopeHeaders, activeScope?.tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const manageSite = (site: any, tab: 'profile' | 'hardware' = 'profile') => {
    const targetSiteId = String(site.id);
    const membership = memberships.find(m => !m.scope.siteId || String(m.scope.siteId) === targetSiteId);
    
    if (membership) {
      setActiveScope({
        tenantId: membership.scope.tenantId,
        customerId: site.fk_customer_id || membership.scope.customerId || activeScope?.customerId || '1',
        siteId: targetSiteId,
      });
      setActiveTab(tab);
      setViewMode('detail');
    } else {
      toast.error('No permission for this site');
    }
  };

  const startCreate = () => {
    setSettings({
      pk_site_id: 'new',
      site_name: '',
      location_address: '',
      timezone: 'UTC',
      timezone_label: 'UTC'
    });
    setBuildings([]);
    setFloors([]);
    setViewMode('create');
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const method = viewMode === 'create' ? 'POST' : 'PATCH';
      const path = viewMode === 'create' ? '/site' : '/site/settings';
      const payload = {
        name: settings.site_name,
        timezone: settings.timezone,
        timezone_label: TIMEZONES.find(t => t.iana === settings.timezone)?.label.split('—')[0].trim() || settings.timezone_label,
        address: settings.location_address,
        ...(viewMode === 'create' && { customerId: activeScope?.customerId || authSites[0]?.customerId })
      };
      await apiRequest(path, { accessToken, scopeHeaders, method, body: JSON.stringify(payload) });
      toast.success(viewMode === 'create' ? 'Site created successfully' : 'Site profile saved');
      if (viewMode === 'create') setViewMode('list'); else fetchAll();
    } catch { toast.error(viewMode === 'create' ? 'Failed to create site' : 'Save failed'); }
    setSaving(false);
  };

  const handleDeleteSite = async () => {
    if (!settings?.pk_site_id) return;
    if (!window.confirm(`Are you absolutely sure you want to delete "${settings.site_name}"? This will remove all associated buildings, floors, and data.`)) return;
    setSaving(true);
    try {
      await apiRequest('/site/delete', { accessToken, method: 'POST', body: JSON.stringify({ siteId: settings.pk_site_id }) });
      toast.success('Site deleted successfully');
      setViewMode('list');
    } catch (err: any) { toast.error(err.message || 'Failed to delete site'); }
    setSaving(false);
  };

  const handleStatusToggle = async () => {
    if (!settings?.pk_site_id) return;
    const newStatus = settings.status === 'inactive' ? 'active' : 'inactive';
    if (newStatus === 'inactive' && !window.confirm(`Deactivating "${settings.site_name}" may restrict access. Continue?`)) return;
    setSaving(true);
    try {
      await apiRequest('/site/settings', { accessToken, method: 'PATCH', scopeHeaders: { 'x-site-id': settings.pk_site_id }, body: JSON.stringify({ status: newStatus }) });
      toast.success(`Site ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
      fetchAll();
    } catch { toast.error('Failed to update site status'); }
    setSaving(false);
  };

  if (viewMode === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Site Profile</h2>
            <p className="text-xs text-slate-400 mt-0.5">Manage and configure all listed sites</p>
          </div>
          <button onClick={startCreate} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95">
            <Plus className="w-4 h-4" /> Create a Site
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {siteList.length === 0 ? (
            <div className="col-span-full py-20 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center text-center">
              <Globe className="w-12 h-12 text-slate-300 mb-4" />
              <p className="text-slate-500 font-medium">No sites found</p>
              <button onClick={startCreate} className="mt-4 text-sm text-blue-600 font-bold hover:underline">Add your first site →</button>
            </div>
          ) : (
            siteList.map(s => (
              <div key={s.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl group-hover:bg-blue-600 transition-colors duration-500 relative">
                    <Globe className="w-5 h-5 text-blue-600 group-hover:text-white transition-colors" />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">ID: {s.id}</span>
                    <span className={cn("text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded", s.status === 'inactive' ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600")}>
                      {s.status || 'active'}
                    </span>
                  </div>
                </div>
                <h3 className="font-bold text-slate-800 dark:text-white truncate text-base">{s.name}</h3>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => manageSite(s, 'profile')} className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 text-slate-600 dark:text-slate-300 hover:text-white text-[10px] font-black rounded-xl transition-all flex items-center justify-center gap-1.5"><Settings className="w-3 h-3" />Profile</button>
                  <button onClick={() => manageSite(s, 'hardware')} className="flex-1 py-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white text-[10px] font-black rounded-xl transition-all flex items-center justify-center gap-1.5"><Cpu className="w-3 h-3" />Hardware</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => { setViewMode('list'); setActiveTab('profile'); }} className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 shadow-sm"><ChevronRight className="w-5 h-5 rotate-180" /></button>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{viewMode === 'create' ? 'Create New Site' : settings?.site_name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{viewMode === 'create' ? 'Enter site details' : settings?.location_address}</p>
          </div>
        </div>
        {viewMode === 'detail' && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/50">
              <button onClick={() => setActiveTab('profile')} className={cn("flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all", activeTab === 'profile' ? "bg-white dark:bg-slate-900 shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700")}><LayoutDashboard className="w-3.5 h-3.5" />Profile</button>
              <button onClick={() => setActiveTab('hardware')} className={cn("flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all", activeTab === 'hardware' ? "bg-white dark:bg-slate-900 shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700")}><Cpu className="w-3.5 h-3.5" />Hardware</button>
            </div>
            <button onClick={fetchAll} className="p-2 hover:bg-slate-100 rounded-lg"><RefreshCw className="w-4 h-4 text-slate-500" /></button>
          </div>
        )}
      </div>

      {viewMode === 'detail' && activeTab === 'hardware' ? (
        <DeviceCommandCenter />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Identity & Location</span>
              </div>
              <div className="p-5 space-y-4">
                <div><label className="text-xs font-semibold text-slate-500 uppercase">Facility Name</label><input value={settings?.site_name || ''} onChange={e => setSettings(s => s ? {...s, site_name: e.target.value} : s)} className={cn(input, "mt-1")} /></div>
                <div><label className="text-xs font-semibold text-slate-500 uppercase">Physical Address</label><input value={settings?.location_address || ''} onChange={e => setSettings(s => s ? {...s, location_address: e.target.value} : s)} className={cn(input, "mt-1")} /></div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Regional Timezone</span>
              </div>
              <div className="p-5 space-y-4">
                <select value={settings?.timezone || 'UTC'} onChange={e => setSettings(s => s ? {...s, timezone: e.target.value} : s)} className={cn(input, "mt-1")}>
                  {TIMEZONES.map(tz => <option key={tz.iana} value={tz.iana}>{tz.label}</option>)}
                </select>
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                  <Clock className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  <div><p className="text-xs text-slate-400">Live Site Time</p><p className="text-lg font-bold text-slate-900 dark:text-white font-mono">{currentTime || '—'}</p></div>
                </div>
              </div>
            </div>
            <button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Site Profile'}
            </button>
          </div>

          <div className="space-y-4">
            {settings && viewMode !== 'create' && (
              <div className="bg-slate-900 dark:bg-slate-800 rounded-2xl p-5 text-white space-y-4 shadow-xl">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Registry Status</p>
                <div className="flex items-center justify-between"><span className="text-sm text-slate-300">Deployment</span><span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE</span></div>
                <div className="flex items-center justify-between"><span className="text-sm text-slate-300">Site ID</span><span className="text-xs font-mono text-blue-400">#{settings?.pk_site_id}</span></div>
                <div className="flex items-center justify-between"><span className="text-sm text-slate-300">Timezone</span><span className="text-xs font-bold text-white">{settings?.timezone_label || settings?.timezone}</span></div>
                <div className="flex items-center justify-between"><span className="text-sm text-slate-300">Buildings</span><span className="text-xs font-bold text-white">{buildings.length}</span></div>
                <div className="flex items-center justify-between"><span className="text-sm text-slate-300">Floors</span><span className="text-xs font-bold text-white">{floors.length}</span></div>
              </div>
            )}
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">⚠ Important</p>
              <p className="text-xs text-amber-600 dark:text-amber-500">Changing timezone affects all attendance calculations.</p>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'detail' && settings && activeTab === 'profile' && (
        <div className="mt-8 border-t-2 border-red-100 dark:border-red-900/30 pt-8">
          <h3 className="text-red-600 dark:text-red-400 font-black text-sm uppercase tracking-widest mb-4 flex items-center gap-2"><span className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />Danger Zone</h3>
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 text-center md:text-left"><p className="text-slate-800 dark:text-white font-bold text-sm mb-1">{settings.status === 'inactive' ? 'Activate Site' : 'Deactivate Site'}</p><p className="text-slate-500 text-[11px] leading-relaxed">{settings.status === 'inactive' ? 'Bring this site back online.' : 'Temporarily suspend all activity. Data remains preserved.'}</p></div>
            <button onClick={handleStatusToggle} disabled={saving} className={cn("px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap min-w-[140px] justify-center", settings.status === 'inactive' ? "bg-emerald-600 text-white" : "bg-amber-600 text-white")}>{saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}{settings.status === 'inactive' ? 'ACTIVATE' : 'DEACTIVATE'}</button>
            <div className="w-px h-12 bg-red-200 dark:bg-red-900/30 hidden md:block" />
            <div className="flex-1 text-center md:text-left"><p className="text-slate-800 dark:text-white font-bold text-sm mb-1">Delete Site</p><p className="text-slate-500 text-[11px] leading-relaxed">Permanently remove this site and all its associated data.</p></div>
            <button onClick={handleDeleteSite} disabled={saving} className="px-6 py-2.5 bg-red-600 text-white  rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap min-w-[140px] justify-center">{saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}DELETE SITE</button>
          </div>
        </div>
      )}
    </div>
  );
};
