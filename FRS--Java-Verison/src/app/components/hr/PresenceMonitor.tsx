import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
    Users, Clock, MapPin, AlertCircle, TrendingUp,
    Filter, Download, Loader2, ChevronRight, Bell,
    CheckCircle2, FileText, MoreVertical, ArrowLeft,
    Camera, Layers, Search, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { EmployeeProfileDashboard } from './EmployeeProfileDashboard';
import { Input } from '../ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useApiData, LiveAttendanceRecord, LiveEmployee } from '../../hooks/useApiData';

interface PresenceMonitorProps {
    role: 'hr' | 'admin';
}

interface PresenceEntry {
    employeeId: string;
    employeeName: string;
    department: string;
    status: string;
    checkInTime: string;
    duration: string;
    location: string;
    isLate: boolean;
    deviceId: string | null;
    recognitionAccuracy: number | null;
}

function formatDuration(checkInTime: string | null): string {
    if (!checkInTime) return '—';
    const now = new Date();
    const checkIn = new Date(checkInTime);
    const diffMs = now.getTime() - checkIn.getTime();
    if (diffMs < 0) return '0m';
    const hours = Math.floor(diffMs / 3600000);
    const mins  = Math.floor((diffMs % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function formatTime(isoString: string | null): string {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const PresenceMonitor: React.FC<PresenceMonitorProps> = ({ role }) => {
    const [activeFilter, setActiveFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery]   = useState('');
    const [deptFilter, setDeptFilter]     = useState('all');
    const [isExporting, setIsExporting]   = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);

    const { employees, attendance, isLoading, error, refresh, lastRefreshed } = useApiData({
        autoRefreshMs: 60000, // refresh every 15s for presence
    });

    // Build presence entries from today's attendance records
    const presenceData = useMemo<PresenceEntry[]>(() => {
        const today = new Date().toISOString().slice(0, 10);
        const todayRecords = attendance.filter(a => a.attendance_date?.slice(0, 10) === today);

        // Build employee map for quick lookup
        const empMap = new Map<number, LiveEmployee>();
        employees.forEach(e => empMap.set(e.pk_employee_id, e));

        return todayRecords
            .filter(r => r.status === 'present' || r.status === 'late' || r.status === 'on-break')
            .map(r => {
                const emp = empMap.get(r.fk_employee_id);
                return {
                    employeeId:          String(r.fk_employee_id),
                    employeeName:        r.full_name,
                    department:          emp?.department_name ?? '—',
                    status:              r.status === 'late' ? 'Late' : r.status === 'on-break' ? 'On Break' : 'Present',
                    checkInTime:         formatTime(r.check_in),
                    duration:            formatDuration(r.check_in),
                    location:            r.location_label ?? emp?.location_label ?? '—',
                    isLate:              r.is_late,
                    deviceId:            r.device_id,
                    recognitionAccuracy: r.recognition_accuracy,
                };
            });
    }, [attendance, employees]);

    // Distinct departments for filter
    const departments = useMemo(() => {
        const depts = new Set(presenceData.map(p => p.department).filter(Boolean));
        return Array.from(depts).sort();
    }, [presenceData]);

    // Summary counts
    const counts = useMemo(() => ({
        total:    presenceData.length,
        present:  presenceData.filter(p => p.status === 'Present').length,
        late:     presenceData.filter(p => p.status === 'Late').length,
        onBreak:  presenceData.filter(p => p.status === 'On Break').length,
    }), [presenceData]);

    const filtered = useMemo(() => {
        return presenceData.filter(p => {
            if (activeFilter !== 'all' && p.status.toLowerCase() !== activeFilter) return false;
            if (deptFilter !== 'all' && p.department !== deptFilter) return false;
            if (searchQuery && !p.employeeName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        });
    }, [presenceData, activeFilter, deptFilter, searchQuery]);

    const handleExport = () => {
        setIsExporting(true);
        setTimeout(() => {
            setIsExporting(false);
            toast.success('Presence Report Exported', {
                description: `${counts.total} employees exported.`,
            });
        }, 1200);
    };

    if (selectedEmployee) {
        return (
            <EmployeeProfileDashboard
                employee={selectedEmployee}
                onBack={() => setSelectedEmployee(null)}
            />
        );
    }

    const statusColor = (status: string) => {
        if (status === 'Present')  return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
        if (status === 'Late')     return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
        if (status === 'On Break') return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
        return 'bg-slate-500/10 text-slate-500';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className={cn("text-xl font-bold", lightTheme.text.primary)}>
                        Live Presence Monitor
                    </h2>
                    {lastRefreshed && (
                        <p className="text-xs text-slate-500 mt-0.5">
                            Live · Updated {lastRefreshed.toLocaleTimeString()}
                        </p>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => refresh()} disabled={isLoading} className="gap-1.5">
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting} className="gap-1.5">
                        {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        Export
                    </Button>
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Present', value: counts.total, color: 'text-blue-500' },
                    { label: 'On Time',        value: counts.present, color: 'text-emerald-500' },
                    { label: 'Late Arrivals',  value: counts.late,    color: 'text-amber-500' },
                    { label: 'On Break',       value: counts.onBreak, color: 'text-indigo-500' },
                ].map(s => (
                    <Card key={s.label} className={cn(lightTheme.background.secondary)}>
                        <CardContent className="pt-5 pb-4">
                            <p className="text-xs text-slate-500 font-medium mb-1">{s.label}</p>
                            <p className={cn("text-3xl font-bold", s.color)}>{s.value}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        placeholder="Search employee..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Select value={activeFilter} onValueChange={setActiveFilter}>
                    <SelectTrigger className="w-36">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="late">Late</SelectItem>
                        <SelectItem value="on break">On Break</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                    <SelectTrigger className="w-44">
                        <SelectValue placeholder="Department" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All departments</SelectItem>
                        {departments.map(d => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <Card className={cn(lightTheme.background.secondary)}>
                <CardContent className="p-0">
                    {isLoading && presenceData.length === 0 ? (
                        <div className="flex items-center justify-center py-16 gap-3">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                            <span className="text-slate-400 text-sm">Loading presence data...</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <AlertCircle className="w-8 h-8 text-red-400" />
                            <p className="text-slate-400 text-sm">{error}</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Users className="w-8 h-8 text-slate-600" />
                            <p className="text-slate-400 text-sm">
                                {presenceData.length === 0
                                    ? 'No one has checked in yet today'
                                    : 'No results match the current filters'}
                            </p>
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
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Accuracy</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((p, i) => (
                                        <tr
                                            key={p.employeeId}
                                            className={cn(
                                                "border-b border-slate-200/5 cursor-pointer hover:bg-slate-500/5 transition-colors",
                                                i % 2 === 0 ? '' : 'bg-slate-500/2'
                                            )}
                                            onClick={() => {
                                                const emp = employees.find(e => String(e.pk_employee_id) === p.employeeId);
                                                if (emp) setSelectedEmployee(emp as any);
                                            }}
                                        >
                                            <td className="px-4 py-3 font-medium">{p.employeeName}</td>
                                            <td className="px-4 py-3 text-slate-400">{p.department}</td>
                                            <td className="px-4 py-3">
                                                <span className={cn("text-xs font-semibold px-2 py-1 rounded-full border", statusColor(p.status))}>
                                                    {p.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-400 font-mono text-xs">{p.checkInTime}</td>
                                            <td className="px-4 py-3 text-slate-400">{p.duration}</td>
                                            <td className="px-4 py-3 text-slate-400 text-xs">{p.location}</td>
                                            <td className="px-4 py-3 text-slate-400 text-xs">
                                                {p.recognitionAccuracy ? `${p.recognitionAccuracy.toFixed(1)}%` : '—'}
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
