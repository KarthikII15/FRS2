import { useDepartmentsAndShifts } from '../../hooks/useDepartmentsAndShifts';
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, Clock, User,
  CheckCircle2, XCircle, AlertCircle, Loader2, ScanFace, TrendingUp
} from 'lucide-react';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { FaceEnrollButton } from './FaceEnrollButton';

interface EmployeeProfileDashboardProps {
  canEnroll?: boolean;
  employee: any;
  onBack: () => void;
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

const statusColor = (s: string) => {
  if (s === 'present') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (s === 'late')    return 'bg-amber-100 text-amber-700 border-amber-200';
  if (s === 'absent')  return 'bg-red-100 text-red-700 border-red-200';
  if (s === 'on-leave')return 'bg-purple-100 text-purple-700 border-purple-200';
  if (s === 'on-break')return 'bg-blue-100 text-blue-700 border-blue-200';
  return 'bg-slate-100 text-slate-600';
};

export const EmployeeProfileDashboard: React.FC<EmployeeProfileDashboardProps> = ({ employee, onBack, canEnroll = false }) => {
  const { shifts = [] } = useDepartmentsAndShifts();
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [attendance, setAttendance]   = useState<any[]>([]);
  const [isLoading, setIsLoading]     = useState(true);

  // Normalize field names — component accepts both API shape and mock shape
  const id     = employee.pk_employee_id || employee.id;
  const name   = employee.full_name      || employee.name   || '—';
  const email  = employee.email          || '—';
  const dept   = employee.department_name|| employee.department || '—';
  const pos    = employee.position_title || employee.role        || employee.position || '—';
  const status = employee.status         || 'active';
  const phone  = employee.phone_number   || employee.phoneNumber || null;
  const loc    = employee.location_label || employee.location    || null;
  const joined = employee.join_date      || employee.joinDate    || null;
  const code   = employee.employee_code  || employee.employeeId  || '—';
  const shiftObj = shifts.find(s => (s.pk_shift_id || s.id) == employee.fk_shift_id);
  const shift = shiftObj ? shiftObj.name : (employee.shift_type || '—');
  const enrolled = !!(employee.face_enrolled || employee.faceEnrolled);
  const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  useEffect(() => {
    if (!accessToken || !id) { setIsLoading(false); return; }
    (async () => {
      try {
        const res = await apiRequest<{ data: any[] }>(
          `/hr/employees/${id}/attendance`, { accessToken, scopeHeaders }
        );
        setAttendance(res.data ?? []);
      } catch (_) { setAttendance([]); }
      finally { setIsLoading(false); }
    })();
  }, [id, accessToken]);

  // Stats from real attendance
  const last30 = attendance.slice(0, 30);
  const presentDays  = last30.filter(a => a.status === 'present' || a.status === 'late').length;
  const lateDays     = last30.filter(a => a.status === 'late').length;
  const absentDays   = last30.filter(a => a.status === 'absent').length;
  const avgHours     = last30.length > 0
    ? (last30.reduce((s, a) => s + (Number(a.working_hours) || 0), 0) / Math.max(presentDays, 1)).toFixed(1)
    : '—';
  const attendanceRate = last30.length > 0
    ? Math.round((presentDays / last30.length) * 100)
    : null;

  const empStatus = status === 'active' ? 'Active' : status === 'on-leave' ? 'On Leave' : 'Inactive';
  const empStatusColor = status === 'active'
    ? 'bg-emerald-100 text-emerald-700'
    : status === 'on-leave'
    ? 'bg-purple-100 text-purple-700'
    : 'bg-red-100 text-red-700';

  const currentShift = shifts.find(s => (s.pk_shift_id || s.id) == employee.fk_shift_id);
  const shiftDisplayName = currentShift ? currentShift.name : (employee.shift_type || 'Not Assigned');

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" onClick={onBack} className="gap-2 -ml-2">
        <ArrowLeft className="w-4 h-4" /> Back to Employees
      </Button>

      {/* Profile Header */}
      <Card className={cn(lightTheme.background.card, lightTheme.border.default)}>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <span className="text-2xl font-black text-white">{initials}</span>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h2 className={cn("text-2xl font-bold", lightTheme.text.primary)}>{name}</h2>
                  <p className="text-slate-500 mt-0.5">{pos}</p>
                </div>
                <span className={cn("text-sm font-semibold px-3 py-1 rounded-full", empStatusColor)}>
                  {empStatus}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {[
                  { icon: User,     label: 'Employee ID', value: code },
                  { icon: Mail,     label: 'Email',       value: email },
                  { icon: MapPin,   label: 'Department',  value: dept },
                  { icon: Clock,    label: 'Shift',       value: shift },
                  ...(phone ? [{ icon: Phone,    label: 'Phone',       value: phone }] : []),
                  ...(loc   ? [{ icon: MapPin,   label: 'Location',    value: loc   }] : []),
                  ...(joined? [{ icon: Calendar, label: 'Joined',      value: fmtDate(joined) }] : []),
                ].map(f => (
                  <div key={f.label}>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{f.label}</p>
                    <p className={cn("font-semibold mt-0.5 truncate", lightTheme.text.primary)}>{f.value}</p>
                  </div>
                ))}
              </div>

                            {canEnroll && (
                <div className="mt-4">
                  <FaceEnrollButton
                    employeeId={String(employee.pk_employee_id || employee.id || employee.employeeId)}
                    employeeName={employee.full_name || employee.name || employee.employeeName}
                    enrolled={employee.face_enrolled || employee.enrolled}
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Attendance Rate', value: attendanceRate !== null ? `${attendanceRate}%` : '—', color: 'text-blue-600' },
          { label: 'Days Present',    value: String(presentDays),  color: 'text-emerald-600' },
          { label: 'Late Arrivals',   value: String(lateDays),     color: 'text-amber-600' },
          { label: 'Avg Hours/Day',   value: avgHours !== '—' ? `${avgHours}h` : '—', color: 'text-indigo-600' },
        ].map(s => (
          <Card key={s.label} className={cn(lightTheme.background.card, lightTheme.border.default)}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-slate-500 font-medium">{s.label}</p>
              <p className={cn("text-2xl font-black mt-1", s.color)}>{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">Last 30 days</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Attendance history */}
      <Card className={cn(lightTheme.background.card, lightTheme.border.default)}>
        <CardHeader className={cn("border-b py-4 px-5", lightTheme.border.default)}>
          <div className="flex items-center justify-between">
            <CardTitle className={cn("text-sm font-bold", lightTheme.text.primary)}>Attendance History</CardTitle>
            <span className="text-xs text-slate-400">{attendance.length} records</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-slate-400 text-sm">Loading attendance...</span>
            </div>
          ) : attendance.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Calendar className="w-8 h-8 text-slate-300" />
              <p className="text-slate-400 text-sm">No attendance records yet</p>
              <p className="text-slate-400 text-xs">Records appear after first check-in via camera</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn("border-b", lightTheme.background.secondary, lightTheme.border.default)}>
                    {['Date', 'Status', 'Check In', 'Check Out', 'Hours', 'Late', 'Accuracy'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={cn("divide-y", lightTheme.border.default)}>
                  {attendance.map((a, i) => (
                    <tr key={a.pk_attendance_id || i}
                      className={cn("hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors",
                        i % 2 !== 0 && "bg-slate-50/30 dark:bg-slate-800/10"
                      )}>
                      <td className="px-4 py-3 text-sm font-medium">{fmtDate(a.attendance_date)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border capitalize", statusColor(a.status))}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{fmt(a.check_in)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{fmt(a.check_out)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {a.working_hours ? `${Number(a.working_hours).toFixed(1)}h` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {a.is_late
                          ? <span className="text-xs text-amber-600 font-semibold">Late</span>
                          : <span className="text-xs text-emerald-600">On time</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {a.recognition_accuracy ? `${Number(a.recognition_accuracy).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
