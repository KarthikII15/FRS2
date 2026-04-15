import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Camera, Server, Plus, Edit, Power, Search, RefreshCw, Settings2, 
  Loader2, Trash2, CheckCircle2, AlertCircle, Clock, Key, Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';

interface Device {
  pk_device_id: string;
  external_device_id: string;
  name: string;
  status: 'online' | 'offline' | 'error';
  ip_address: string;
  location_label: string;
  device_type: string;
  device_category: string;
  site_name: string | null;
  last_active: string;
  recognition_accuracy: string;
  total_scans: number;
}

const StatusBadge = ({ status }: { status: string }) => {
  const colors = {
    online: 'bg-green-100 text-green-700 border-green-200',
    offline: 'bg-slate-100 text-slate-600 border-slate-200',
    error: 'bg-red-100 text-red-700 border-red-200'
  };
  const icons = {
    online: CheckCircle2,
    offline: Clock,
    error: AlertCircle
  };
  const Icon = icons[status as keyof typeof icons] || Clock;
  
  return (
    <Badge className={cn('border px-2 py-1', colors[status as keyof typeof colors] || colors.offline)}>
      <Icon className="w-3 h-3 mr-1" />
      {(status || 'offline').charAt(0).toUpperCase() + (status || 'offline').slice(1)}
    </Badge>
  );
};

export const DeviceManagement: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Registration Modal
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    external_device_id: '',
    device_type_code: 'jetson_orin_nx',
    name: '',
    location_label: '',
    ip_address: ''
  });
  const [isRegistering, setIsRegistering] = useState(false);

  // Provision Modal
  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const [provisionDevice, setProvisionDevice] = useState<Device | null>(null);
  const [deviceToken, setDeviceToken] = useState('');
  const [isProvisioning, setIsProvisioning] = useState(false);

  // Action states
  const [actioningDevice, setActioningDevice] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; devices: Device[] }>(
        '/device-management/devices',
        { accessToken, scopeHeaders }
      );
      if (res.success) {
        setDevices(res.devices || []);
      }
    } catch (error) {
      toast.error('Failed to load devices');
      console.error('Fetch devices error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, scopeHeaders]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  // Register new device
  const handleRegister = async () => {
    if (!registerForm.external_device_id || !registerForm.name) {
      return toast.error('Device code and name are required');
    }

    setIsRegistering(true);
    try {
      const res = await apiRequest<{ success: boolean; device: Device }>(
        '/device-management/devices',
        {
          method: 'POST',
          accessToken,
          scopeHeaders,
          body: JSON.stringify(registerForm)
        }
      );

      if (res.success) {
        toast.success('Device registered successfully!', {
          description: 'Now provision the device to generate authentication token'
        });
        setIsRegisterOpen(false);
        setRegisterForm({
          external_device_id: '',
          device_type_code: 'jetson_orin_nx',
          name: '',
          location_label: '',
          ip_address: ''
        });
        fetchDevices();
      }
    } catch (error) {
      toast.error('Failed to register device');
      console.error('Register error:', error);
    } finally {
      setIsRegistering(false);
    }
  };

  // Provision device (generate token)
  const handleProvision = async (device: Device) => {
    setProvisionDevice(device);
    setIsProvisioning(true);
    setIsProvisionOpen(true);

    try {
      const res = await apiRequest<{ success: boolean; token: string }>(
        `/device-management/devices/${device.external_device_id}/provision`,
        {
          method: 'POST',
          accessToken,
          scopeHeaders
        }
      );

      if (res.success && res.token) {
        setDeviceToken(res.token);
        toast.success('Device token generated!');
      }
    } catch (error) {
      toast.error('Failed to provision device');
      console.error('Provision error:', error);
      setIsProvisionOpen(false);
    } finally {
      setIsProvisioning(false);
    }
  };

  // Reboot device
  const handleReboot = async (device: Device) => {
    setActioningDevice(device.pk_device_id);
    try {
      const res = await apiRequest<{ success: boolean }>(
        `/device-management/devices/${device.external_device_id}/reboot`,
        {
          method: 'POST',
          accessToken,
          scopeHeaders,
          body: JSON.stringify({ reason: 'Manual reboot from admin UI' })
        }
      );

      if (res.success) {
        toast.success('Reboot command sent!', {
          description: 'Device will restart on next heartbeat'
        });
      }
    } catch (error) {
      toast.error('Failed to send reboot command');
    } finally {
      setActioningDevice(null);
    }
  };

  // Decommission device
  const handleDecommission = async (device: Device) => {
    if (!confirm(`Decommission ${device.name}? This will mark it as inactive.`)) return;

    setActioningDevice(device.pk_device_id);
    try {
      const res = await apiRequest<{ success: boolean }>(
        `/device-management/devices/${device.external_device_id}`,
        {
          method: 'DELETE',
          accessToken,
          scopeHeaders
        }
      );

      if (res.success) {
        toast.success('Device decommissioned');
        fetchDevices();
      }
    } catch (error) {
      toast.error('Failed to decommission device');
    } finally {
      setActioningDevice(null);
    }
  };

  // Copy token to clipboard
  const copyToken = () => {
    navigator.clipboard.writeText(deviceToken);
    toast.success('Token copied to clipboard!');
  };

  // Filter devices
  const filteredDevices = devices.filter(device => {
    const matchesSearch = device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         device.external_device_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || device.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Device Management</h2>
          <p className="text-sm text-slate-500 mt-1">Register, provision, and monitor edge devices</p>
        </div>
        <Button onClick={() => setIsRegisterOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Register Device
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search devices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={fetchDevices} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Device List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredDevices.map(device => (
            <Card key={device.pk_device_id} className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      {device.device_category === 'camera' ? (
                        <Camera className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Server className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-white">{device.name}</h3>
                      <p className="text-xs text-slate-500">{device.external_device_id}</p>
                    </div>
                  </div>
                  <StatusBadge status={device.status} />
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Type:</span>
                    <span className="font-medium">{device.device_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Site:</span>
                    <span className="font-medium">{device.site_name || 'Unassigned'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">IP:</span>
                    <span className="font-mono text-xs">{device.ip_address}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Accuracy:</span>
                    <span className="font-medium">
                      {parseFloat(device.recognition_accuracy || '0').toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Scans:</span>
                    <span className="font-medium">
                      {(device.total_scans ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleProvision(device)}
                    className="flex-1 gap-1"
                  >
                    <Key className="w-3 h-3" />
                    Token
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReboot(device)}
                    disabled={actioningDevice === device.pk_device_id || device.status === 'offline'}
                    className="flex-1 gap-1"
                  >
                    {actioningDevice === device.pk_device_id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Power className="w-3 h-3" />
                    )}
                    Reboot
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDecommission(device)}
                    disabled={actioningDevice === device.pk_device_id}
                    className="gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filteredDevices.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <p className="text-slate-500">No devices found</p>
        </div>
      )}

      {/* Register Device Dialog */}
      <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Register New Device</DialogTitle>
            <DialogDescription>
              Add a new edge device to the FRS2 system
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Device Code *</Label>
              <Input
                placeholder="jetson-orin-02"
                value={registerForm.external_device_id}
                onChange={(e) => setRegisterForm({ ...registerForm, external_device_id: e.target.value })}
              />
            </div>
            <div>
              <Label>Device Type *</Label>
              <Select
                value={registerForm.device_type_code}
                onValueChange={(value) => setRegisterForm({ ...registerForm, device_type_code: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jetson_orin_nx">Jetson Orin NX</SelectItem>
                  <SelectItem value="hikvision_camera">Hikvision Camera</SelectItem>
                  <SelectItem value="jetson_xavier_nx">Jetson Xavier NX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Device Name *</Label>
              <Input
                placeholder="Main Entrance Jetson"
                value={registerForm.name}
                onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Location Label</Label>
              <Input
                placeholder="Building A - Floor 1"
                value={registerForm.location_label}
                onChange={(e) => setRegisterForm({ ...registerForm, location_label: e.target.value })}
              />
            </div>
            <div>
              <Label>IP Address</Label>
              <Input
                placeholder="172.18.3.202"
                value={registerForm.ip_address}
                onChange={(e) => setRegisterForm({ ...registerForm, ip_address: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsRegisterOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleRegister} disabled={isRegistering} className="flex-1 gap-2">
                {isRegistering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Register
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Provision Device Dialog */}
      <Dialog open={isProvisionOpen} onOpenChange={setIsProvisionOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Device Provisioning</DialogTitle>
            <DialogDescription>
              Authentication token for {provisionDevice?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {isProvisioning ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : (
              <>
                <div>
                  <Label>Device Token (Valid for 1 year)</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={deviceToken}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button onClick={copyToken} variant="outline" className="gap-2">
                      <Copy className="w-4 h-4" />
                      Copy
                    </Button>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border">
                  <h4 className="font-bold mb-2">Installation Instructions:</h4>
                  <ol className="text-sm space-y-2 list-decimal list-inside text-slate-600 dark:text-slate-400">
                    <li>Save the token to <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">/opt/frs/device_token.txt</code> on the device</li>
                    <li>Restart the FRS runner service: <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">sudo systemctl restart frs-runner</code></li>
                    <li>Verify connection in device logs</li>
                  </ol>
                </div>

                <Button onClick={() => setIsProvisionOpen(false)} className="w-full">
                  Done
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
