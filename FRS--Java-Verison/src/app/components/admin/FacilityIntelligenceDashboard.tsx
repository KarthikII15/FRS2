import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Users, Camera, Activity, RefreshCw, ScanFace, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '../ui/utils';
import { useApiData } from '../../hooks/useApiData';

const ModernStatCard = ({ title, value, icon: Icon, description, colorClass, bgClass }: any) => (
  <Card className={cn("border-none shadow-sm overflow-hidden", bgClass)}>
    <CardContent className="p-5">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500/70 mb-1">{title}</p>
          <h2 className="text-2xl font-black text-slate-800 tracking-tighter">{value}</h2>
        </div>
        <div className={cn("p-2 rounded-xl bg-white/60 backdrop-blur-sm shadow-sm", colorClass)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-[9px] font-bold text-slate-400 mt-3 uppercase tracking-tight">{description}</p>
    </CardContent>
  </Card>
);

export const FacilityIntelligenceDashboard: React.FC = () => {
  const { devices, employees, attendance, alerts, isLoading, refresh } = useApiData({ autoRefreshMs: 30000 });

  const today = new Date().toISOString().slice(0, 10);
  const todayAttendance = attendance.filter(a => a.attendance_date?.slice(0, 10) === today);
  const presentToday = todayAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
  const lateToday = todayAttendance.filter(a => a.is_late).length;
  const absentToday = Math.max(0, employees.length - presentToday);
  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const totalScans = devices.reduce((s, d) => s + (d.total_scans || 0), 0);

  const recDevices = devices.filter(d => Number(d.recognition_accuracy) > 0);
  const avgAccuracy = recDevices.length > 0
    ? (recDevices.reduce((s, d) => s + Number(d.recognition_accuracy), 0) / recDevices.length).toFixed(1)
    : '0.0';

  const unreadAlerts = alerts.filter((a: any) => !a.is_read);

  const alertSeverityColor = (severity: string) => {
    if (severity === 'critical') return 'bg-rose-50 text-rose-600 border-rose-100';
    if (severity === 'warning') return 'bg-amber-50 text-amber-600 border-amber-100';
    return 'bg-blue-50 text-blue-600 border-blue-100';
  };

  return (
    <div className="space-y-6">
      {/* TOP KPI GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <ModernStatCard title="Total Staff" value={employees.length} icon={Users} bgClass="bg-gradient-to-br from-blue-50 to-white" colorClass="text-blue-600" description={`${presentToday} present today`} />
        <ModernStatCard title="Asset Pool" value={devices.length} icon={Camera} bgClass="bg-gradient-to-br from-indigo-50 to-white" colorClass="text-indigo-600" description={`${onlineDevices} currently online`} />
        <ModernStatCard title="System Load" value={onlineDevices} icon={Activity} bgClass="bg-gradient-to-br from-emerald-50 to-white" colorClass="text-emerald-600" description="Live network nodes" />
        <ModernStatCard title="Lifetime AI" value={totalScans.toLocaleString()} icon={ScanFace} bgClass="bg-gradient-to-br from-violet-50 to-white" colorClass="text-violet-600" description="Total faces parsed" />
        <ModernStatCard title="Precision" value={`${avgAccuracy}%`} icon={TrendingUp} bgClass="bg-gradient-to-br from-amber-50 to-white" colorClass="text-amber-600" description="Global accuracy avg" />
      </div>

      {/* ATTENDANCE CAPSULES */}
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="border-b border-slate-50 py-4">
          <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Daily Attendance Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Present', count: presentToday, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Late Arrival', count: lateToday, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Absent', count: absentToday, color: 'text-rose-500', bg: 'bg-rose-50' },
              { label: 'Not Marked', count: employees.length - todayAttendance.length, color: 'text-slate-400', bg: 'bg-slate-50' },
            ].map(s => (
              <div key={s.label} className={cn("p-4 rounded-2xl border border-transparent hover:border-slate-100 transition-all", s.bg)}>
                <p className={cn("text-3xl font-black tracking-tighter", s.color)}>{s.count}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ALERTS FEED */}
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-slate-50/50 py-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">System Alerts</CardTitle>
            {unreadAlerts.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black">{unreadAlerts.length}</span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => refresh()} className="h-6 text-[10px] font-bold uppercase">
            <RefreshCw className={cn("w-3 h-3 mr-1.5", isLoading && "animate-spin")} /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No active alerts</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {alerts.slice(0, 8).map((alert: any) => (
                <div key={alert.pk_alert_id || alert.id} className={cn("flex items-start gap-3 px-5 py-3 transition-colors", !alert.is_read && "bg-blue-50/30")}>
                  <div className={cn("p-1.5 rounded-lg border mt-0.5 flex-shrink-0", alertSeverityColor(alert.severity))}>
                    <AlertCircle className="w-3 h-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">{alert.message || alert.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {alert.created_at ? new Date(alert.created_at).toLocaleString() : '—'}
                    </p>
                  </div>
                  {!alert.is_read && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* DEVICE SUMMARY TABLE */}
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-slate-50/50 py-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Node Performance Ledger</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refresh()} className="h-6 text-[10px] font-bold uppercase">
            <RefreshCw className={cn("w-3 h-3 mr-1.5", isLoading && "animate-spin")} /> Sync Telemetry
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left">
            <thead>
              <tr className="border-none">
                {['Device Node', 'Zone', 'Status', 'AI Scans', 'Precision'].map(h => (
                  <th key={h} className="px-6 py-4 text-[9px] font-black uppercase text-slate-400 tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {devices.map(d => (
                <tr key={d.pk_device_id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm"><Camera className="w-4 h-4" /></div>
                      <span className="text-sm font-black text-slate-700">{d.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{d.location_label || '—'}</td>
                  <td className="px-6 py-4">
                    <Badge className={cn("rounded-lg border-none px-2 py-0.5 text-[9px] font-black uppercase", d.status === 'online' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                      {d.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-400 font-mono">{(d.total_scans || 0).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className={cn("text-xs font-black", (d.recognition_accuracy || 0) >= 90 ? "text-emerald-600" : "text-amber-600")}>
                      {d.recognition_accuracy ? `${Number(d.recognition_accuracy).toFixed(1)}%` : '—'}
                    </span>
                  </td>
                </tr>
              ))}
              {devices.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-xs font-bold text-slate-300 uppercase tracking-widest">No devices registered</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};
