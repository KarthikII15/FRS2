import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { MetricCard } from '../shared/MetricCard';
import { Users, UserCheck, UserX, Clock, Shield, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { apiRequest } from '../../services/http/apiClient';

interface Employee {
  pk_employee_id: number;
  full_name: string;
  employee_code: string;
  status: string;
  face_enrolled: boolean;
  profile_photo_url?: string;
  department_name: string;
  shift_name?: string;
}

export const EmployeeManagement: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    const fetchEmployees = async () => {
      try {
        const res = await apiRequest<{data: Employee[]}>('/live/employees', { accessToken, scopeHeaders });
        setEmployees(res.data || []);
      } catch (e) {
        toast.error('Failed to fetch employees');
      } finally {
        setIsLoading(false);
      }
    };
    fetchEmployees();
  }, [accessToken, scopeHeaders]);

  const enrolledCount = employees.filter(e => e.face_enrolled === true).length;
  const activeCount = employees.filter(e => e.status === 'active').length;
  const inactiveCount = employees.filter(e => e.status === 'inactive' || e.status === 'exited').length;
  const onLeaveCount = employees.filter(e => e.status === 'on-leave').length;
  const totalCount = employees.length;

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
  const getAvatarSrc = (photoUrl?: string) => photoUrl ? `http://172.20.100.222:8080${photoUrl}` : undefined;

  const getStatusBadge = (status: string) => {
    const color = status === 'active' ? 'text-emerald-600 bg-emerald-50' : status === 'on-leave' ? 'text-amber-600 bg-amber-50' : 'text-slate-600 bg-slate-50';
    return <Badge className={cn('px-2 py-0.5 text-[10px] font-bold border-none rounded-full', color)}>{status.toUpperCase()}</Badge>;
  };

  const getBiometrics = (face_enrolled: boolean) => {
    const isEnrolled = face_enrolled;
    return (
      <div className="flex items-center gap-2">
        <div className={cn('w-2 h-2 rounded-full animate-pulse', isEnrolled ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-slate-400')} />
        <Badge className={cn('px-2 py-0.5 text-[10px] font-bold border-none rounded-full',
          isEnrolled ? 'text-violet-600 bg-violet-50 shadow-lg shadow-violet-500/20' : 'text-slate-600 bg-slate-50'
        )}>
          {isEnrolled ? 'ENROLLED' : 'PENDING'}
        </Badge>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <MetricCard title="Total Headcount" value={totalCount} icon={Users} colorClass="text-blue-500" description="All employees" />
        <MetricCard title="Currently Active" value={activeCount} icon={UserCheck} colorClass="text-emerald-500" description="Working status" />
        <MetricCard title="Inactive/Exited" value={inactiveCount} icon={UserX} colorClass="text-slate-500" description="Offboarded" />
        <MetricCard title="On Leave" value={onLeaveCount} icon={Clock} colorClass="text-amber-500" description="Temporary leave" />
        <MetricCard title="Face Enrolled" value={enrolledCount} icon={Shield} colorClass="text-violet-500" description="Biometrics ready" />
      </div>

      {/* Employee Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-lg font-black">Employee Roster</CardTitle>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Master list with biometrics status</p>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading roster...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Avatar</TableHead>
                  <TableHead>Name / Code</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Biometrics</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.pk_employee_id}>
                    <TableCell>
                      <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-100 shadow-sm bg-gradient-to-br from-slate-50 to-white">
                        {getAvatarSrc(employee.profile_photo_url) ? (
                          <img src={getAvatarSrc(employee.profile_photo_url)} alt={employee.full_name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs font-bold">
                            {getInitials(employee.full_name)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">{employee.full_name}<div className="text-xs text-slate-400 font-mono">{employee.employee_code}</div></TableCell>
                    <TableCell className="font-medium text-slate-700">{employee.department_name}</TableCell>
                    <TableCell className="text-xs font-mono">{employee.shift_name || '—'}</TableCell>
                    <TableCell>{getStatusBadge(employee.status)}</TableCell>
                    <TableCell>{getBiometrics(employee.face_enrolled)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

