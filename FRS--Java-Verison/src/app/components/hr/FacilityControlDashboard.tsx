import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Building2, Camera, Plus, RefreshCw, Loader2, Search,
  Trash2, Edit, TestTube, CheckCircle2, XCircle, AlertCircle,
  Wifi, WifiOff, Eye, Settings, Map, Upload, Info,
} from 'lucide-react';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { authConfig } from '../../config/authConfig';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';

// ── Types ──────────────────────────────────────────────────────────────────
interface Camera {
  id: string;
  code: string;
  name: string;
  status: 'online' | 'offline' | 'error';
  location: string;
  ipAddress: string | null;
  rtspUrl: string | null;
  rtspMainUrl: string | null;
  snapshotUrl: string | null;
  brand: string;
  role: string;
  fpsTarget: number;
  resolution: string;
  channel: number;
  rtspPort: number;
  httpPort: number;
  lastHeartbeatAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

interface NewCameraForm {
  code: string;
  name: string;
  ipAddress: string;
  location: string;
  rtspUsername: string;
  rtspPassword: string;
  channel: string;
  rtspPort: string;
  httpPort: string;
  role: string;
  fpsTarget: string;
}

const EMPTY_FORM: NewCameraForm = {
  code: '', name: '', ipAddress: '', location: '',
  rtspUsername: 'admin', rtspPassword: '',
  channel: '1', rtspPort: '554', httpPort: '80',
  role: 'entry', fpsTarget: '5',
};

// ── Component ──────────────────────────────────────────────────────────────
export const FacilityControlDashboard: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();

  const [cameras, setCameras]     = useState<Camera[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState('');

  // Modal state
  const [addOpen, setAddOpen]     = useState(false);
  const [editOpen, setEditOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState<Camera | null>(null);
  const [form, setForm]           = useState<NewCameraForm>(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);

  // Discover modal
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoverIp, setDiscoverIp]     = useState('');
  const [discoverUser, setDiscoverUser] = useState('admin');
  const [discoverPass, setDiscoverPass] = useState('');
  const [discovering, setDiscovering]   = useState(false);
  const [discovered, setDiscovered]     = useState<any>(null);

  // Per-camera test state
  const [testingId, setTestingId]   = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({});
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [snapshots, setSnapshots]   = useState<Record<string, string>>({});

  // ── Load cameras ─────────────────────────────────────────────────────────
  const loadCameras = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true); setError(null);
    try {
      const res = await apiRequest<{ data: Camera[] }>('/cameras', { accessToken, scopeHeaders });
      setCameras(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cameras');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, scopeHeaders]);

  useEffect(() => { loadCameras(); }, [loadCameras]);

  // ── Add camera ────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.code || !form.name) { toast.error('Code and name are required'); return; }
    setSaving(true);
    try {
      await apiRequest('/cameras', {
        method: 'POST', accessToken, scopeHeaders,
        body: JSON.stringify({
          code:         form.code,
          name:         form.name,
          ipAddress:    form.ipAddress || undefined,
          location:     form.location || undefined,
          rtspUsername: form.rtspUsername || undefined,
          rtspPassword: form.rtspPassword || undefined,
          channel:      Number(form.channel) || 1,
          rtspPort:     Number(form.rtspPort) || 554,
          httpPort:     Number(form.httpPort) || 80,
          role:         form.role,
          fpsTarget:    Number(form.fpsTarget) || 5,
          brand:        'prama_hikvision',
        }),
      });
      toast.success('Camera registered', { description: `${form.name} added successfully.` });
      setAddOpen(false); setForm(EMPTY_FORM);
      await loadCameras();
    } catch (e) {
      toast.error('Failed to register', { description: e instanceof Error ? e.message : String(e) });
    } finally { setSaving(false); }
  };

  // ── Edit camera ───────────────────────────────────────────────────────────
  const openEdit = (cam: Camera) => {
    setEditTarget(cam);
    setForm({
      code:         cam.code,
      name:         cam.name,
      ipAddress:    cam.ipAddress ?? '',
      location:     cam.location ?? '',
      rtspUsername: 'admin',
      rtspPassword: '',
      channel:      String(cam.channel ?? 1),
      rtspPort:     String(cam.rtspPort ?? 554),
      httpPort:     String(cam.httpPort ?? 80),
      role:         cam.role ?? 'entry',
      fpsTarget:    String(cam.fpsTarget ?? 5),
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/cameras/${editTarget.id}`, {
        method: 'PUT', accessToken, scopeHeaders,
        body: JSON.stringify({
          name:         form.name,
          location:     form.location || undefined,
          ipAddress:    form.ipAddress || undefined,
          rtspUsername: form.rtspUsername || undefined,
          rtspPassword: form.rtspPassword || undefined,
          channel:      Number(form.channel) || undefined,
          rtspPort:     Number(form.rtspPort) || undefined,
          httpPort:     Number(form.httpPort) || undefined,
          role:         form.role,
          fpsTarget:    Number(form.fpsTarget) || undefined,
        }),
      });
      toast.success('Camera updated');
      setEditOpen(false); setEditTarget(null);
      await loadCameras();
    } catch (e) {
      toast.error('Update failed', { description: e instanceof Error ? e.message : String(e) });
    } finally { setSaving(false); }
  };

  // ── Delete camera ─────────────────────────────────────────────────────────
  const handleDelete = async (cam: Camera) => {
    if (!window.confirm(`Remove camera "${cam.name}"? This cannot be undone.`)) return;
    try {
      await apiRequest(`/cameras/${cam.id}`, { method: 'DELETE', accessToken, scopeHeaders });
      toast.success('Camera removed');
      await loadCameras();
    } catch (e) {
      toast.error('Delete failed', { description: e instanceof Error ? e.message : String(e) });
    }
  };

  // ── Test RTSP ─────────────────────────────────────────────────────────────
  const handleTest = async (cam: Camera) => {
    setTestingId(cam.id);
    setTestResults(prev => ({ ...prev, [cam.id]: null }));
    try {
      const res = await apiRequest<{ reachable: boolean; message: string }>(
        `/cameras/${cam.id}/test`, { method: 'POST', accessToken, scopeHeaders }
      );
      setTestResults(prev => ({ ...prev, [cam.id]: res.reachable }));
      if (res.reachable) toast.success('Camera reachable', { description: res.message });
      else toast.warning('Camera unreachable', { description: res.message });
    } catch (e) {
      setTestResults(prev => ({ ...prev, [cam.id]: false }));
      toast.error('Test failed');
    } finally { setTestingId(null); }
  };

  // ── Snapshot ──────────────────────────────────────────────────────────────
  const handleSnapshot = async (cam: Camera) => {
    setSnapshotId(cam.id);
    try {
      const url = `${authConfig.apiBaseUrl}/cameras/${cam.id}/snapshot`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      setSnapshots(prev => ({ ...prev, [cam.id]: objUrl }));
      toast.success('Snapshot captured');
    } catch (e) {
      toast.error('Snapshot failed', { description: e instanceof Error ? e.message : String(e) });
    } finally { setSnapshotId(null); }
  };

  // ── Discover camera ───────────────────────────────────────────────────────
  const handleDiscover = async () => {
    if (!discoverIp) { toast.error('Enter camera IP address'); return; }
    setDiscovering(true); setDiscovered(null);
    try {
      const res = await apiRequest<any>('/cameras/discover', {
        method: 'POST', accessToken, scopeHeaders,
        body: JSON.stringify({ ipAddress: discoverIp, username: discoverUser, password: discoverPass }),
      });
      setDiscovered(res);
      if (res.reachable) toast.success('Camera found!', { description: res.deviceInfo?.model || 'Prama/Hikvision camera detected' });
      else toast.warning('IP reachable but ISAPI not responding', { description: 'Check credentials' });
    } catch (e) {
      toast.error('Discovery failed', { description: e instanceof Error ? e.message : String(e) });
    } finally { setDiscovering(false); }
  };

  const useDiscovered = () => {
    if (!discovered?.suggestedConfig) return;
    const c = discovered.suggestedConfig;
    setForm({
      code:         c.code,
      name:         c.name,
      ipAddress:    c.ipAddress,
      location:     '',
      rtspUsername: c.username || 'admin',
      rtspPassword: discoverPass,
      channel:      String(c.channel || 1),
      rtspPort:     '554',
      httpPort:     '80',
      role:         c.role || 'entry',
      fpsTarget:    String(c.fpsTarget || 5),
    });
    setDiscoverOpen(false);
    setAddOpen(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const filtered = cameras.filter(c => {
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) ||
      (c.ipAddress || '').includes(q) || (c.location || '').toLowerCase().includes(q);
  });

  const onlineCount  = cameras.filter(c => c.status === 'online').length;
  const offlineCount = cameras.filter(c => c.status === 'offline').length;

  const CameraForm = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      {[
        { label: 'Camera Code *', key: 'code',     type: 'text', ph: 'CAM-001', disabled: !!editTarget },
        { label: 'Display Name *',key: 'name',     type: 'text', ph: 'Main Entrance' },
        { label: 'Camera IP',     key: 'ipAddress',type: 'text', ph: '172.18.3.201' },
        { label: 'Location Label',key: 'location', type: 'text', ph: 'Building A - Ground Floor' },
        { label: 'RTSP Username', key: 'rtspUsername', type: 'text', ph: 'admin' },
        { label: 'RTSP Password', key: 'rtspPassword', type: 'password', ph: '••••••' },
        { label: 'Channel',       key: 'channel',  type: 'number', ph: '1' },
        { label: 'RTSP Port',     key: 'rtspPort', type: 'number', ph: '554' },
        { label: 'HTTP Port',     key: 'httpPort', type: 'number', ph: '80' },
        { label: 'FPS Target',    key: 'fpsTarget',type: 'number', ph: '5' },
      ].map(f => (
        <div key={f.key}>
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">{f.label}</Label>
          <Input
            type={f.type}
            placeholder={f.ph}
            value={(form as any)[f.key]}
            disabled={(f as any).disabled}
            onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
          />
        </div>
      ))}
      <div>
        <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Role</Label>
        <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
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
  );

  const statusDot = (s: string) =>
    s === 'online' ? 'bg-emerald-500' : s === 'error' ? 'bg-amber-500' : 'bg-red-500';
  const statusText = (s: string) =>
    s === 'online' ? 'text-emerald-600' : s === 'error' ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className={cn('text-lg font-bold', lightTheme.text.primary)}>
            Camera & Device Registry
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            {cameras.length} cameras registered · {onlineCount} online · {offlineCount} offline
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDiscoverOpen(true)} className="gap-1.5">
            <Search className="w-3.5 h-3.5" /> Discover Camera
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadCameras()} disabled={isLoading} className="gap-1.5">
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4" /> Add Camera
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input placeholder="Search cameras..." value={search}
          onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      

      {/* Camera table */}
      <Card className={cn(lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-950 dark:border-border')}>
        <CardContent className="p-0">
          {isLoading && cameras.length === 0 ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-slate-400 text-sm">Loading cameras...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <AlertCircle className="w-6 h-6 text-red-400" />
              <span className="text-slate-400 text-sm">{error}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Camera className="w-12 h-12 text-slate-300" />
              <div className="text-center">
                <p className="text-slate-500 font-medium">
                  {cameras.length === 0 ? 'No cameras registered yet' : 'No cameras match the search'}
                </p>
                {cameras.length === 0 && (
                  <p className="text-slate-400 text-sm mt-1">
                    Click "Discover Camera" to auto-detect your Prama camera,<br/>
                    or "Add Camera" to register manually.
                  </p>
                )}
              </div>
              {cameras.length === 0 && (
                <Button variant="outline" onClick={() => setDiscoverOpen(true)} className="gap-1.5">
                  <Search className="w-4 h-4" /> Discover Camera
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50 border-none">
                  {['Camera', 'IP / RTSP', 'Location', 'Role', 'Status', 'Last Seen', 'Actions'].map(h => (
                    <th key={h} className="text-left px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{h}</th>
                  ))}
                </tr>
                </thead>
                <tbody className={cn('divide-y', lightTheme.border.default, 'dark:divide-slate-800')}>
                  {filtered.map(cam => (
                    <tr key={cam.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center',
                            cam.status === 'online' ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-slate-100 dark:bg-slate-800'
                          )}>
                            <Camera className={cn('w-4 h-4', cam.status === 'online' ? 'text-blue-600' : 'text-slate-400')} />
                          </div>
                          <div>
                            <p className={cn('font-semibold text-sm', lightTheme.text.primary)}>{cam.name}</p>
                            <p className="text-xs font-mono text-slate-400">{cam.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-mono text-slate-600 dark:text-slate-300">{cam.ipAddress || '—'}</p>
                        {cam.rtspUrl && (
                          <p className="text-xs font-mono text-slate-400 truncate max-w-[180px]" title={cam.rtspUrl}>
                            {cam.rtspUrl.replace(/:[^:@]*@/, ':****@')}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{cam.location || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200 capitalize">
                          {cam.role || 'entry'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {testingId === cam.id ? (
                            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                          ) : testResults[cam.id] === true ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          ) : testResults[cam.id] === false ? (
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                          ) : (
                            <span className={cn('w-2 h-2 rounded-full', statusDot(cam.status))} />
                          )}
                          <span className={cn('text-xs font-semibold capitalize', statusText(cam.status))}>
                            {cam.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                        {cam.lastSeenAt ? new Date(cam.lastSeenAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                            title="Test RTSP connection"
                            disabled={testingId === cam.id}
                            onClick={() => handleTest(cam)}>
                            {testingId === cam.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Wifi className="w-3.5 h-3.5" />}
                          </Button>
                          <Button variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-purple-600 hover:bg-purple-50"
                            title="Capture snapshot"
                            disabled={snapshotId === cam.id}
                            onClick={() => handleSnapshot(cam)}>
                            {snapshotId === cam.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Eye className="w-3.5 h-3.5" />}
                          </Button>
                          <Button variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-slate-600 hover:bg-slate-100"
                            title="Edit camera"
                            onClick={() => openEdit(cam)}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                            title="Remove camera"
                            onClick={() => handleDelete(cam)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Snapshots row */}
              {Object.keys(snapshots).length > 0 && (
                <div className="p-4 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Live Snapshots</p>
                  <div className="flex gap-4 flex-wrap">
                    {Object.entries(snapshots).map(([id, url]) => {
                      const cam = cameras.find(c => c.id === id);
                      return (
                        <div key={id} className="relative">
                          <img src={url} alt={cam?.name || id}
                            className="h-32 rounded-lg border border-slate-200 dark:border-slate-700 object-cover" />
                          <p className="text-xs text-slate-500 mt-1 text-center">{cam?.name || id}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      {/* ── Discover Dialog ──────────────────────────────────────── */}
      <Dialog open={discoverOpen} onOpenChange={setDiscoverOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold">Discover Camera</DialogTitle>
            <DialogDescription>Probe the network for a Prama / Hikvision camera via ISAPI.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Camera IP Address</Label>
              <Input placeholder="192.168.1.101" value={discoverIp} onChange={e => setDiscoverIp(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Username</Label>
                <Input value={discoverUser} onChange={e => setDiscoverUser(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Password</Label>
                <Input type="password" value={discoverPass} onChange={e => setDiscoverPass(e.target.value)} />
              </div>
            </div>
            {discovered && (
              <div className={cn('p-3 rounded-lg text-sm', discovered.reachable ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                {discovered.reachable
                  ? `Found: ${discovered.deviceInfo?.model || 'Unknown model'} — ${discovered.deviceInfo?.serialNumber || ''}`
                  : 'IP reachable but ISAPI not responding. Check credentials.'}
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleDiscover} disabled={discovering} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {discovering ? 'Probing…' : 'Probe Network'}
              </Button>
              {discovered?.reachable && (
                <Button onClick={useDiscovered} variant="outline" className="flex-1 gap-1.5">
                  <Plus className="w-4 h-4" /> Use This Camera
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Camera Dialog ─────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={open => { setAddOpen(open); if (!open) setForm(EMPTY_FORM); }}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold">Register Camera</DialogTitle>
            <DialogDescription>Fill in the camera details. Fields marked * are required.</DialogDescription>
          </DialogHeader>
          <CameraForm />
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Registering…' : 'Register Camera'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Camera Dialog ────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={open => { setEditOpen(open); if (!open) { setEditTarget(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold">Edit Camera — {editTarget?.name}</DialogTitle>
            <DialogDescription>Update camera configuration. Code cannot be changed.</DialogDescription>
          </DialogHeader>
          <CameraForm />
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

