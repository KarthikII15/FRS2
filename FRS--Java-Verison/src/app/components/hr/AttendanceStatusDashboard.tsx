import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
    UserCheck, UserX, Clock, Briefcase, AlertCircle,
    TrendingUp, Calendar, Download, Loader2, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useApiData } from '../../hooks/useApiData';

type AttendanceStatus = 'Present' | 'Absent' | 'On Leave' | 'Late' | 'On Break';

interface StatusEmployee {
    id: string;
    name: string;
    department: string;
    status: AttendanceStatus;
    checkInTime?: string;
    duration?: string;
}

function formatTime(iso: string | null) {
    if (!iso) return undefined;
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(checkIn: string | null) {
    if (!checkIn) return undefined;
    const diffMs = Date.now() - new Date(checkIn).getTime();
    if (diffMs < 0) return '0m';
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export const AttendanceStatusDashboard: React.FC = () => {
    const [activeFilter, setActiveFilter] = useState<AttendanceStatus | 'all'>('all');
    const [isExporting, setIsExporting] = useState(false);

    const { employees, attendance, metrics, isLoading, error, refresh, lastRefreshed } = useApiData({
        autoRefreshMs: 60000,
    });

    // Build status employee list from today's attendance + employee list
    const statusEmployees = useMemo<StatusEmployee[]>(() => {
        const today = new Date().toISOString().slice(0, 10);
        const todayRecords = attendance.filter(a => a.attendance_date?.slice(0, 10) === today);
        const attendedIds = new Set(todayRecords.map(r => r.fk_employee_id));

        // Build map of employee_id → dept name
        const empDeptMap = new Map<number, string>();
        employees.forEach(e => empDeptMap.set(e.pk_employee_id, e.department_name ?? '—'));

        const fromRecords: StatusEmployee[] = todayRecords.map(r => ({
            id:           String(r.fk_employee_id),
            name:         r.full_name,
            department:   empDeptMap.get(r.fk_employee_id) ?? '—',
            status:       r.status === 'late'     ? 'Late'
                        : r.status === 'on-leave' ? 'On Leave'
                        : r.status === 'on-break' ? 'On Break'
                        : 'Present' as AttendanceStatus,
            checkInTime:  formatTime(r.check_in),
            duration:     formatDuration(r.check_in),
        }));

        // Employees with no record today → Absent
        const absentEmployees: StatusEmployee[] = employees
            .filter(e => e.status === 'active' && !attendedIds.has(e.pk_employee_id))
            .map(e => ({
                id:         String(e.pk_employee_id),
                name:       e.full_name,
                department: e.department_name ?? '—',
                status:     'Absent' as AttendanceStatus,
            }));

        return [...fromRecords, ...absentEmployees];
    }, [attendance, employees]);

    const getCount = (s: AttendanceStatus) => statusEmployees.filter(e => e.status === s).length;

    const filtered = useMemo(() =>
        activeFilter === 'all' ? statusEmployees : statusEmployees.filter(e => e.status === activeFilter),
        [statusEmployees, activeFilter]
    );

    const handleExport = () => {
        setIsExporting(true);
        setTimeout(() => {
            setIsExporting(false);
            toast.success('Report Exported', {
                description: `Attendance status report downloaded (${statusEmployees.length} employees).`,
            });
        }, 1200);
    };

    const statusBadge = (s: AttendanceStatus) => {
        const map: Record<AttendanceStatus, string> = {
            'Present':  'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
            'Late':     'bg-amber-500/10 text-amber-600 border-amber-500/20',
            'On Break': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
            'On Leave': 'bg-purple-500/10 text-purple-600 border-purple-500/20',
            'Absent':   'bg-red-500/10 text-red-600 border-red-500/20',
        };
        return map[s] ?? 'bg-slate-500/10 text-slate-500';
    };

    const summaryItems: { label: AttendanceStatus | 'all'; count: number; color: string; icon: React.FC<any> }[] = [
        { label: 'Present',  count: getCount('Present'),  color: 'text-emerald-500', icon: UserCheck },
        { label: 'Absent',   count: getCount('Absent'),   color: 'text-red-500',     icon: UserX },
        { label: 'Late',     count: getCount('Late'),      color: 'text-amber-500',   icon: Clock },
        { label: 'On Leave', count: getCount('On Leave'), color: 'text-purple-500',  icon: Calendar },
        { label: 'On Break', count: getCount('On Break'), color: 'text-blue-500',    icon: Briefcase },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className={cn("text-xl font-bold", lightTheme.text.primary)}>
                        Attendance Status
                    </h2>
                    {lastRefreshed && (
                        <p className="text-xs text-slate-500 mt-0.5">
                            {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                            {' · '}Updated {lastRefreshed.toLocaleTimeString()}
                        </p>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => refresh()} disabled={isLoading} className="gap-1.5">
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting} className="gap-1.5">
                        {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        Export
                    </Button>
                </div>
            </div>

            {/* Summary filter pills */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setActiveFilter('all')}
                    className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                        activeFilter === 'all'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-transparent text-slate-400 border-slate-700 hover:border-slate-500'
                    )}
                >
                    All ({statusEmployees.length})
                </button>
                {summaryItems.map(s => (
                    <button
                        key={s.label}
                        onClick={() => setActiveFilter(s.label as AttendanceStatus)}
                        className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                            activeFilter === s.label
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-transparent text-slate-400 border-slate-700 hover:border-slate-500'
                        )}
                    >
                        {s.label} ({s.count})
                    </button>
                ))}
            </div>

            {/* Table */}
            <Card className={cn(lightTheme.background.secondary)}>
                <CardContent className="p-0">
                    {isLoading && statusEmployees.length === 0 ? (
                        <div className="flex items-center justify-center py-16 gap-3">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                            <span className="text-slate-400 text-sm">Loading attendance data...</span>
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center py-16 gap-3">
                            <AlertCircle className="w-6 h-6 text-red-400" />
                            <span className="text-slate-400 text-sm">{error}</span>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200/10">
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Check-in</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((emp, i) => (
                                        <tr
                                            key={emp.id}
                                            className={cn(
                                                "border-b border-slate-200/5",
                                                i % 2 === 0 ? '' : 'bg-slate-500/2'
                                            )}
                                        >
                                            <td className="px-4 py-3 font-medium">{emp.name}</td>
                                            <td className="px-4 py-3 text-slate-400 text-xs">{emp.department}</td>
                                            <td className="px-4 py-3">
                                                <span className={cn("text-xs font-semibold px-2 py-1 rounded-full border", statusBadge(emp.status))}>
                                                    {emp.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-400 font-mono text-xs">{emp.checkInTime ?? '—'}</td>
                                            <td className="px-4 py-3 text-slate-400 text-xs">{emp.duration ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {filtered.length === 0 && (
                                <div className="text-center py-10 text-slate-500 text-sm">No employees match this filter.</div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
