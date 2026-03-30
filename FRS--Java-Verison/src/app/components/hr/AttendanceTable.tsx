import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Employee, AttendanceRecord, FilterOptions } from '../../types';
import { getStatusBadgeColor } from '../../utils/analytics';
import { formatTimeInSiteTz } from '../../utils/timezone';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { EmployeeProfileDashboard } from './EmployeeProfileDashboard';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';

interface AttendanceTableProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  filters?: FilterOptions;
}

const formatDuration = (mins?: number) => {
  if (mins === undefined || mins === null) return '-';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const AttendanceTable: React.FC<AttendanceTableProps> = ({
  employees,
  attendanceRecords,
  filters = { dateRange: { start: new Date(0), end: new Date() }, departments: [], employees: [], shifts: [], locations: [], status: [] },
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const filteredData = useMemo(() => {
    // Use site timezone for today's date
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: (window as any).__siteTz || 'UTC'
    }).format(new Date());

    // Get today's records — support both live API shape and mock shape
    const todayRecords = attendanceRecords.filter(record => {
      const dateStr = (record as any).attendance_date || record.date;
      return String(dateStr).slice(0, 10) === todayStr;
    });

    // Match employees with their attendance
    return employees
      .filter(emp => {
        // Apply department filter
        if (filters.departments.length > 0 && !filters.departments.includes(emp.department)) {
          return false;
        }
        // Apply location filter
        if (filters.locations.length > 0 && !filters.locations.includes(emp.location)) {
          return false;
        }
        // Apply search query
        if (searchQuery && !emp.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
        return true;
      })
      .map(emp => {
        const record = todayRecords.find(r => (r as any).fk_employee_id == emp.id || r.employeeId === emp.id);
        return { employee: emp, record };
      })
      .filter(({ record }) => {
        // Apply status filter
        if (filters.status.length > 0) {
          return record && filters.status.includes(record.status);
        }
        return true;
      });
  }, [employees, attendanceRecords, filters, searchQuery]);

  if (selectedEmployee) {
    return (
      <EmployeeProfileDashboard
        employee={selectedEmployee as any}
        onBack={() => setSelectedEmployee(null)}
      />
    );
  }

  return (
    <Card className={cn(lightTheme.background.card, lightTheme.border.default, "dark:bg-slate-900 dark:border-border")}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className={cn(lightTheme.text.primary, "dark:text-white")}>Today's Attendance</CardTitle>
          <div className="relative w-64">
            <Search className={cn("absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4", lightTheme.text.muted, "dark:text-gray-400")} />
            <Input
              placeholder="Search employees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Check-In</TableHead>
                <TableHead>Check-Out</TableHead>
                <TableHead>Working Hours</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className={cn("text-center py-8", lightTheme.text.secondary, "dark:text-gray-500")}>
                    No records found
                  </TableCell>
                </TableRow>
              ) : (
                filteredData?.map(({ employee, record }) => (
                  <TableRow
                    key={employee.id}
                    className={cn("cursor-pointer hover:bg-slate-50 transition-colors", "dark:hover:bg-gray-800/50")}
                    onClick={() => setSelectedEmployee(employee)}
                  >
                    <TableCell>
                      <div>
                        <p className={cn("font-medium", lightTheme.text.primary, "dark:text-gray-200")}>{employee.name}</p>
                        <p className={cn("text-sm", lightTheme.text.secondary, "dark:text-gray-500")}>{employee.employeeId}</p>
                      </div>
                    </TableCell>
                    <TableCell>{(record as any)?.department || employee.department || '—'}</TableCell>
                    <TableCell>
                      {(record as any)?.check_in ? formatTimeInSiteTz((record as any).check_in) : record?.checkIn ? formatTimeInSiteTz(new Date(record.checkIn).toISOString()) : '-'}
                    </TableCell>
                    <TableCell>
                      {(record as any)?.check_out ? formatTimeInSiteTz((record as any).check_out) : record?.checkOut ? formatTimeInSiteTz(new Date(record.checkOut).toISOString()) : '-'}
                    </TableCell>
                    <TableCell>
                      {record?.duration_minutes !== undefined ? formatDuration(record.duration_minutes) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusBadgeColor(record?.status || 'absent')}>
                        {record?.status.replace('-', ' ') || 'No Record'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

