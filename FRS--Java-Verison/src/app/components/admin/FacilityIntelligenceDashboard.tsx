import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Building2, Users, Camera, Cpu, Activity, RefreshCw, Loader2, MapPin, AlertCircle } from 'lucide-react';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useApiData } from '../../hooks/useApiData';

export const FacilityIntelligenceDashboard: React.FC = () => {
  const { devices, employees, attendance, alerts, isLoading, refresh, lastRefreshed } = useApiData({ autoRefreshMs: 30000 });

  const today = new Date().toISOString().slice(0, 10);
  const todayAttendance = attendance.filter(a => a.attendance_date?.slice(0, 10) === today);

  const onlineDevices  = devices.filter(d => d.status === 'online').length;
  const offlineDevices = devices.filter(d => d.status === 'offline').length;
  const errorDevices   = devices.filter(d => d.status === 'error').length;
  const presentToday   = todayAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
  const unreadAlerts   = alerts.filter(a => !a.is_read).length;

  const totalScans     = devices.reduce((s, d) => s + (d.total_scans || 0), 0);
  const avgAccuracy    = devices.length > 0
    ? (devices.reduce((s, d) => s + (Number(d.recognition_accuracy) || 0), 0) / devices.length).toFixed(1)
    : '0';

  const StatCard = ({ title, value, icon: Icon, color, sub }: any) => (
    <Card className={cn(lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-950 dark:border-border')}>
      <CardContent className="p-5">
        <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center mb-3', color, 'bg-opacity-10 border', lightTheme.border.default)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className={cn('text-2xl font-black', lightTheme.text.primary, 'dark:text-white')}>{value}</div>
        <div className={cn('text-xs font-semibold uppercase tracking-wider mt-0.5', lightTheme.text.secondary, 'dark:text-slate-500')}>{title}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className={cn('text-lg font-bold', lightTheme.text.primary)}>Facility Overview</h3>
          {lastRefreshed && (
            <p className="text-xs text-slate-500 mt-0.5">Updated {lastRefreshed.toLocaleTimeString()}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh()} disabled={isLoading} className="gap-1.5">
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="Total Employees"   value={employees.length}      icon={Users}     color="text-blue-500"   sub={`${presentToday} present today`} />
        <StatCard title="Registered Devices" value={devices.length}       icon={Camera}    color="text-indigo-500" sub={`${onlineDevices} online`} />
        <StatCard title="Devices Online"    value={onlineDevices}          icon={Activity}  color="text-emerald-500" sub={offlineDevices > 0 ? `${offlineDevices} offline` : 'All healthy'} />
        <StatCard title="Total Scans"       value={totalScans.toLocaleString()} icon={Cpu} color="text-amber-500"  sub="lifetime" />
        <StatCard title="Avg Accuracy"      value={`${avgAccuracy}%`}     icon={AlertCircle} color="text-purple-500" sub={`${unreadAlerts} active alerts`} />
      </div>

      {/* Device Table */}
      <Card className={cn(lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-950 dark:border-border')}>
        <CardHeader className={cn('border-b py-4 px-5', lightTheme.border.default)}>
          <div className="flex items-center justify-between">
            <h4 className={cn('text-sm font-bold', lightTheme.text.primary)}>Registered Devices</h4>
            <span className="text-xs text-slate-400">{devices.length} total</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && devices.length === 0 ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-slate-400 text-sm">Loading devices...</span>
            </div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Camera className="w-8 h-8 text-slate-400" />
              <p className="text-slate-400 text-sm">No devices registered yet</p>
              <p className="text-slate-400 text-xs">Register your Prama camera in Step 13 of the setup guide</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn('border-b text-xs', lightTheme.background.secondary, lightTheme.border.default)}>
                    {['Device', 'Location', 'Status', 'Total Scans', 'Accuracy', 'Last Active'].map(h => (
                      <th key={h} className="text-left px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={cn('divide-y', lightTheme.border.default, 'dark:divide-slate-800')}>
                  {devices.map(d => (
                    <tr key={d.pk_device_id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                            <Camera className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <p className={cn('text-sm font-semibold', lightTheme.text.primary)}>{d.name}</p>
                            <p className="text-xs font-mono text-slate-400">{d.external_device_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-500">{d.location_label || '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('w-2 h-2 rounded-full',
                            d.status === 'online'  ? 'bg-emerald-500' :
                            d.status === 'error'   ? 'bg-amber-500'   : 'bg-red-500'
                          )} />
                          <span className={cn('text-xs font-semibold capitalize',
                            d.status === 'online'  ? 'text-emerald-600' :
                            d.status === 'error'   ? 'text-amber-600'   : 'text-red-600'
                          )}>{d.status}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm font-mono text-slate-500">{(d.total_scans || 0).toLocaleString()}</td>
                      <td className="px-5 py-3">
                        <span className={cn('text-sm font-semibold',
                          (d.recognition_accuracy || 0) >= 90 ? 'text-emerald-600' :
                          (d.recognition_accuracy || 0) >= 70 ? 'text-amber-600'   : 'text-red-600'
                        )}>
                          {d.recognition_accuracy ? `${Number(d.recognition_accuracy).toFixed(1)}%` : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-400 font-mono">
                        {d.last_active ? new Date(d.last_active).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's attendance snapshot */}
      <Card className={cn(lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-950 dark:border-border')}>
        <CardHeader className={cn('border-b py-4 px-5', lightTheme.border.default)}>
          <div className="flex items-center justify-between">
            <h4 className={cn('text-sm font-bold', lightTheme.text.primary)}>Today's Attendance Snapshot</h4>
            <span className="text-xs text-slate-400">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {todayAttendance.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">
              No attendance records for today yet. Records will appear when employees check in via the camera.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Present',  count: todayAttendance.filter(a => a.status === 'present').length,  color: 'text-emerald-600 bg-emerald-50' },
                { label: 'Late',     count: todayAttendance.filter(a => a.status === 'late').length,     color: 'text-amber-600 bg-amber-50' },
                { label: 'On Break', count: todayAttendance.filter(a => a.status === 'on-break').length, color: 'text-blue-600 bg-blue-50' },
                { label: 'On Leave', count: todayAttendance.filter(a => a.status === 'on-leave').length, color: 'text-purple-600 bg-purple-50' },
              ].map(s => (
                <div key={s.label} className={cn('rounded-xl p-4 text-center', s.color.split(' ')[1])}>
                  <p className={cn('text-2xl font-black', s.color.split(' ')[0])}>{s.count}</p>
                  <p className="text-xs font-semibold text-slate-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
