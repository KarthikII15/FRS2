import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { cn } from '../ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { apiRequest } from '../../services/http/apiClient';
import { 
  Server, Activity, AlertCircle, CheckCircle2, Clock, 
  Cpu, Thermometer, HardDrive, Loader2, TrendingUp
} from 'lucide-react';

interface DeviceStatus {
  external_device_id: string;
  name: string;
  status: 'online' | 'offline' | 'error';
  device_type: string;
  site_name: string;
  last_heartbeat: string;
  recognition_accuracy: string;
  total_scans: number;
  cpu_percent?: number;
  memory_used_mb?: number;
  temperature_celsius?: number;
}

interface Alert {
  pk_alert_id: number;
  alert_type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  created_at: string;
  is_read: boolean;
}

const ModularCard = ({ 
  title, 
  value, 
  icon: Icon, 
  color, 
  children, 
  className 
}: {
  title: string;
  value?: any;
  icon?: any;
  color?: string;
  children?: React.ReactNode;
  className?: string;
}) => (
  <Card className={cn("border shadow-sm transition-all duration-300 hover:shadow-md", className)}>
    <CardContent className="p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className={cn("text-xs font-bold uppercase tracking-wider mb-1", color || "text-slate-500")}>
            {title}
          </p>
          {value !== undefined && (
            <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">
              {value}
            </h2>
          )}
        </div>
        {Icon && (
          <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
            <Icon className={cn("w-5 h-5", color)} />
          </div>
        )}
      </div>
      {children}
    </CardContent>
  </Card>
);

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
    <Badge className={cn('border px-2 py-1', colors[status as keyof typeof colors])}>
      <Icon className="w-3 h-3 mr-1" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
};

export const SystemHealth: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    if (!accessToken) return;
    
    try {
      const [devicesRes, alertsRes] = await Promise.all([
        apiRequest<{ success: boolean; devices: DeviceStatus[] }>(
          '/monitoring/devices/status',
          { accessToken, scopeHeaders }
        ),
        apiRequest<{ success: boolean; alerts: Alert[] }>(
          '/monitoring/alerts',
          { accessToken, scopeHeaders }
        )
      ]);

      if (devicesRes.success) {
        setDevices(devicesRes.devices || []);
      }
      if (alertsRes.success) {
        setAlerts(alertsRes.alerts || []);
      }
    } catch (error) {
      console.error('Failed to fetch monitoring data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [accessToken]);

  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const offlineDevices = devices.filter(d => d.status === 'offline').length;
  const errorDevices = devices.filter(d => d.status === 'error').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && !a.is_read).length;
  const totalScans = devices.reduce((sum, d) => sum + (d.total_scans || 0), 0);
  const avgAccuracy = devices.length > 0 
    ? devices.reduce((sum, d) => sum + parseFloat(d.recognition_accuracy || '0'), 0) / devices.length 
    : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
          System Overview
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Real-time monitoring and system health
        </p>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ModularCard
          title="Online Devices"
          value={onlineDevices}
          icon={CheckCircle2}
          color="text-green-600"
        >
          <p className="text-sm text-slate-500 mt-2">
            {offlineDevices} offline, {errorDevices} error
          </p>
        </ModularCard>

        <ModularCard
          title="Critical Alerts"
          value={criticalAlerts}
          icon={AlertCircle}
          color={criticalAlerts > 0 ? "text-red-600" : "text-slate-400"}
        >
          <p className="text-sm text-slate-500 mt-2">
            {alerts.length} total alerts
          </p>
        </ModularCard>

        <ModularCard
          title="Total Scans"
          value={totalScans.toLocaleString()}
          icon={Activity}
          color="text-blue-600"
        >
          <p className="text-sm text-slate-500 mt-2">
            Across all devices
          </p>
        </ModularCard>

        <ModularCard
          title="Avg Accuracy"
          value={`${avgAccuracy.toFixed(1)}%`}
          icon={TrendingUp}
          color="text-purple-600"
        >
          <p className="text-sm text-slate-500 mt-2">
            Recognition accuracy
          </p>
        </ModularCard>
      </div>

      {/* Device Status Cards */}
      <div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">
          Device Status
        </h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {devices.map(device => (
            <Card key={device.external_device_id} className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <Server className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 dark:text-white">{device.name}</h4>
                      <p className="text-xs text-slate-500">{device.external_device_id}</p>
                    </div>
                  </div>
                  <StatusBadge status={device.status} />
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Site:</span>
                    <span className="font-medium">{device.site_name || 'Unassigned'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Accuracy:</span>
                    <span className="font-medium">{parseFloat(device.recognition_accuracy).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Scans:</span>
                    <span className="font-medium">{device.total_scans.toLocaleString()}</span>
                  </div>
                  
                  {device.cpu_percent !== undefined && (
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-slate-400" />
                        <span className="text-slate-500">CPU:</span>
                      </div>
                      <span className="font-medium">{device.cpu_percent.toFixed(1)}%</span>
                    </div>
                  )}
                  
                  {device.temperature_celsius !== undefined && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Thermometer className="w-3 h-3 text-slate-400" />
                        <span className="text-slate-500">Temp:</span>
                      </div>
                      <span className="font-medium">{device.temperature_celsius.toFixed(1)}°C</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">
            Active Alerts
          </h3>
          <div className="space-y-2">
            {alerts.slice(0, 5).map(alert => (
              <Card 
                key={alert.pk_alert_id}
                className={cn(
                  "border-l-4",
                  alert.severity === 'critical' ? "border-l-red-500" :
                  alert.severity === 'warning' ? "border-l-yellow-500" :
                  "border-l-blue-500"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={cn(
                          "text-xs",
                          alert.severity === 'critical' ? "bg-red-100 text-red-700 border-red-200" :
                          alert.severity === 'warning' ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
                          "bg-blue-100 text-blue-700 border-blue-200"
                        )}>
                          {alert.severity.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          {new Date(alert.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-800 dark:text-white">
                        {alert.message}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {devices.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-500">No devices registered yet</p>
        </div>
      )}
    </div>
  );
};
