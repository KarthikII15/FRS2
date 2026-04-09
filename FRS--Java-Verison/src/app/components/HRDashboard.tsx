import React, { useState, useMemo } from 'react';
import { Sidebar } from './shared/Sidebar';
import { MobileNav } from './shared/MobileNav';
import { MetricCard } from './shared/MetricCard';
import {
  Users,
  UserCheck,
  Clock,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  UserPlus,
  Building2,
  Activity,
  Timer,
  UserX,
  Loader2,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { BarChart3 as TrendsIcon, CalendarDays } from 'lucide-react';
import { cn } from './ui/utils';
import { lightTheme } from '../../theme/lightTheme';

import { generateAnalytics } from '../utils/analytics';
import { apiRequest } from '../services/http/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { useScopeHeaders } from '../hooks/useScopeHeaders';
import { useLiveData } from '../hooks/useLiveData';
import { useApiData } from '../hooks/useApiData';
import { realtimeEngine } from '../engine/RealTimeEngine';
import { AttendanceTable } from './hr/AttendanceTable';
import AttendanceCalendar from './hr/AttendanceCalendar';
import { AnalyticsCharts } from './hr/AnalyticsCharts';
import { EmployeeAnalytics } from './hr/EmployeeAnalytics';
import { LiveOfficeIntelligence } from './hr/LiveOfficeIntelligence';
import { EmployeeLifecycleManagement } from './hr/EmployeeLifecycleManagement';
import { DepartmentShiftManagement } from './hr/DepartmentShiftManagement';
import { AttendanceStatusDashboard } from './hr/AttendanceStatusDashboard';
import { FacilityControlDashboard } from './hr/FacilityControlDashboard';

export const HRDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const { employees, attendance, alerts, isLoading, error } = useLiveData();
  const { alerts: liveAlerts, refresh: refreshAlerts } = useApiData({ autoRefreshMs: 30000 });

  // Real-time alert push via WebSocket
  React.useEffect(() => {
    const socket = (realtimeEngine as any).socket;
    if (!socket) return;
    const handler = () => refreshAlerts();
    socket.on('newAlert', handler);
    return () => socket.off('newAlert', handler);
  }, [refreshAlerts]);

  const navigationItems = [
    { label: 'Overview', icon: BarChart3, value: 'overview' },
//     { label: 'Live Office Intelligence', icon: UserCheck, value: 'live-office' },
    { label: 'Attendance History', icon: Clock, value: 'attendance-history' },
    { label: 'Employee Management', icon: UserPlus, value: 'employee-lifecycle' },
    { label: 'Departments & Shifts', icon: Building2, value: 'dept-shift' },
    { label: 'Employee Analytics', icon: TrendingUp, value: 'analytics' },
    { label: 'Cameras', icon: Activity, value: 'cameras' },
  ];

  const [metrics, setMetrics] = React.useState({
    totalEmployees: 0, presentToday: 0, lateToday: 0, attendanceRate: 0,
    avgWorkingHours: 0, totalOvertimeHours: 0, punctualityRate: 0, absentToday: 0,
  });

  React.useEffect(() => {
    if (!accessToken) return;
    apiRequest('/live/metrics', { accessToken, scopeHeaders })
      .then((d: any) => {
        setMetrics({
          totalEmployees:    d.totalEmployees    ?? 0,
          presentToday:      d.presentToday      ?? 0,
          lateToday:         d.lateToday         ?? 0,
          attendanceRate:    d.attendanceRate    ?? 0,
          avgWorkingHours:   d.avgWorkingHours   ?? 0,
          totalOvertimeHours: d.totalOvertimeHours ?? 0,
          punctualityRate:   d.punctualityRate   ?? 0,
          absentToday:       d.absentToday       ?? 0,
        });
      })
      .catch(() => {});
  }, [accessToken]);

  const analytics = useMemo(() => {
    return generateAnalytics(employees, attendance);
  }, [employees, attendance]);

  const unreadAlerts = alerts.length;

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-5">
            {/* Top section: KPI cards + Calendar side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* Left: 2x3 KPI grid */}
              <div className="lg:col-span-2 grid grid-cols-2 gap-3">
                <MetricCard
                  title="Total Employees"
                  value={metrics.totalEmployees}
                  icon={Users}
                  description="Active workforce"
                />
                <MetricCard
                  title="Present Today"
                  value={metrics.presentToday}
                  icon={UserCheck}
                  description="Checked in today"
                  colorClass="text-emerald-500"
                />
                <MetricCard
                  title="Late Arrivals"
                  value={metrics.lateToday}
                  icon={Clock}
                  description="Past grace period"
                  colorClass="text-amber-500"
                />
                <MetricCard
                  title="Absent Today"
                  value={metrics.absentToday}
                  icon={UserX}
                  description="Not checked in"
                  colorClass="text-rose-500"
                />
                <MetricCard
                  title="Attendance Rate"
                  value={`${metrics.attendanceRate}%`}
                  icon={Activity}
                  description="Present vs total"
                  colorClass="text-violet-500"
                />
                <MetricCard
                  title="Avg Working Hours"
                  value={`${Number(metrics.avgWorkingHours).toFixed(1)}h`}
                  icon={Timer}
                  description="Per employee today"
                  colorClass="text-indigo-500"
                />
              </div>

              {/* Right: Attendance Calendar */}
              <div className="lg:col-span-3 min-h-[420px]">
                <AttendanceCalendar />
              </div>
            </div>

            {/* Bottom: Trends + Today's Attendance tabs */}
            <Tabs defaultValue="trends" className="space-y-4">
              <TabsList className={cn("p-1 rounded-xl h-auto border", lightTheme.background.secondary, lightTheme.border.default, "dark:bg-gray-800/60")}>
                <TabsTrigger value="trends" className={cn("rounded-lg px-5 py-2 font-bold data-[state=active]:shadow-sm", "data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900")}>
                  <TrendsIcon className="w-4 h-4 mr-2" />
                  Attendance Trends (Last 30 Days)
                </TabsTrigger>
                <TabsTrigger value="today" className={cn("rounded-lg px-5 py-2 font-bold data-[state=active]:shadow-sm", "data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900")}>
                  <CalendarDays className="w-4 h-4 mr-2" />
                  Today's Attendance
                </TabsTrigger>
              </TabsList>
              <TabsContent value="trends" className="outline-none">
                <AnalyticsCharts analytics={analytics} />
              </TabsContent>
              <TabsContent value="today" className="outline-none">
                <AttendanceTable employees={employees} attendanceRecords={attendance} />
              </TabsContent>
            </Tabs>
          </div>
        );
      case 'live-office':
        return <LiveOfficeIntelligence role="hr" />;
      case 'attendance-history':
        return <AttendanceStatusDashboard />;
      case 'employee-lifecycle':
        return <EmployeeLifecycleManagement />;
      case 'dept-shift':
        return <DepartmentShiftManagement />;
      case 'analytics':
        return <EmployeeAnalytics />;
      case 'cameras':
        return <FacilityControlDashboard />;
      default:
        return null;
    }
  };

  return (
    <div className={cn("min-h-screen", lightTheme.background.primary, "dark:bg-background")}>
      <Sidebar
        title="Workforce Analytics"
        unreadAlerts={unreadAlerts}
        navigationItems={navigationItems}
        activeTab={activeTab}
        onNavigate={setActiveTab}
        liveAlerts={liveAlerts}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onRefreshAlerts={refreshAlerts}
      />

      <MobileNav
        title="Workforce Analytics"
        unreadAlerts={unreadAlerts}
        navigationItems={navigationItems}
        activeTab={activeTab}
        onNavigate={setActiveTab}
        liveAlerts={liveAlerts}
        onRefreshAlerts={refreshAlerts}
      />

      <main className={cn("p-4 md:p-6 mt-16 md:mt-0 transition-all duration-300", isSidebarCollapsed ? "md:ml-20" : "md:ml-64")}>
        <div className="max-w-[1600px] mx-auto">
          {!['live-office','employee-lifecycle','dept-shift','attendance-history','analytics','cameras'].includes(activeTab) && (
            <div className="mb-6">
              <h2 className={cn("text-2xl font-bold", lightTheme.text.primary, "dark:text-white")}>
                {navigationItems.find(item => item.value === activeTab)?.label || 'Overview'}
              </h2>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 text-gray-500 min-h-[500px]">
              <Loader2 className="h-10 w-10 animate-spin mb-4" />
              <p className="text-lg">Loading enterprise analytics data...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-12 text-rose-500 min-h-[500px]">
              <AlertTriangle className="h-10 w-10 mb-4" />
              <p className="text-lg font-medium">Failed to load live data</p>
              <p className="text-sm mt-2">{error.message}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {renderContent()}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
