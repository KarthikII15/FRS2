import React, { useState, useMemo } from 'react';
import { Sidebar } from './shared/Sidebar';
import { MobileNav } from './shared/MobileNav';
import { MetricCard } from './shared/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import {
  Users,
  UserCheck,
  Clock,
  TrendingUp,
  Calendar,
  AlertTriangle,
  Download,
  Filter,
  BarChart3,
  Sparkles,
  UserPlus,
  Building2,
  Activity,
  Timer,
  Zap,
  Target,
  UserX,
  Map,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from './ui/utils';
import { lightTheme } from '../../theme/lightTheme';

import { calculateDashboardMetrics, generateAnalytics } from '../utils/analytics';
import { apiRequest } from '../services/http/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { useScopeHeaders } from '../hooks/useScopeHeaders';
import { useLiveData } from '../hooks/useLiveData';
import { useApiData } from '../hooks/useApiData';
import { realtimeEngine } from '../engine/RealTimeEngine';
import { AttendanceTable } from './hr/AttendanceTable';
import { AnalyticsCharts } from './hr/AnalyticsCharts';
import { FilterPanel } from './hr/FilterPanel';
import { MultiEmployeeAnalysis } from './hr/MultiEmployeeAnalysis';
import { LiveOfficeIntelligence } from './hr/LiveOfficeIntelligence';
import { EmployeeLifecycleManagement } from './hr/EmployeeLifecycleManagement';
import { DepartmentShiftManagement } from './hr/DepartmentShiftManagement';
import { FacilityControlDashboard } from './hr/FacilityControlDashboard';
import { AttendanceStatusDashboard } from './hr/AttendanceStatusDashboard';
import { FilterOptions } from '../types';

export const HRDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    dateRange: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date(),
    },
    departments: [],
    employees: [],
    shifts: [],
    locations: [],
    status: [],
  });
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
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
    { label: 'Analytics & Comparisons', icon: TrendingUp, value: 'analytics' },
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
          punctualityRate:   d.attendanceRate    ?? 0,
          absentToday:       d.absentToday       ?? 0,
        });
      })
      .catch(() => {});
  }, [accessToken]);

  // Generate analytics data
  const analytics = useMemo(() => {
    return generateAnalytics(employees, attendance);
  }, [employees, attendance]);

  const unreadAlerts = alerts.filter(a => !a.is_read).length;

  const [isExporting, setIsExporting] = useState(false);

  const handleExportReport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      toast.success("HR Analytics Report Exported", { description: "The comprehensive analytics report has been downloaded." });
    }, 1500);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard
                title="Total Employees"
                value={metrics.totalEmployees}
                icon={Users}
              />
              <MetricCard
                title="Present Today"
                value={metrics.presentToday}
                icon={UserCheck}
                
                colorClass="text-emerald-500"
              />
              <MetricCard
                title="Late Today"
                value={metrics.lateToday}
                icon={Clock}
                
                colorClass="text-amber-500"
              />
              <MetricCard
                title="Attendance Rate"
                value={`${metrics.attendanceRate}%`}
                icon={Activity}
                
                colorClass="text-violet-500"
              />
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard
                title="Avg Working Hours"
                value={`${metrics.avgWorkingHours}h`}
                icon={Timer}
                description="Per employee per day"
                colorClass="text-indigo-500"
              />
              <MetricCard
                title="Total Overtime"
                value={`${metrics.totalOvertimeHours}h`}
                icon={Zap}
                description="This period"
                colorClass="text-orange-500"
              />
              <MetricCard
                title="Punctuality Rate"
                value={`${metrics.punctualityRate}%`}
                icon={Target}
                
                colorClass="text-teal-500"
              />
              <MetricCard
                title="Absent Today"
                value={metrics.absentToday}
                icon={UserX}
                colorClass="text-rose-500"
              />
            </div>

            <AnalyticsCharts analytics={analytics} />
            <AttendanceTable
              employees={employees}
              attendanceRecords={attendance}
              filters={filters}
            />
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
        return (
          <AnalyticsCharts
            analytics={analytics}
            detailed
            employees={employees}
            attendanceRecords={attendance}
            selectedEmployees={selectedEmployees}
            onEmployeesChange={setSelectedEmployees}
          />
        );
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
      />

      <MobileNav
        title="Workforce Analytics"
        unreadAlerts={unreadAlerts}
        navigationItems={navigationItems}
        activeTab={activeTab}
        onNavigate={setActiveTab}
        liveAlerts={liveAlerts}
      />

      <main className={cn("p-4 md:p-6 mt-16 md:mt-0 transition-all duration-300", isSidebarCollapsed ? "md:ml-20" : "md:ml-64")}>
        <div className="max-w-[1600px] mx-auto">
          {/* Page Title & Actions — only on overview/analytics tabs */}
          {!['live-office','employee-lifecycle','dept-shift','attendance-history'].includes(activeTab) && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className={cn("text-2xl font-bold", lightTheme.text.primary, "dark:text-white")}>
                  {navigationItems.find(item => item.value === activeTab)?.label || 'Overview'}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant={showFilters ? 'default' : 'outline'}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Filters
                </Button>
                <Button variant="outline" onClick={handleExportReport} disabled={isExporting}>
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {isExporting ? 'Generating...' : 'Export Report'}
                </Button>
              </div>
            </div>
            {showFilters && (
              <FilterPanel filters={filters} onFiltersChange={setFilters} />
            )}
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

