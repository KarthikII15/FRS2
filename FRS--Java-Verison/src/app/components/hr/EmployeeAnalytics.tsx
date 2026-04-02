import { formatTimeInSiteTz } from '../../utils/timezone';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart
} from 'recharts';
import {
  Download, RefreshCw, ChevronLeft, ChevronRight,
  Calendar, Users, TrendingUp, Search,
  CheckCircle, AlertTriangle, Timer, Camera, X,
  Check, ChevronsUpDown, Building
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Employee {
  pk_employee_id: number;
  employee_code: string;
  full_name: string;
  department_name?: string;
  shift_name?: string;
}

interface AttendanceRecord {
  pk_attendance_id: number;
  attendance_date: string;
  check_in?: string;
  check_out?: string;
  duration_minutes?: number;
  status: string;
  is_late?: boolean;
  recognition_confidence?: number;
  checkin_frame_url?: string;
  checkout_frame_url?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (iso?: string) => iso
  ? formatTimeInSiteTz(iso)
  : '—';

const fmtDur = (mins?: number) => {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const dayName = (s: string) => new Date(s).toLocaleDateString('en', { weekday: 'short' });

const monthDays = (y: number, m: number) => ({
  first: new Date(y, m, 1).getDay(),
  total: new Date(y, m + 1, 0).getDate(),
});

const PHOTO = 'http://172.20.100.222:8080/api/jetson/photos/';
const photoUrl = (u?: string) => u ? PHOTO + u.split('/').pop() : null;

// ─── Status Badge ─────────────────────────────────────────────────────────────
const Badge = ({ s }: { s: string }) => {
  const cls: Record<string, string> = {
    present: 'bg-emerald-500/15 text-emerald-500',
    late: 'bg-amber-500/15 text-amber-500',
    absent: 'bg-rose-500/15 text-rose-500',
    'on-leave': 'bg-sky-500/15 text-sky-500',
  };
  return (
    <span className={cn('px-2.5 py-1 text-[10px] font-bold uppercase rounded-full',
      cls[s?.toLowerCase()] ?? 'bg-muted text-muted-foreground')}>
      {s ?? '—'}
    </span>
  );
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, icon: Icon, cls }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; cls: string;
}) => (
  <div className="bg-card text-card-foreground border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
    <div className="flex justify-between items-start mb-4">
      <div className={cn('p-2 rounded-lg opacity-80', cls.replace('text-', 'bg-').replace('500', '500/15'))}>
        <Icon className={cn('w-5 h-5', cls)} />
      </div>
    </div>
    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">{label}</p>
    <h3 className={cn('text-3xl font-bold', cls)}>{value}</h3>
    {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
  </div>
);

// ─── Tooltip ──────────────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label, suffix = '' }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-xl text-xs text-foreground">
      <p className="font-semibold mb-1 text-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill ?? p.stroke }}>
          {p.name}: <b>{p.value}{suffix}</b>
        </p>
      ))}
    </div>
  );
};

// ─── Calendar ─────────────────────────────────────────────────────────────────
const Cal = ({ recs, y, m, onPrev, onNext, sel, onSel, onPhotoClick }: {
  recs: AttendanceRecord[]; y: number; m: number;
  onPrev: () => void; onNext: () => void;
  sel: string | null; onSel: (d: string | null) => void;
  onPhotoClick: (url: string) => void;

}) => {
  const { first, total } = monthDays(y, m);
  const title = new Date(y, m, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' });
  const now = new Date();

  const map = useMemo(() => {
    const r: Record<number, AttendanceRecord> = {};
    recs.forEach(x => { r[new Date(x.attendance_date).getDate()] = x; });
    return r;
  }, [recs]);

  const dateStr = (d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const cellCls = (d: number) => {
    const ds = dateStr(d);
    const rec = map[d];
    const isToday = now.getFullYear() === y && now.getMonth() === m && now.getDate() === d;
    const isSel = sel === ds;
    const dow = new Date(y, m, d).getDay();
    const isWe = dow === 0 || dow === 6;

    if (isSel) return 'ring-2 ring-primary bg-primary/20 text-primary font-bold';
    if (isToday && !rec) return 'ring-2 ring-primary/40 text-primary font-semibold';
    if (!rec) return isWe
      ? 'text-muted-foreground/25'
      : 'text-muted-foreground/50 hover:bg-accent/30';
    const s = rec.status?.toLowerCase();
    if (s === 'present') return 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25 hover:bg-emerald-500/25 cursor-pointer';
    if (s === 'late') return 'bg-amber-500/15 text-amber-500 border border-amber-500/25 hover:bg-amber-500/25 cursor-pointer';
    if (s === 'absent') return 'bg-rose-500/15 text-rose-500 border border-rose-500/25 cursor-pointer';
    return 'text-muted-foreground';
  };

  const selRec = sel ? map[new Date(sel).getDate()] : null;

  return (
    <div className="bg-card text-card-foreground border border-border rounded-xl p-5 shadow-sm h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <div className="flex items-center gap-1">
          {sel && (
            <button onClick={() => onSel(null)}
              className="text-[10px] text-primary hover:underline flex items-center gap-0.5 mr-1">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
          <button onClick={onPrev} className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={onNext} className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mb-3 flex-wrap">
        {[['bg-emerald-500/20', 'Present'], ['bg-amber-500/20', 'Late'], ['bg-rose-500/20', 'Absent']].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={cn('w-2 h-2 rounded-sm', c)} />{l}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-[10px] font-bold text-muted-foreground uppercase py-1">{d}</div>
        ))}
        {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: total }).map((_, i) => {
          const d = i + 1;
          const rec = map[d];
          return (
            <div key={d}
              onClick={() => map[d] && onSel(sel === dateStr(d) ? null : dateStr(d))}
              title={map[d] ? `${map[d].status} · ${fmt(map[d].check_in)}` : undefined}
              className={cn(
                'flex flex-col items-center justify-start text-xs rounded-lg transition-all py-1 px-0.5 min-h-[3rem]',
                cellCls(d),
                map[d] ? 'cursor-pointer' : 'cursor-default'
              )}>
              {/* Day number */}
              <span className="font-semibold leading-none mb-0.5">{d}</span>
              {/* Check-in / Check-out times */}
              {rec?.check_in && (
                <span className="text-[8px] leading-tight font-mono text-emerald-600 dark:text-emerald-400 truncate w-full text-center">
                  ↑{fmt(rec.check_in)}
                </span>
              )}
              {rec?.check_out && (
                <span className="text-[8px] leading-tight font-mono text-rose-500 dark:text-rose-400 truncate w-full text-center">
                  ↓{fmt(rec.check_out)}
                </span>
              )}
            </div>
          );
        })}

      </div>

      {/* Selected day detail */}
      {sel && (
        <div className="mt-4 pt-4 border-t border-border flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            {new Date(sel).toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          {selRec ? (
            <div className="space-y-2">
              <Badge s={selRec.status} />
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {[
                  ['In', fmt(selRec.check_in), 'text-emerald-500'],
                  ['Out', fmt(selRec.check_out), 'text-rose-500'],
                ].map(([lbl, val, c]) => (
                  <div key={lbl} className="bg-muted/50 rounded-lg p-2">
                    <p className="text-[9px] text-muted-foreground uppercase">{lbl}</p>
                    <p className={cn('text-xs font-mono font-semibold', c)}>{val}</p>
                  </div>
                ))}
                <div className="bg-muted/50 rounded-lg p-2 col-span-2">
                  <p className="text-[9px] text-muted-foreground uppercase">Duration</p>
                  <p className="text-xs font-semibold text-primary">{fmtDur(selRec.duration_minutes)}</p>
                </div>
              </div>
              {(selRec.checkin_frame_url || selRec.checkout_frame_url) && (
                <div className="flex gap-2 mt-1">
                  {[
                    [photoUrl(selRec.checkin_frame_url), 'border-emerald-500/30', 'Check-in'],
                    [photoUrl(selRec.checkout_frame_url), 'border-rose-500/30', 'Check-out'],
                  ].filter(([u]) => u).map(([u, b, a]) => (
                    <button key={a as string} onClick={() => onPhotoClick(u as string)}>
                      <img src={u as string} alt={a as string}
                        className={cn('w-16 h-12 rounded-lg object-cover border-2 hover:scale-110 transition-transform', b)}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No record for this date</p>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export const EmployeeAnalytics: React.FC = () => {
  const { accessToken } = useAuth();
  const sh = { 'x-tenant-id': '1', 'x-customer-id': '1', 'x-site-id': '1' };

  const [emps, setEmps] = useState<Employee[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [deptId, setDeptId] = useState('all');
  const [empId, setEmpId] = useState('');
  const [empSearch, setEmpSearch] = useState('');
  const [isEmpSearchOpen, setIsEmpSearchOpen] = useState(false);
  const [recs, setRecs] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('THIS_MONTH');
  const [page, setPage] = useState(1);
  const [calY, setCalY] = useState(new Date().getFullYear());
  const [calM, setCalM] = useState(new Date().getMonth());
  const [selDate, setSelDate] = useState<string | null>(null);

  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const PER = 10;
  const [modalPhoto, setModalPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    // Fetch Employees
    apiRequest('/live/employees?limit=100', { accessToken, scopeHeaders: sh })
      .then((d: any) => {
        const list = d.data ?? d ?? [];
        setEmps(list);
        if (list.length) setEmpId(String(list[0].pk_employee_id));
      }).catch(() => { });

    // Fetch Departments
    apiRequest('/hr/departments', { accessToken, scopeHeaders: sh })
      .then((d: any) => {
        setDepts(d.data ?? []);
      }).catch(() => { });
  }, [accessToken]);

  const load = useCallback(() => {
    if (!accessToken || !empId) return;
    setLoading(true); setSelDate(null);
    apiRequest(`/employees/${empId}/attendance?fromDate=${from}&toDate=${to}`, { accessToken, scopeHeaders: sh })
      .then((d: any) => { setRecs(Array.isArray(d) ? d : (d.data ?? [])); setPage(1); })
      .catch(() => setRecs([]))
      .finally(() => setLoading(false));
  }, [accessToken, empId, from, to]);

  useEffect(() => { load(); }, [load]);

  const applyPeriod = (p: string) => {
    setPeriod(p);
    const now = new Date();
    let f = new Date();
    if (p === 'TODAY') f = now;
    else if (p === 'THIS_WEEK') { f = new Date(now); f.setDate(now.getDate() - now.getDay()); }
    else if (p === 'THIS_MONTH') f = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (p === 'YTD') f = new Date(now.getFullYear(), 0, 1);
    setFrom(f.toISOString().slice(0, 10));
    setTo(now.toISOString().slice(0, 10));
  };

  const kpi = useMemo(() => {
    const total = recs.length;
    const present = recs.filter(r => r.status === 'present' || r.status === 'late').length;
    const late = recs.filter(r => r.is_late || r.isLate).length;
    const mins = recs.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
    return {
      rate: total > 0 ? Math.round((present / total) * 100) : 0,
      present, total, late,
      avg: present > 0 ? Math.round((mins / present / 60) * 10) / 10 : 0,
    };
  }, [recs]);

  const hourly = useMemo(() => {
    const src = selDate ? recs.filter(r => r.attendance_date?.slice(0, 10) === selDate) : recs;
    const counts: Record<number, { Entry: number; Exit: number }> = {};
    src.forEach(r => {
      if (r.check_in) { const h = new Date(r.check_in).getHours(); if (!counts[h]) counts[h] = { Entry: 0, Exit: 0 }; counts[h].Entry++; }
      if (r.check_out) { const h = new Date(r.check_out).getHours(); if (!counts[h]) counts[h] = { Entry: 0, Exit: 0 }; counts[h].Exit++; }
    });
    const hours = Object.keys(counts).map(Number);
    if (hours.length === 0) return [];
    const minH = Math.max(0, Math.min(...hours) - 1);
    const maxH = Math.min(23, Math.max(...hours) + 1);
    return Array.from({ length: maxH - minH + 1 }, (_, i) => {
      const h = minH + i;
      return { hour: `${h.toString().padStart(2, '0')}:00`, Entry: counts[h]?.Entry ?? 0, Exit: counts[h]?.Exit ?? 0 };
    });
  }, [recs, selDate]);

  const weekly = useMemo(() => {
    const w: Record<string, { a: number; c: number }> = {};
    recs.forEach(r => {
      if (!r.duration_minutes) return;
      const d = new Date(r.attendance_date);
      const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
      const k = ws.toLocaleDateString('en', { month: 'short', day: 'numeric' });
      if (!w[k]) w[k] = { a: 0, c: 0 };
      w[k].a += r.duration_minutes / 60; w[k].c++;
    });
    return Object.entries(w).slice(-8).map(([week, v]) => ({
      week, Actual: Math.round((v.a / Math.max(v.c, 1)) * 10) / 10, Target: 8,
    }));
  }, [recs]);

  const calRecs = useMemo(() =>
    recs.filter(r => { const d = new Date(r.attendance_date); return d.getFullYear() === calY && d.getMonth() === calM; }),
    [recs, calY, calM]);

  const filtered = useMemo(() => {
    return [...recs].sort((a, b) => new Date(b.attendance_date).getTime() - new Date(a.attendance_date).getTime());
  }, [recs]);

  const filteredEmps = useMemo(() => {
    if (deptId === 'all') return emps;
    const selectedDept = depts.find(d => String(d.id) === deptId);
    return emps.filter(e => String(e.department_name) === selectedDept?.name);
  }, [emps, depts, deptId]);

  const selEmp = emps.find(e => String(e.pk_employee_id) === empId);

  useEffect(() => {
    if (filteredEmps.length > 0 && !filteredEmps.find(e => String(e.pk_employee_id) === empId)) {
      setEmpId(String(filteredEmps[0].pk_employee_id));
    }
  }, [filteredEmps]);

  const searchFilteredEmps = useMemo(() => {
    const q = empSearch.toLowerCase().trim();
    if (!q) return filteredEmps;
    return filteredEmps.filter(e => 
      e.full_name?.toLowerCase().includes(q) || 
      e.employee_code?.toLowerCase().includes(q)
    );
  }, [filteredEmps, empSearch]);

  const pages = Math.ceil(filtered.length / PER);
  const pageRecs = filtered.slice((page - 1) * PER, page * PER);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Employee Analytics</h2>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            Detailed attendance insights for {selEmp?.full_name || 'selected employee'}
            {selDate && (
              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-semibold">
                {new Date(selDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                <button onClick={() => setSelDate(null)} className="ml-1.5 hover:opacity-70">×</button>
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load}
            className="p-2 rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <section className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center gap-4 shadow-sm">

        {/* Department Filter */}
        <div className="w-56">
          <Select value={deptId} onValueChange={setDeptId}>
            <SelectTrigger className="w-full bg-muted border-border h-11">
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-muted-foreground" />
                <SelectValue placeholder="All Departments" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {depts.map(d => (
                <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Searchable Employee Selector */}
        <div className="w-64">
          <Popover open={isEmpSearchOpen} onOpenChange={setIsEmpSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={isEmpSearchOpen}
                className="w-full justify-between bg-muted border-border h-11 font-normal"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {selEmp ? `${selEmp.full_name} (${selEmp.employee_code})` : "Select employee..."}
                  </span>
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="start">
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search employee..."
                    className="pl-9 h-9"
                    value={empSearch}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmpSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {searchFilteredEmps.map((e) => (
                    <button
                      key={e.pk_employee_id}
                      onClick={() => {
                        setEmpId(String(e.pk_employee_id));
                        setEmpSearch('');
                        setIsEmpSearchOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center px-2 py-2 rounded-md transition-colors text-left",
                        empId === String(e.pk_employee_id) ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                      )}
                    >
                      <Check className={cn("mr-2 h-4 w-4 flex-shrink-0", empId === String(e.pk_employee_id) ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col overflow-hidden">
                        <span className="font-medium text-sm truncate">{e.full_name}</span>
                        <span className="text-[10px] opacity-70">{e.employee_code}</span>
                      </div>
                    </button>
                  ))}

                  {searchFilteredEmps.length === 0 && (
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      No employees found.
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex bg-muted p-1 rounded-lg gap-1">
          {[['Today', 'TODAY'], ['This Week', 'THIS_WEEK'], ['This Month', 'THIS_MONTH'], ['YTD', 'YTD']].map(([l, v]) => (
            <button key={v} onClick={() => applyPeriod(v)}
              className={cn('px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all',
                period === v ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {l}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary focus:outline-none" />
          <span className="text-muted-foreground text-xs">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary focus:outline-none" />
        </div>

        <button onClick={load}
          className="ml-auto px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold rounded-lg transition-all">
          Apply
        </button>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Attendance Rate" value={`${kpi.rate}%`} sub="Selected period" icon={CheckCircle} cls="text-emerald-500" />
        <KpiCard label="Present Days" value={`${kpi.present} / ${kpi.total}`} sub="Working days" icon={Calendar} cls="text-indigo-500" />
        <KpiCard label="Late Arrivals" value={kpi.late} sub="Selected period" icon={AlertTriangle} cls="text-amber-500" />
        <KpiCard label="Avg Working Hours" value={`${kpi.avg}h`} sub="Per working day" icon={Timer} cls="text-violet-500" />
      </section>

      {/* Charts Row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly Bar */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col h-full">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Hourly Entry / Exit Activity</h4>
              {selDate && <p className="text-[10px] text-muted-foreground mt-0.5">
                {new Date(selDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
              </p>}
            </div>
            <div className="flex gap-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Entry</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Exit</span>
            </div>
          </div>
          <div className="flex-1 min-h-[400px]">
            {hourly.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No activity data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly} barCategoryGap="20%" barSize={24}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, (dataMax: number) => Math.max(dataMax + 1, 3)]} tickCount={4} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: 'hsl(var(--border))', opacity: 0.3 }} />
                  <Bar dataKey="Entry" fill="#22c55e" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Exit" fill="#ef4444" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Calendar */}
        <div className="h-full">
          <Cal recs={calRecs} y={calY} m={calM}
            onPrev={() => { if (calM === 0) { setCalM(11); setCalY(y => y - 1); } else setCalM(m => m - 1); }}
            onNext={() => { if (calM === 11) { setCalM(0); setCalY(y => y + 1); } else setCalM(m => m + 1); }}
            sel={selDate}
            onSel={(d) => { setSelDate(d); setPage(1); }}
            onPhotoClick={(url) => setModalPhoto(url)} />
        </div>
      </section>

      {/* Table */}
      <section className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 flex flex-wrap justify-between items-center gap-3 border-b border-border">
          <div className="flex items-center gap-3 flex-wrap">
            <h4 className="text-sm font-semibold text-foreground">Attendance History for {selEmp?.full_name || 'selected employee'}</h4>
            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded">
              {filtered.length} Records
            </span>
          </div>

        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {['Date', 'Day', 'Status', 'In', 'Out', 'Duration', 'Late', 'Photos'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">Loading...</td></tr>
              ) : pageRecs.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">No records found</td></tr>
              ) : pageRecs.map(r => {
                const ci = photoUrl(r.checkin_frame_url);
                const co = photoUrl(r.checkout_frame_url);
                return (
                  <tr key={r.pk_attendance_id}
                    className="transition-colors hover:bg-accent/30">
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-foreground">
                        {new Date(r.attendance_date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">{dayName(r.attendance_date)}</td>
                    <td className="px-5 py-4"><Badge s={r.status} /></td>
                    <td className="px-5 py-4 font-mono text-xs text-emerald-500">{fmt(r.check_in)}</td>
                    <td className="px-5 py-4 font-mono text-xs text-rose-500">{fmt(r.check_out)}</td>
                    <td className="px-5 py-4 text-xs font-semibold text-primary">{fmtDur(r.duration_minutes)}</td>
                    <td className="px-5 py-4">
                      {r.is_late
                        ? <span className="text-xs text-amber-500">Late</span>
                        : <span className="text-xs text-emerald-500">On time</span>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-1.5">
                        {[
                          [ci, 'border-emerald-500/30', 'In'],
                          [co, 'border-rose-500/30', 'Out'],
                        ].map(([u, b, a]) => u ? (
                          <button key={a as string} onClick={() => setModalPhoto(u as string)}>
                            <img src={u as string} alt={a as string}
                              className={cn('w-8 h-8 rounded-lg object-cover border-2 hover:scale-150 transition-transform cursor-zoom-in', b)}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          </button>
                        ) : (
                          <div key={a as string} className="w-8 h-8 rounded-lg border border-dashed border-border/50 flex items-center justify-center">
                            <Camera className="w-3 h-3 text-muted-foreground/30" />
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 flex justify-between items-center border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground">
            {filtered.length === 0 ? 'No entries' :
              `${Math.min((page - 1) * PER + 1, filtered.length)}–${Math.min(page * PER, filtered.length)} of ${filtered.length}`}
          </p>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 rounded text-xs text-muted-foreground border border-border hover:bg-accent/40 disabled:opacity-40 transition-colors">Prev</button>
            {Array.from({ length: Math.min(pages, 5) }).map((_, i) => (
              <button key={i + 1} onClick={() => setPage(i + 1)}
                className={cn('px-3 py-1 rounded text-xs font-bold transition-colors',
                  page === i + 1 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground border border-border hover:bg-accent/40')}>
                {i + 1}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}
              className="px-3 py-1 rounded text-xs text-muted-foreground border border-border hover:bg-accent/40 disabled:opacity-40 transition-colors">Next</button>
          </div>
        </div>
      </section>

      {/* Weekly Trend */}
      <section className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Weekly Working Hours Trend</h4>
            <p className="text-xs text-muted-foreground mt-0.5">vs 8h daily target</p>
          </div>
          <div className="flex gap-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-primary inline-block" /> Actual</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 border-b-2 border-dashed border-amber-400 inline-block" /> 8h Target</span>
          </div>
        </div>
        <div className="h-52">
          {weekly.length === 0
            ? <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data</div>
            : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weekly}>
                  <defs>
                    <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 12]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip suffix="h" />} />
                  <ReferenceLine y={8} stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={2} />
                  <Area type="monotone" dataKey="Actual" stroke="hsl(var(--primary))" strokeWidth={2.5}
                    fill="url(#ag)"
                    dot={{ fill: 'hsl(var(--primary))', r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                    activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
        </div>
      </section>



      {/* ── Photo Modal (portal) ── */}
      {modalPhoto ? createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center p-6"
          onClick={() => setModalPhoto(null)}
        >
          <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setModalPhoto(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white text-sm flex items-center gap-1"
            >
              <X className="w-4 h-4" /> Close
            </button>
            <img
              src={modalPhoto}
              alt="Attendance proof"
              className="w-full h-auto max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
          </div>
        </div>,
        document.body
      ) : null}
    </div>

  );
};

export default EmployeeAnalytics;