import { useDepartmentsAndShifts } from '../../hooks/useDepartmentsAndShifts';
import { formatTimeInSiteTz } from '../../utils/timezone';
import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
    UserCheck, UserX, Clock, Briefcase, AlertCircle,
    TrendingUp, CalendarDays, Download, Loader2, RefreshCw, Search, FilePen,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { Input } from '../ui/input';
import { Calendar as CalendarPicker } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useAuth } from '../../contexts/AuthContext';
import { useApiData } from '../../hooks/useApiData';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { apiRequest } from '../../services/http/apiClient';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

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
    return formatTimeInSiteTz(iso);
}

function formatMins(mins: number | null | undefined) {
    if (!mins || mins <= 0) return undefined;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
    const { accessToken } = useAuth();
    const [activeFilter, setActiveFilter] = useState<AttendanceStatus | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
    const [rangeTo, setRangeTo] = useState('');
    const [deptFilter, setDeptFilter] = useState('all');
    const [isExporting, setIsExporting] = useState(false);
    const [correctionTarget, setCorrectionTarget] = useState<StatusEmployee | null>(null);
    const [correctionForm, setCorrectionForm] = useState({ status: 'present', check_in: '', check_out: '', note: '' });
    const [isCorrecting, setIsCorrecting] = useState(false);

    const { employees, attendance, metrics, isLoading, error, refresh, lastRefreshed } = useApiData({
        autoRefreshMs: 30000,
    });

    // Force fresh fetch on mount — clears stale cache
    React.useEffect(() => { refresh(); }, []);

    const scopeHeaders = useScopeHeaders();
    const [weeklyData, setWeeklyData] = useState<any[]>([]);
    React.useEffect(() => {
        if (!accessToken) return;
        apiRequest('/live/trends/weekly', { accessToken, scopeHeaders })
            .then((res: any) => { if (res?.data) setWeeklyData(res.data); })
            .catch(() => null);
    }, [accessToken]);

    // Build status employee list from today's attendance + employee list
    const statusEmployees = useMemo<StatusEmployee[]>(() => {
        const today = selectedDate;
        const todayRecords = attendance.filter(a => a.attendance_date?.slice(0, 10) === today);
        const attendedIds = new Set(todayRecords.map(r => String(r.fk_employee_id)));

        // Build map of employee_id → dept name
        const empDeptMap = new Map<number, string>();
        employees.forEach(e => empDeptMap.set(e.pk_employee_id, e.department_name ?? '—'));

        const fromRecords: StatusEmployee[] = todayRecords.map(r => ({
            id:           String(r.fk_employee_id),
            name:         r.full_name,
            department:   (r as any).department_name || empDeptMap.get(r.fk_employee_id) || '—',
            status:       r.status === 'late'     ? 'Late'
                        : r.status === 'on-leave' ? 'On Leave'
                        : r.status === 'on-break' ? 'On Break'
                        : 'Present' as AttendanceStatus,
            checkInTime:  formatTime(r.check_in),
            duration:     formatMins((r as any).duration_minutes),
            checkin_photo:  (r as any).checkin_frame_url  || (r as any).frame_url || null,
            checkout_photo: (r as any).checkout_frame_url || null,
            check_out_time: r.check_out ? formatTimeInSiteTz(r.check_out) : null,
        } as any));

        // Employees with no record today → Absent
        const absentEmployees: StatusEmployee[] = employees
            .filter(e => e.status === 'active' && !attendedIds.has(String(e.pk_employee_id)))
            .map(e => ({
                id:         String(e.pk_employee_id),
                name:       e.full_name,
                department: e.department_name ?? '—',
                status:     'Absent' as AttendanceStatus,
            }));

        return [...fromRecords, ...absentEmployees];
    }, [attendance, employees, selectedDate]);

    const getCount = (s: AttendanceStatus) => statusEmployees.filter(e => e.status === s).length;

    const departments = useMemo(() =>
      ['all', ...Array.from(new Set(statusEmployees.map(e => e.department).filter(Boolean)))],
    [statusEmployees]);

    const filtered = useMemo(() => {
        let result = activeFilter === 'all' ? statusEmployees : statusEmployees.filter(e => e.status === activeFilter);
        if (deptFilter !== 'all') result = result.filter(e => e.department === deptFilter);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(e => e.name.toLowerCase().includes(q) || e.department.toLowerCase().includes(q));
        }
        return result;
    }, [statusEmployees, activeFilter, searchQuery, deptFilter]);

    const openCorrection = (emp: StatusEmployee) => {
        setCorrectionTarget(emp);
        setCorrectionForm({
            status: emp.status === 'Absent' ? 'present' : emp.status.toLowerCase().replace(' ', '-'),
            check_in: (emp as any).checkInTime ?? '',
            check_out: (emp as any).check_out_time ?? '',
            note: '',
        });
    };

    const handleCorrection = async () => {
        if (!correctionTarget) return;
        setIsCorrecting(true);
        try {
            await apiRequest('/attendance/correction', {
                method: 'POST', accessToken,
                body: JSON.stringify({
                    employee_id: correctionTarget.id,
                    date: selectedDate,
                    status: correctionForm.status,
                    check_in: correctionForm.check_in || undefined,
                    check_out: correctionForm.check_out || undefined,
                    note: correctionForm.note || undefined,
                }),
            });
            toast.success(`Attendance corrected for ${correctionTarget.name}`);
            setCorrectionTarget(null);
            refresh();
        } catch {
            toast.error('Correction failed — check API connection');
        } finally { setIsCorrecting(false); }
    };

    const handleExportPDF = () => {
    const rows = statusEmployees.map(e =>
      `<tr>
        <td>${e.name}</td>
        <td>${e.department || '—'}</td>
        <td>${e.status}</td>
        <td>${e.checkInTime || '—'}</td>
        <td>${e.duration || '—'}</td>
      </tr>`
    ).join('');

    const html = `<!DOCTYPE html><html><head><title>Attendance Report — ${selectedDate}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
      .stats { display: flex; gap: 24px; margin-bottom: 20px; }
      .stat { background: #f1f5f9; padding: 8px 16px; border-radius: 6px; }
      .stat-value { font-size: 22px; font-weight: bold; }
      .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { background: #1e40af; color: white; padding: 8px 12px; text-align: left; }
      td { padding: 7px 12px; border-bottom: 1px solid #e2e8f0; }
      tr:nth-child(even) td { background: #f8fafc; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h1>Attendance Report</h1>
    <div class="meta">Date: ${selectedDate} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}</div>
    <div class="stats">
      <div class="stat"><div class="stat-value">${statusEmployees.length}</div><div class="stat-label">Total</div></div>
      <div class="stat"><div class="stat-value" style="color:#16a34a">${getCount('Present')}</div><div class="stat-label">Present</div></div>
      <div class="stat"><div class="stat-value" style="color:#dc2626">${getCount('Absent')}</div><div class="stat-label">Absent</div></div>
      <div class="stat"><div class="stat-value" style="color:#d97706">${getCount('Late')}</div><div class="stat-label">Late</div></div>
    </div>
    <table><thead>
                                    <tr className="border-b border-slate-700">
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Employee</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Department</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Check-in</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Check-out</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Duration</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">In-Photo</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Out-Photo</th>
                                    </tr>
                                </thead>
    <tbody>${rows}</tbody></table>
    </body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const handleExport = () => {
    const headers = ['Name','Code','Department','Date','Check In','Check Out','Status','Hours','Overtime','Late','Confidence'];
    const rows = statusEmployees.map(e => [
      e.name, '', e.department || '', selectedDate,
      e.checkInTime || '', '', e.status, '', '', '', ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const encoded = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    const a = document.createElement('a');
    a.setAttribute('href', encoded);
    a.setAttribute('download', `attendance-${selectedDate}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
        { label: 'On Leave', count: getCount('On Leave'), color: 'text-purple-500',  icon: CalendarDays },
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

            {/* Search + Date filter bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        placeholder="Search by name or department..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="gap-2 min-w-[160px] justify-start">
                            <CalendarDays className="w-4 h-4 text-slate-400" />
                            {(() => { const [y,m,d] = selectedDate.split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); })()}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                        <CalendarPicker
                            mode="single"
                            selected={(() => { const [y,m,d] = selectedDate.split('-').map(Number); return new Date(y, m-1, d); })()}
                            onSelect={d => { if (d) { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); setSelectedDate(`${y}-${m}-${day}`); } }}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>
                <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}>
                    Today
                </Button>
                {/* "To" date for range */}
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("gap-2 min-w-[140px] justify-start", !rangeTo && "text-slate-400")}>
                            <CalendarDays className="w-4 h-4" />
                            {rangeTo ? (() => { const [y,m,d] = rangeTo.split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); })() : 'To date…'}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                        <CalendarPicker
                            mode="single"
                            selected={rangeTo ? (() => { const [y,m,d] = rangeTo.split('-').map(Number); return new Date(y, m-1, d); })() : undefined}
                            onSelect={d => { if (d) { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); setRangeTo(`${y}-${m}-${day}`); } else setRangeTo(''); }}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>
                {rangeTo && <Button variant="ghost" size="sm" onClick={() => setRangeTo('')} className="text-xs text-slate-400">Clear range</Button>}
                {/* Department filter */}
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                    <SelectTrigger className="w-44 rounded-lg text-sm"><SelectValue placeholder="All departments" /></SelectTrigger>
                    <SelectContent>
                        {departments.map(d => <SelectItem key={d} value={d}>{d === 'all' ? 'All Departments' : d}</SelectItem>)}
                    </SelectContent>
                </Select>
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
                                    <tr className="border-b border-slate-700">
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Employee</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Department</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Check-in</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Check-out</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Duration</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">In-Photo</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Out-Photo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((emp, i) => (
                                        <tr
                                            key={emp.id}
                                            className={cn(
                                                "border-b border-slate-200/5 group",
                                                i % 2 === 0 ? '' : 'bg-slate-500/2'
                                            )}
                                        >
                                            <td className="px-4 py-3 font-medium">
                                                <div className="flex items-center gap-2">
                                                    {emp.name}
                                                    <button title="Override attendance" onClick={() => openCorrection(emp)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-amber-100 text-amber-500">
                                                        <FilePen className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-400 text-xs">{emp.department}</td>
                                            <td className="px-4 py-3">
                                                <span className={cn("text-xs font-semibold px-2 py-1 rounded-full border", statusBadge(emp.status))}>
                                                    {emp.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-400 font-mono text-xs">{emp.checkInTime ?? '—'}</td>
                                            <td className="px-4 py-3 text-slate-400 font-mono text-xs">{(emp as any).check_out_time ?? '—'}</td>
                                            <td className="px-4 py-3 text-slate-400 font-mono text-xs">{emp.duration ?? '—'}</td>
                                            <td className="px-4 py-3">
                                              {(emp as any).checkin_photo ? (
                                                <img src={`http://172.20.100.222:8080/api/jetson/photos/${(emp as any).checkin_photo.split('/').pop()}`}
                                              onClick={(e) => {
                                                const modal = document.createElement('div');
                                                modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm cursor-zoom-out transition-opacity duration-300';
                                                modal.onclick = () => document.body.removeChild(modal);
                                                const img = document.createElement('img');
                                                img.src = e.currentTarget.src;
                                                img.className = 'max-h-[90vh] max-w-[90vw] rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-slate-700/50 object-contain';
                                                modal.appendChild(img);
                                                document.body.appendChild(modal);
                                              }} 
                                                     className="w-14 h-10 rounded object-cover shadow-sm transition-transform duration-200 ease-out cursor-zoom-in relative z-0 hover:z-50 hover:scale-[2.5] hover:shadow-2xl ring-1 ring-emerald-500/50 hover:ring-2 hover:ring-emerald-400" 
                                                     style={{ transformOrigin: 'center left' }} />
                                              ) : '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                              {(emp as any).checkout_photo ? (
                                                <img src={`http://172.20.100.222:8080/api/jetson/photos/${(emp as any).checkout_photo.split('/').pop()}`}
                                              onClick={(e) => {
                                                const modal = document.createElement('div');
                                                modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm cursor-zoom-out transition-opacity duration-300';
                                                modal.onclick = () => document.body.removeChild(modal);
                                                const img = document.createElement('img');
                                                img.src = e.currentTarget.src;
                                                img.className = 'max-h-[90vh] max-w-[90vw] rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-slate-700/50 object-contain';
                                                modal.appendChild(img);
                                                document.body.appendChild(modal);
                                              }} 
                                                     className="w-14 h-10 rounded object-cover shadow-sm transition-transform duration-200 ease-out cursor-zoom-in relative z-0 hover:z-50 hover:scale-[2.5] hover:shadow-2xl ring-1 ring-blue-500/50 hover:ring-2 hover:ring-blue-400" 
                                                     style={{ transformOrigin: 'center right' }} />
                                              ) : '—'}
                                            </td>
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

            {/* ATTENDANCE CORRECTION DIALOG */}
            <Dialog open={!!correctionTarget} onOpenChange={open => { if (!open) setCorrectionTarget(null); }}>
                <DialogContent className="max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="font-bold">Override Attendance</DialogTitle>
                        <DialogDescription>{correctionTarget?.name} · {selectedDate}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                        <div>
                            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Status</Label>
                            <Select value={correctionForm.status} onValueChange={v => setCorrectionForm(f => ({ ...f, status: v }))}>
                                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="present">Present</SelectItem>
                                    <SelectItem value="late">Late</SelectItem>
                                    <SelectItem value="absent">Absent</SelectItem>
                                    <SelectItem value="on-leave">On Leave</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Check-in Time</Label>
                                <Input type="time" value={correctionForm.check_in} onChange={e => setCorrectionForm(f => ({ ...f, check_in: e.target.value }))} className="rounded-xl" />
                            </div>
                            <div>
                                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Check-out Time</Label>
                                <Input type="time" value={correctionForm.check_out} onChange={e => setCorrectionForm(f => ({ ...f, check_out: e.target.value }))} className="rounded-xl" />
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Note / Reason</Label>
                            <Input value={correctionForm.note} onChange={e => setCorrectionForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. Manual correction by HR…" className="rounded-xl" />
                        </div>
                        <div className="flex gap-3">
                            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCorrectionTarget(null)}>Cancel</Button>
                            <Button onClick={handleCorrection} disabled={isCorrecting} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl gap-1.5">
                                {isCorrecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePen className="w-4 h-4" />}
                                Save Override
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Weekly Attendance Pattern */}
            <Card className={cn(lightTheme.background.card, lightTheme.border.default, "dark:bg-slate-900 dark:border-border")}>
                <CardHeader>
                    <CardTitle className={cn(lightTheme.text.primary, "dark:text-white")}>Weekly Attendance Pattern</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={weeklyData}>
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
    );
};
