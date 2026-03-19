import React, { useEffect, useMemo, useState } from 'react';
import { Sidebar } from './shared/Sidebar';
import { MobileNav } from './shared/MobileNav';
import { MetricCard } from './shared/MetricCard';
import {
  Users, Monitor, Activity, FileText, Database,
  AlertCircle, Building2, ShieldCheck, Loader2, RefreshCw, UserPlus,
} from 'lucide-react';
import { UserManagement } from './admin/UserManagement';
import { SystemHealth } from './admin/SystemHealth';
import { OperationsConsole } from './admin/OperationsConsole';
import { AccuracyLogs } from './admin/AccuracyLogs';
import { LiveAuditLog } from './admin/LiveAuditLog';
import { LiveOfficeIntelligence } from './hr/LiveOfficeIntelligence';
import { EmployeeLifecycleManagement } from './hr/EmployeeLifecycleManagement';
import { Activity as ActivityIcon } from 'lucide-react';
import { lightTheme } from '../../theme/lightTheme';
import { cn } from './ui/utils';
import { useAuth } from '../contexts/AuthContext';
import { useApiData } from '../hooks/useApiData';
import { Button } from './ui/button';
import { toast } from 'sonner';

export const AdminDashboard: React.FC = () => {
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const { employees, devices, alerts, metrics, isLoading, refresh, lastRefreshed } = useApiData({ autoRefreshMs: 60000 });

  const navigationItems = [
    { label: 'Overview',                icon: Activity,      value: 'overview',         permission: 'devices.read'    as const },
    { label: 'Employee Management',     icon: UserPlus,      value: 'employees',        permission: 'users.read'      as const },
    { label: 'Users & Roles',           icon: Users,         value: 'users',            permission: 'users.read'      as const },
    { label: 'Operations Console',      icon: Building2,     value: 'operations',       permission: 'facility.manage' as const },
    { label: 'Live Office Intelligence',icon: ActivityIcon,  value: 'presence-monitor', permission: 'attendance.read' as const },
    { label: 'Accuracy',                icon: Database,      value: 'accuracy',         permission: 'devices.read'    as const },
    { label: 'Live Audit Log',          icon: FileText,      value: 'audit',            permission: 'audit.read'      as const },
  ];

  const visibleNavItems = useMemo(
    () => navigationItems.filter(i => !i.permission || can(i.permission)),
    [can]
  );

  useEffect(() => {
    if (!visibleNavItems.some(i => i.value === activeTab)) {
      setActiveTab(visibleNavItems[0]?.value ?? 'overview');
    }
  }, [activeTab, visibleNavItems]);

  const onlineDevices  = devices.filter(d => d.status === 'online').length;
  const offlineDevices = devices.filter(d => d.status === 'offline').length;
  const errorDevices   = devices.filter(d => d.status === 'error').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;
  const unreadAlerts   = alerts.filter(a => !a.is_read).length;
  const avgAccuracy    = devices.length > 0
    ? (devices.reduce((s, d) => s + (d.recognition_accuracy || 0), 0) / devices.length).toFixed(1)
    : '0';

  const mappedDevices = devices.map(d => ({
    id: d.external_device_id, name: d.name, type: 'Camera' as const,
    status: d.status === 'online' ? 'Online' : d.status === 'error' ? 'Warning' : 'Offline',
    location: d.location_label, assignedPoint: d.location_label,
    lastActive: d.last_active, ipAddress: d.ip_address,
    recognitionAccuracy: d.recognition_accuracy, totalScans: d.total_scans,
    errorRate: d.error_rate, model: d.model,
  }));

  const renderContent = () => {
    if (isLoading && devices.length === 0 && activeTab === 'overview') return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
        <span className="text-slate-400 text-sm">Loading live data...</span>
      </div>
    );
    switch (activeTab) {
      case 'overview':         return <SystemHealth devices={mappedDevices as any} alerts={alerts as any} />;
      case 'employees':        return <EmployeeLifecycleManagement />;
      case 'users':            return <UserManagement users={[]} employees={employees as any} />;
      case 'operations':       return <OperationsConsole />;
      case 'presence-monitor': return <LiveOfficeIntelligence role="admin" />;
      case 'accuracy':         return <AccuracyLogs devices={mappedDevices as any} />;
      case 'audit':            return <LiveAuditLog />;
      default:                 return null;
    }
  };

  return (
    <div className={cn("min-h-screen", lightTheme.background.primary, "dark:bg-background")}>
      <Sidebar
        title="Admin Dashboard"
        unreadAlerts={unreadAlerts}
        navigationItems={visibleNavItems}
        activeTab={activeTab}
        onNavigate={setActiveTab}
        liveAlerts={alerts}
      />
      <MobileNav
        title="Admin Dashboard"
        unreadAlerts={unreadAlerts}
        navigationItems={visibleNavItems}
        activeTab={activeTab}
        onNavigate={setActiveTab}
        liveAlerts={alerts}
      />
      <main className="md:ml-64 p-4 md:p-6 mt-16 md:mt-0">
        <div className="max-w-[1600px] mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className={cn("text-2xl font-bold", lightTheme.text.primary)}>Admin Dashboard</h1>
              {lastRefreshed && (
                <p className="text-xs text-slate-500 mt-0.5">Updated {lastRefreshed.toLocaleTimeString()}</p>
              )}
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => { refresh(); toast.success('Refreshed'); }}
              disabled={isLoading}
              className="gap-1.5"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </Button>
          </div>

          {/* KPI cards — only on overview */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <MetricCard title="Total Devices"   value={String(devices.length)}  icon={Monitor}     trend={`${onlineDevices} online`}    trendUp={onlineDevices > 0} />
              <MetricCard title="Online"          value={String(onlineDevices)}    icon={Activity}    trend={offlineDevices > 0 ? `${offlineDevices} offline` : 'All healthy'} trendUp={offlineDevices === 0} />
              <MetricCard title="Critical Alerts" value={String(criticalAlerts)}   icon={AlertCircle} trend={`${unreadAlerts} unread`}      trendUp={criticalAlerts === 0} />
              <MetricCard title="Avg Accuracy"    value={`${avgAccuracy}%`}        icon={ShieldCheck} trend={errorDevices > 0 ? `${errorDevices} error` : 'Nominal'} trendUp={errorDevices === 0} />
            </div>
          )}

          {renderContent()}
        </div>
      </main>
    </div>
  );
};
