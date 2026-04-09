import React, { useEffect, useMemo, useState } from 'react';
import { Sidebar } from './shared/Sidebar';
import { MobileNav } from './shared/MobileNav';
import { Activity, Building2, Users, Settings, Loader2 } from 'lucide-react';
import { SystemHealth } from './admin/SystemHealth';
import { OperationsConsole } from './admin/OperationsConsole';
import { PeopleManagement } from './admin/PeopleManagement';
import { LogsAndSettings } from './admin/LogsAndSettings';
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
    { label: 'Overview',    icon: Activity,   value: 'overview',    permission: 'devices.read' as const },
    { label: 'People',      icon: Users,      value: 'people',      permission: 'users.read' as const },
    { label: 'Operations',  icon: Building2,  value: 'operations',  permission: 'facility.manage' as const },
    { label: 'Logs & Settings', icon: Settings, value: 'logs',      permission: 'audit.read' as const },
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

  const unreadAlertCount = alerts.filter(a => !a.is_read).length;

  const renderContent = () => {
    if (isLoading && devices.length === 0 && activeTab === 'overview') {
      return <div className="flex items-center justify-center h-64 gap-3"><Loader2 className="animate-spin text-blue-500" /></div>;
    }
    switch (activeTab) {
      case 'overview':    return <SystemHealth />;
      case 'people':      return <PeopleManagement />;
      case 'operations':  return <OperationsConsole />;
      case 'logs':        return <LogsAndSettings />;
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
