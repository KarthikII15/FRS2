import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../services/http/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { MultiEmployeeAnalysis } from './MultiEmployeeAnalysis';
import { Employee, AttendanceRecord, AnalyticsData } from '../../types';
import { BarChart3, Users } from 'lucide-react';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';

interface AnalyticsChartsProps {
  analytics: AnalyticsData;
  detailed?: boolean;
  employees?: Employee[];
  attendanceRecords?: AttendanceRecord[];
  selectedEmployees?: string[];
  onEmployeesChange?: (ids: string[]) => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const formatDuration = (mins?: number) => {
    if (!mins) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({
  analytics,
  detailed = false,
  employees = [],
  attendanceRecords = [],
  selectedEmployees = [],
  onEmployeesChange = () => { },
}) => {

  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [liveData, setLiveData] = useState<any[]>([]);
  const [deptData, setDeptData] = useState<any[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      apiRequest('/live/trends/monthly', { accessToken, scopeHeaders }).catch(() => null),
      apiRequest('/live/trends/departments', { accessToken, scopeHeaders }).catch(() => null),
      apiRequest('/live/trends/weekly', { accessToken, scopeHeaders }).catch(() => null)
    ]).then(([monthlyRes, deptRes, weeklyRes]: any) => {
      if (monthlyRes?.data) setLiveData(monthlyRes.data);
      if (deptRes?.data) setDeptData(deptRes.data);
      if (weeklyRes?.data) setWeeklyData(weeklyRes.data);
    });
  }, [accessToken]);

  const chartData = liveData.length > 0 ? liveData : (analytics?.attendanceTrend || []);
  const finalDeptData = deptData.length > 0 ? deptData : (analytics?.departmentComparison || []);
  const finalWeeklyData = weeklyData.length > 0 ? weeklyData : (analytics?.weeklyPattern || []);

  return (
    <Tabs defaultValue="dashboard" className="space-y-6">
      <TabsList className={cn("p-1 rounded-xl h-auto border", lightTheme.background.secondary, lightTheme.border.default, "dark:bg-gray-800/60")}>
        <TabsTrigger value="dashboard" className={cn("rounded-lg px-5 py-2 font-bold data-[state=active]:shadow-sm", "data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900")}>
          <BarChart3 className="w-4 h-4 mr-2" />
          Analytics Dashboard
        </TabsTrigger>
        <TabsTrigger value="comparison" className={cn("rounded-lg px-5 py-2 font-bold data-[state=active]:shadow-sm", "data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900")}>
          <Users className="w-4 h-4 mr-2" />
          Employee Comparison
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" className="space-y-6 outline-none">
        <div className="space-y-6">
          {/* Attendance Trends */}
          <Card className={cn(lightTheme.background.card, lightTheme.border.default, "dark:bg-slate-900 dark:border-border")}>
            <CardHeader>
              <CardTitle className={cn(lightTheme.text.primary, "dark:text-white")}>Attendance Trends (Last 30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#94a3b8" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(val) => {
                        if (!val) return '';
                        const d = new Date(val);
                        return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      }}
                    />
                    <YAxis 
                      domain={[0, 100]} 
                      stroke="#94a3b8" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(val) => `${val}%`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px' }}
                      labelFormatter={(val) => {
                        if (!val) return '';
                        const d = new Date(val);
                        return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                      }}
                      formatter={(value) => [`${value}%`, 'Attendance Rate']}
                    />
                    <Area type="monotone" dataKey="rate" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRate)" />
                  </AreaChart>
                </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Department Comparison */}
            <Card className={cn(lightTheme.background.card, lightTheme.border.default, "dark:bg-slate-900 dark:border-border")}>
              <CardHeader>
                <CardTitle className={cn(lightTheme.text.primary, "dark:text-white")}>Department Attendance Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={finalDeptData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip formatter={(value: number) => `${value?.toFixed(1) ?? '0.0'}%`} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Weekly Pattern */}
            <Card className={cn(lightTheme.background.card, lightTheme.border.default, "dark:bg-slate-900 dark:border-border")}>
              <CardHeader>
                <CardTitle className={cn(lightTheme.text.primary, "dark:text-white")}>Weekly Attendance Pattern</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={finalWeeklyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="present" stackId="a" fill="#10b981" name="Present" />
                    <Bar dataKey="late" stackId="a" fill="#f59e0b" name="Late" />
                    <Bar dataKey="absent" stackId="a" fill="#ef4444" name="Absent" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {detailed && (
            <>
              {/* Working Hours Trends */}
              <Card className={cn(lightTheme.background.card, lightTheme.border.default, "dark:bg-slate-900 dark:border-border")}>
                <CardHeader>
                  <CardTitle className={cn(lightTheme.text.primary, "dark:text-white")}>Average Working Hours Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analytics.workingHoursTrends}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis domain={[0, 100]} />
                      <Tooltip
                        labelFormatter={(value) => new Date(value).toLocaleDateString()}
                        formatter={(value: number) => [`${value?.toFixed(2) ?? '0.00'} hours`, 'Avg Working Hours']}
                      />
                      <Line
                        type="monotone"
                        dataKey="rate"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        dot={{ fill: '#8b5cf6', r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Hourly Activity */}
              <Card className={cn(lightTheme.background.card, lightTheme.border.default, "dark:bg-slate-900 dark:border-border")}>
                <CardHeader>
                  <CardTitle className={cn(lightTheme.text.primary, "dark:text-white")}>Hourly Check-In/Check-Out Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analytics.hourlyActivity.filter(h => h.hour >= 6 && h.hour <= 20)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="hour"
                        tickFormatter={(value) => `${value}:00`}
                      />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="rate"
                        stroke="#10b981"
                        strokeWidth={2}
                        name="Check-Ins"
                      />
                      <Line
                        type="monotone"
                        dataKey="rate"
                        stroke="#ef4444"
                        strokeWidth={2}
                        name="Check-Outs"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Top and Bottom Performers */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className={cn(lightTheme.background.card, lightTheme.border.default, "dark:bg-slate-900 dark:border-border")}>
                  <CardHeader>
                    <CardTitle className={cn(lightTheme.text.primary, "dark:text-white")}>Top Performers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {analytics.topPerformers?.map((performer, index) => (
                        <div key={performer.employeeId} className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{performer.name}</p>
                            <p className={cn("text-sm", lightTheme.text.secondary, "dark:text-gray-400")}>{performer.department}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-600">{performer.score?.toFixed(0) ?? "0"}</p>
                            <p className={cn("text-xs", lightTheme.text.muted, "dark:text-gray-500")}>{performer.attendanceRate?.toFixed(1) ?? '0.0'}% Attendance</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className={cn(lightTheme.background.card, lightTheme.border.default, "dark:bg-slate-900 dark:border-border")}>
                  <CardHeader>
                    <CardTitle className={cn(lightTheme.text.primary, "dark:text-white")}>Needs Attention</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {analytics.bottomPerformers?.map((performer, index) => (
                        <div key={performer.employeeId} className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center text-red-600 dark:text-red-300 font-bold">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{performer.name}</p>
                            <p className={cn("text-sm", lightTheme.text.secondary, "dark:text-gray-400")}>{performer.department}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-red-600">{performer.score?.toFixed(0) ?? "0"}</p>
                            <p className={cn("text-xs", lightTheme.text.muted, "dark:text-gray-500")}>{performer.attendanceRate?.toFixed(1) ?? '0.0'}% Attendance</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </TabsContent>

      <TabsContent value="comparison" className="outline-none">
        <MultiEmployeeAnalysis
          employees={employees}
          attendanceRecords={attendanceRecords}
          selectedEmployees={selectedEmployees}
          onEmployeesChange={onEmployeesChange}
        />
      </TabsContent>
    </Tabs>
  );
};

