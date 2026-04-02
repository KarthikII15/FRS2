import React, { useEffect, useMemo, useState } from 'react';
import { Sidebar } from './shared/Sidebar';
import { MobileNav } from './shared/MobileNav';
import { Activity, FileText, Settings, Building2, UserPlus, Users, Loader2, Globe } from 'lucide-react';
import { UserManagement } from './admin/UserManagement';
import { SystemHealth } from './admin/SystemHealth';
import { OperationsConsole } from './admin/OperationsConsole';
import { LiveAuditLog } from './admin/LiveAuditLog';
import SiteSettings from './admin/SiteSettings';
import { AdminSettings } from './admin/AdminSettings';
import { EmployeeLifecycleManagement } from './hr/EmployeeLifecycleManagement';
import { lightTheme } from '../../theme/lightTheme';
import { cn } from './ui/utils';
import { useAuth } from '../contexts/AuthContext';
import { useApiData } from '../hooks/useApiData';
import { realtimeEngine } from '../engine/RealTimeEngine';

export const AdminDashboard: React.FC = () => {
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { devices, alerts, isLoading, refresh } = useApiData({ autoRefreshMs: 60000 });

  const navigationItems = [
    { label: 'Overview',            icon: Activity,   value: 'overview',    permission: 'devices.read' as const },
    { label: 'Employee Management', icon: UserPlus,   value: 'employees',   permission: 'users.read' as const },
    { label: 'Users & Roles',       icon: Users,      value: 'users',       permission: 'users.read' as const },
    { label: 'Site Management',     icon: Globe,      value: 'sites',       permission: 'facility.manage' as const },
    { label: 'Operations Console',  icon: Building2,  value: 'operations',  permission: 'facility.manage' as const },
    { label: 'Live Audit Log',      icon: FileText,   value: 'audit',       permission: 'audit.read' as const },
    { label: 'Settings',            icon: Settings,   value: 'settings',    permission: 'devices.read' as const },
  ];

  const visibleNavItems = useMemo(() => navigationItems.filter(i => !i.permission || can(i.permission)), [can]);

  useEffect(() => {
    if (!visibleNavItems.some(i => i.value === activeTab)) {
      setActiveTab(visibleNavItems[0]?.value ?? 'overview');
    }
  }, [activeTab, visibleNavItems]);

  useEffect(() => {
    const socket = (realtimeEngine as any).socket;
    if (!socket) return;
    const onSync = () => refresh();
    socket.on('deviceStatusUpdate', onSync);
    return () => socket.off('deviceStatusUpdate', onSync);
  }, [refresh]);

  const mappedDevices = devices.map(d => ({
    id: d.pk_device_id,
    external_id: d.external_device_id,
    external_device_id: d.external_device_id,
    name: d.name,
    model: d.model,
    type: (d.model?.toLowerCase().includes('jetson') || d.name?.toLowerCase().includes('jetson') || d.external_device_id?.includes('jetson')) ? 'AI' : 'Camera',
    status: d.status === 'online' ? 'Online' : d.status === 'error' ? 'Warning' : 'Offline',
    location: d.location_label,
    recognitionAccuracy: d.recognition_accuracy,
    totalScans: d.total_scans || 0,
    error_rate: d.error_rate || 0,
    lastActive: d.last_active,
  }));

  const unreadAlertCount = alerts.filter(a => !a.is_read).length;

  const renderContent = () => {
    if (isLoading && devices.length === 0 && activeTab === 'overview') {
      return <div className="flex items-center justify-center h-64 gap-3"><Loader2 className="animate-spin text-blue-500" /></div>;
    }
    switch (activeTab) {
      case 'overview':    return <SystemHealth devices={mappedDevices as any} />;
      case 'employees':   return <EmployeeLifecycleManagement />;
      case 'users':       return <UserManagement />;
      case 'sites':       return <SiteSettings />;
      case 'operations':  return <OperationsConsole />;
      case 'audit':       return <LiveAuditLog />;
case 'settings':    return <AdminSettings />;
      default: return null;
    }
  };

  return (
    <div className={cn("min-h-screen", lightTheme.background.primary, "dark:bg-background")}>
      <Sidebar
        title="FRS Admin"
        unreadAlerts={unreadAlertCount}
        navigationItems={visibleNavItems}
        activeTab={activeTab}
        onNavigate={setActiveTab}
        liveAlerts={alerts as any}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      <MobileNav
        title="FRS Admin"
        unreadAlerts={unreadAlertCount}
        navigationItems={visibleNavItems}
        activeTab={activeTab}
        onNavigate={setActiveTab}
        liveAlerts={alerts as any}
      />
      <main className={cn("p-4 md:p-8 transition-all duration-300", isSidebarCollapsed ? "md:ml-20" : "md:ml-64")}>
        <div className="max-w-[1600px] mx-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};
