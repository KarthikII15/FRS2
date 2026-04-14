import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import {
  Camera, Brain, Plus, Edit, Power, Search,
  RefreshCw, Settings2, Globe, Terminal, Loader2, ScanEye, Trash2,
  ArrowUpCircle, CheckCircle2, CloudDownload
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';

const NeonIcon = ({ icon: Icon, color }: { icon: any, color: string }) => (
  <div className="relative flex items-center justify-center p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
    <Icon className={cn("w-5 h-5", color)} style={{ filter: 'drop-shadow(0 0 8px currentColor)' }} />
  </div>
);

export const DeviceManagement: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [devices, setDevices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Registration States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [regForm, setRegForm] = useState({ name: '', code: '', ip: '', location: '', user: 'admin', pass: '' });

  // Edit/Delete States
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: '', location: '' });

  // Firmware States
  const [firmwareMap, setFirmwareMap] = useState<Record<string, { current: string; latest: string; updateAvailable: boolean }>>({});
  const [checkingFirmware, setCheckingFirmware] = useState(false);
  const [updatingFirmwareId, setUpdatingFirmwareId] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await apiRequest<{ data: any[] }>('/cameras', { accessToken, scopeHeaders });
      setDevices(res.data || []);
    } catch { toast.error('Registry sync failed'); }
    finally { setIsLoading(false); }
  }, [accessToken, scopeHeaders]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  // Unified Discovery Logic
  const handleProbe = async () => {
    if (!regForm.ip) return toast.error("IP Address required");
    setIsDiscovering(true);
    try {
      const res = await apiRequest<any>('/cameras/discover', {
        method: 'POST', accessToken, scopeHeaders,
        body: JSON.stringify({ ipAddress: regForm.ip, username: regForm.user, password: regForm.pass })
      });
      if (res.reachable) {
        setRegForm({ ...regForm, name: res.suggestedConfig.name, code: res.suggestedConfig.code });
        toast.success("Hardware Found", { description: res.deviceInfo.model });
      } else { toast.warning("IP reachable, ISAPI offline"); }
    } catch { toast.error("Discovery service unavailable"); }
    finally { setIsDiscovering(false); }
  };

  const openEdit = (device: any) => {
    setEditTarget(device);
    setEditForm({ name: device.name, location: device.location || '' });
    setIsEditOpen(true);
  };

  const handleEditDevice = async () => {
    if (!editTarget) return;
    try {
      await apiRequest(`/cameras/${editTarget.id}`, {
        method: 'PUT', accessToken, scopeHeaders,
        body: JSON.stringify({ name: editForm.name, location: editForm.location }),
      });
      toast.success('Device updated');
      setIsEditOpen(false);
      fetchDevices();
    } catch { toast.error('Update failed'); }
  };

  const checkFirmwareUpdates = async () => {
    setCheckingFirmware(true);
    try {
      const res = await apiRequest<{ data: Record<string, { current: string; latest: string; updateAvailable: boolean }> }>(
        '/cameras/firmware/check', { accessToken, scopeHeaders }
      );
      if (res?.data) setFirmwareMap(res.data);
      const updatable = Object.values(res?.data ?? {}).filter(f => f.updateAvailable).length;
      updatable > 0 ? toast.warning(`${updatable} device(s) have firmware updates available`) : toast.success('All devices are up to date');
    } catch { toast.error('Firmware check failed'); }
    finally { setCheckingFirmware(false); }
  };

  const handleFirmwareUpdate = async (device: any) => {
    if (!window.confirm(`Update firmware on "${device.name}"? The device will reboot after flashing.`)) return;
    setUpdatingFirmwareId(device.id);
    try {
      await apiRequest(`/cameras/${device.id}/firmware/update`, { method: 'POST', accessToken, scopeHeaders });
      toast.success(`Firmware update started for "${device.name}"`, { description: 'Device will reboot automatically' });
      setFirmwareMap(prev => ({ ...prev, [device.id]: { ...prev[device.id], updateAvailable: false } }));
    } catch { toast.error('Firmware update failed'); }
    finally { setUpdatingFirmwareId(null); }
  };

  const handleDeleteDevice = async (device: any) => {
    if (!window.confirm(`Remove "${device.name}" from the registry? This cannot be undone.`)) return;
    try {
      await apiRequest(`/cameras/${device.id}`, { method: 'DELETE', accessToken, scopeHeaders });
      toast.success('Device removed');
      fetchDevices();
    } catch { toast.error('Delete failed'); }
  };

  const handleFinalRegister = async () => {
    try {
      await apiRequest('/cameras', {
        method: 'POST', accessToken, scopeHeaders,
        body: JSON.stringify({ ...regForm, brand: 'prama_hikvision', channel: 1, fpsTarget: 5 })
      });
      toast.success("Asset Provisioned");
      setIsAddOpen(false);
      fetchDevices();
    } catch { toast.error("Provisioning failed"); }
  };

  const filtered = devices.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Device Registry</h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Hardware Provisioning & Master Config</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={checkFirmwareUpdates} disabled={checkingFirmware} className="rounded-xl font-black text-xs border-slate-200 gap-2">
            {checkingFirmware ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
            CHECK FIRMWARE
          </Button>
          <Button onClick={() => setIsAddOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl px-6">
            <Plus className="w-4 h-4 mr-2" /> REGISTER NEW ASSET
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((device) => {
          const isAI = device.code?.includes('jetson');
          return (
            <Card key={device.id} className="border shadow-sm bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 overflow-hidden">
              <CardContent className="p-6">
                <div className="flex justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <NeonIcon icon={isAI ? Brain : Camera} color={isAI ? "text-purple-500" : "text-blue-500"} />
                    <div>
                      <h4 className="font-black text-slate-800 dark:text-white text-sm">{device.name}</h4>
                      <p className="text-[10px] font-mono font-bold text-slate-400 uppercase">{device.code}</p>
                    </div>
                  </div>
                  <Badge className="bg-emerald-50 text-emerald-600 border-none text-[9px] font-black uppercase">{device.status}</Badge>
                </div>
                
                <div className="space-y-2 mb-6">
                   <div className="flex justify-between text-[10px] font-black uppercase text-slate-400"><span>IP Node</span><span className="text-slate-700 dark:text-slate-300">{device.ipAddress}</span></div>
                   <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400">
                     <span>Firmware</span>
                     <div className="flex items-center gap-1.5">
                       <span className="text-slate-700 dark:text-slate-300">{device.firmwareVersion || firmwareMap[device.id]?.current || 'v2.4.1'}</span>
                       {firmwareMap[device.id]?.updateAvailable ? (
                         <span className="flex items-center gap-0.5 text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                           <ArrowUpCircle className="w-2.5 h-2.5" /> UPDATE
                         </span>
                       ) : firmwareMap[device.id] && (
                         <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                       )}
                     </div>
                   </div>
                   {firmwareMap[device.id]?.updateAvailable && (
                     <div className="text-[10px] text-slate-400">Latest: <span className="text-blue-600 font-bold">{firmwareMap[device.id].latest}</span></div>
                   )}
                </div>

                <div className="flex gap-2">
                  {firmwareMap[device.id]?.updateAvailable && (
                    <Button size="sm" disabled={updatingFirmwareId === device.id} onClick={() => handleFirmwareUpdate(device)}
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black gap-1">
                      {updatingFirmwareId === device.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUpCircle className="w-3 h-3" />}
                      FLASH UPDATE
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="flex-1 rounded-xl text-[10px] font-black border-slate-200" onClick={() => openEdit(device)}>EDIT SPECS</Button>
                  <Button variant="outline" size="sm" className="w-10 rounded-xl text-rose-500 border-rose-100" onClick={() => handleDeleteDevice(device)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Edit Device Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-sm rounded-2xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">Edit Device</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label className="text-[10px] font-black text-slate-400 uppercase">Device Name</Label>
              <Input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="rounded-xl font-bold" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black text-slate-400 uppercase">Location</Label>
              <Input value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} placeholder="e.g. Building A – Floor 2" className="rounded-xl font-bold" />
            </div>
            <Button onClick={handleEditDevice} className="w-full bg-blue-600 text-white font-black h-11 rounded-xl">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unified Registration Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md rounded-2xl border-none shadow-2xl">
          <DialogHeader><DialogTitle className="font-black text-xl">Provision New Hardware</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-3">
              <Label className="text-[10px] font-black text-blue-400 uppercase">Network Probe (ISAPI)</Label>
              <div className="flex gap-2">
                <Input placeholder="192.168.1.101" value={regForm.ip} onChange={e => setRegForm({...regForm, ip: e.target.value})} className="bg-white rounded-xl font-bold" />
                <Button onClick={handleProbe} disabled={isDiscovering} className="bg-blue-600 rounded-xl">{isDiscovering ? <Loader2 className="animate-spin" /> : <ScanEye className="w-4 h-4" />}</Button>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1"><Label className="text-[10px] font-black text-slate-400 uppercase">Identity</Label><Input value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} placeholder="Main Gate Cam" className="rounded-xl font-bold" /></div>
              <div className="space-y-1"><Label className="text-[10px] font-black text-slate-400 uppercase">Device Code</Label><Input value={regForm.code} onChange={e => setRegForm({...regForm, code: e.target.value})} placeholder="CAM-01" className="rounded-xl font-bold" /></div>
            </div>
            <Button onClick={handleFinalRegister} className="w-full bg-slate-900 text-white font-black h-12 rounded-xl mt-4">COMPLETE PROVISIONING</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
