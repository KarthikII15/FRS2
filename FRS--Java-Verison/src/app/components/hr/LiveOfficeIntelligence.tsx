import { useDepartmentsAndShifts } from '../../hooks/useDepartmentsAndShifts';
import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { User, Activity, ShieldAlert, ArrowLeft, RefreshCw, Loader2, Users, Clock, Search, Filter } from 'lucide-react';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useApiData } from '../../hooks/useApiData';
import { EmployeeProfileDashboard } from './EmployeeProfileDashboard';

export function LiveOfficeIntelligence({ role = 'hr' }) {
  const { departments, shifts, isLoading: isOrgLoading } = useDepartmentsAndShifts();
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const { employees, attendance, departments: apiDepts, isLoading, refresh, lastRefreshed } = useApiData({
    autoRefreshMs: 30000,
  });

  // 1. Map Data
  const presenceData = useMemo(() => {
    return (attendance || []).map(record => {
      const emp = (employees || []).find(e => 
        String(e.pk_employee_id) === String(record.employeeId) || 
        String(e.id) === String(record.employeeId)
      );
      return {
        ...record,
        fullName: emp?.full_name || record.employeeName || 'Unknown',
        deptName: emp?.department_name || record.department || 'General',
        avatarUrl: emp?.avatar_url,
      };
    });
  }, [attendance, employees]);

  // 2. Apply Filters
  const filteredData = useMemo(() => {
    return presenceData.filter(person => {
      const matchesSearch = person.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            person.deptName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDept = departmentFilter === 'all' || person.deptName === departmentFilter;
      const matchesStatus = statusFilter === 'all' || 
                           (statusFilter === 'in' && person.status === 'In') ||
                           (statusFilter === 'out' && person.status !== 'In');
      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [presenceData, searchQuery, departmentFilter, statusFilter]);

  // 3. Calculate Stats
  const stats = useMemo(() => {
    const total = employees?.length || 0;
    const present = presenceData.filter(p => p.status === 'In').length;
    return {
      total,
      present,
      missing: total > 0 ? total - present : 0,
    };
  }, [employees, presenceData]);

  // Extract unique departments for the filter dropdown
  

  // View Switcher (Dashboard)
  if (selectedEmployee) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => setSelectedEmployee(null)} className="mb-6 gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Monitor
        </Button>
        <EmployeeProfileDashboard employee={selectedEmployee} onBack={() => setSelectedEmployee(null)} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className={cn("text-2xl font-bold", lightTheme.text.primary, "dark:text-white")}>
            Live Office Intelligence
          </h2>
          {lastRefreshed && (
            <p className="text-sm text-slate-500 mt-1">Last synced: {lastRefreshed.toLocaleTimeString()}</p>
          )}
        </div>
        <Button onClick={refresh} disabled={isLoading} className="gap-2">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh Data
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={cn(lightTheme.background.card, lightTheme.border.default, "dark:bg-slate-900")}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Headcount</p>
              <h3 className={cn("text-2xl font-bold", lightTheme.text.primary, "dark:text-white")}>{stats.total}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(lightTheme.background.card, lightTheme.border.default, "dark:bg-slate-900")}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Currently Present</p>
              <h3 className={cn("text-2xl font-bold", lightTheme.text.primary, "dark:text-white")}>{stats.present}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(lightTheme.background.card, lightTheme.border.default, "dark:bg-slate-900")}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Missing / Away</p>
              <h3 className={cn("text-2xl font-bold", lightTheme.text.primary, "dark:text-white")}>{stats.missing}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(lightTheme.background.card, lightTheme.border.default, "dark:bg-slate-900")}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Clock className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Peak Time</p>
              <h3 className={cn("text-2xl font-bold", lightTheme.text.primary, "dark:text-white")}>09:45 AM</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Area */}
      <Card className={cn("flex-1", lightTheme.background.card, lightTheme.border.default, "dark:bg-slate-900")}>
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex flex-col md:flex-row justify-between gap-4">
            <CardTitle className={cn("text-lg font-semibold", lightTheme.text.primary, "dark:text-white")}>
              Presence Monitor
            </CardTitle>
            
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search employees..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-40 bg-slate-50 dark:bg-slate-800">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map(dept => (typeof dept === 'string' ? dept : dept.name)).map(name => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32 bg-slate-50 dark:bg-slate-800">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in">Present</SelectItem>
                  <SelectItem value="out">Away</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-b dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-medium">Employee Name</th>
                  <th className="px-6 py-4 font-medium">Department</th>
                  <th className="px-6 py-4 font-medium text-center">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Last Detection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-slate-500">
                      No matching records found.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((person) => (
                    <tr key={person.employeeId || person.fk_employee_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            {person.avatarUrl ? (
                              <img src={person.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            )}
                          </div>
                          <span className={cn("font-medium", lightTheme.text.primary, "dark:text-white")}>
                            {person.fullName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500">{person.deptName}</td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant="outline" className={cn(
                          "px-2.5 py-0.5",
                          person.status === 'In' 
                            ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800/50" 
                            : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50"
                        )}>
                          {person.status === 'In' ? 'Present' : 'Away'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-slate-600 dark:text-slate-300">
                        {person.lastSeen || person.checkIn || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
