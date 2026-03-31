import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { apiRequest } from '../../services/http/apiClient';
import { cn } from '../ui/utils';
import { MetricCard } from '../shared/MetricCard';
import { RosterTab } from './RosterTab';
import {
  ChevronDown, ChevronRight, Users, Clock, UserCheck, UserX,
  AlertTriangle, Plus, RefreshCw, Building2, Calendar, Edit2,
  Trash2, X, Check, UserPlus, Save, Palette
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Dept { id: string; name: string; code: string; color: string; employee_count: number; }
interface Shift { id: string; name: string; shift_type: string; start_time: string | null; end_time: string | null; grace_period_minutes: number; is_flexible: boolean; employee_count: number; }
interface Employee { pk_employee_id: string; full_name: string; employee_code: string; fk_department_id: string | null; fk_shift_id: string | null; department_name: string; shift_name?: string; }
interface AnalyticsRow { dept_id: string; department: string; code: string; color: string; shift_id: string; shift_name: string; shift_type: string; start_time: string | null; end_time: string | null; grace_period_minutes: number; pk_employee_id: string; full_name: string; employee_code: string; check_in_local: string | null; check_out_local: string | null; is_late: boolean | null; duration_minutes: number | null; today_status: 'present' | 'absent'; }

const DEPT_COLORS = ['#3B82F6','#EC4899','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4','#84CC16','#F97316','#6366F1'];
const SHIFT_TYPES = ['morning','afternoon','evening','night','flexible'];

const fmt12 = (t: string | null) => {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
};
const shiftColor = (type: string) => {
  const map: Record<string,string> = { morning:'text-amber-600 bg-amber-50 border-amber-200', afternoon:'text-orange-600 bg-orange-50 border-orange-200', evening:'text-blue-600 bg-blue-50 border-blue-200', night:'text-indigo-600 bg-indigo-50 border-indigo-200', flexible:'text-slate-600 bg-slate-50 border-slate-200' };
  return map[type] || map.flexible;
};
const statusDot = (status: string, isLate: boolean | null) => status === 'present' ? (isLate ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-slate-200 dark:bg-slate-600';

// ─── Modal ───────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Assign Modal ─────────────────────────────────────────────────────────────
function AssignModal({ title, employees, currentIds, onAssign, onClose }: { title: string; employees: Employee[]; currentIds: string[]; onAssign: (ids: string[]) => void; onClose: () => void; }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(currentIds));
  const toggle = (id: string) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
        {employees.map(e => (
          <label key={e.pk_employee_id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
            <input type="checkbox" checked={selected.has(e.pk_employee_id)} onChange={() => toggle(e.pk_employee_id)} className="rounded" />
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">{e.full_name}</p>
              <p className="text-xs text-slate-400">{e.employee_code} · {e.department_name}</p>
            </div>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => onAssign(Array.from(selected))} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors">
          Assign {selected.size} employee{selected.size !== 1 ? 's' : ''}
        </button>
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
      </div>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function DepartmentShiftManagement() {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [activeTab, setActiveTab] = useState<'departments'|'shifts'|'roster'>('departments');
  const [depts, setDepts] = useState<Dept[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set());

  // Modals
  const [deptModal, setDeptModal] = useState<{ mode: 'add'|'edit'; data?: Dept } | null>(null);
  const [shiftModal, setShiftModal] = useState<{ mode: 'add'|'edit'; data?: Shift } | null>(null);
  const [assignDeptModal, setAssignDeptModal] = useState<Dept | null>(null);
  const [assignShiftModal, setAssignShiftModal] = useState<Shift | null>(null);

  // Forms
  const emptyDept = { name:'', code:'', color: DEPT_COLORS[0] };
  const emptyShift = { name:'', shift_type:'morning', start_time:'09:00', end_time:'18:00', grace_period_minutes:10, is_flexible:false };
  const [deptForm, setDeptForm] = useState(emptyDept);
  const [shiftForm, setShiftForm] = useState(emptyShift);

  const opts = useCallback(() => ({ accessToken, scopeHeaders }), [accessToken]);

  const fetchAll = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const [deptsRes, shiftsRes, empsRes, analyticsRes] = await Promise.allSettled([
        apiRequest<{ data: Dept[] }>('/hr/departments', opts()),
        apiRequest<{ data: Shift[] }>('/hr/shifts', opts()),
        apiRequest<{ data: Employee[] }>('/live/employees', opts()),
        apiRequest<{ data: AnalyticsRow[] }>('/live/dept-shift-analytics', opts()),
      ]);
      if (deptsRes.status === 'fulfilled') setDepts(deptsRes.value.data);
      if (shiftsRes.status === 'fulfilled') setShifts(shiftsRes.value.data);
      if (empsRes.status === 'fulfilled') setEmployees(empsRes.value.data as any);
      if (analyticsRes.status === 'fulfilled') setAnalytics(analyticsRes.value.data);
      setLastRefreshed(new Date());
    } catch {}
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Dept CRUD ──────────────────────────────────────────────────────────────
  const saveDept = async () => {
    const method = deptModal?.mode === 'edit' ? 'PUT' : 'POST';
    const path = deptModal?.mode === 'edit' ? `/hr/departments/${deptModal.data!.id}` : '/hr/departments';
    await apiRequest(path, { ...opts(), method, body: JSON.stringify(deptForm) });
    setDeptModal(null); setDeptForm(emptyDept); fetchAll();
  };
  const deleteDept = async (id: string) => {
    if (!confirm('Delete this department? Employees will be unassigned.')) return;
    await apiRequest(`/hr/departments/${id}`, { ...opts(), method: 'DELETE' });
    fetchAll();
  };
  const assignDept = async (empIds: string[]) => {
    await apiRequest(`/hr/departments/${assignDeptModal!.id}/assign`, { ...opts(), method: 'POST', body: JSON.stringify({ employee_ids: empIds.map(Number) }) });
    setAssignDeptModal(null); fetchAll();
  };

  // ── Shift CRUD ─────────────────────────────────────────────────────────────
  const saveShift = async () => {
    const method = shiftModal?.mode === 'edit' ? 'PUT' : 'POST';
    const path = shiftModal?.mode === 'edit' ? `/hr/shifts/${shiftModal.data!.id}` : '/hr/shifts';
    await apiRequest(path, { ...opts(), method, body: JSON.stringify(shiftForm) });
    setShiftModal(null); setShiftForm(emptyShift as any); fetchAll();
  };
  const deleteShift = async (id: string) => {
    if (!confirm('Delete this shift? Employees will be unassigned.')) return;
    await apiRequest(`/hr/shifts/${id}`, { ...opts(), method: 'DELETE' });
    fetchAll();
  };
  const assignShift = async (empIds: string[]) => {
    await apiRequest(`/hr/shifts/${assignShiftModal!.id}/assign`, { ...opts(), method: 'POST', body: JSON.stringify({ employee_ids: empIds.map(Number) }) });
    setAssignShiftModal(null); fetchAll();
  };

  // ── Analytics grouping ─────────────────────────────────────────────────────
  const deptGroups = useMemo(() => {
    const map: Record<string, { dept: Dept; rows: AnalyticsRow[]; present: number; late: number; absent: number; }> = {};
    analytics.forEach(r => {
      if (!map[r.dept_id]) { const d = depts.find(d => d.id === r.dept_id); map[r.dept_id] = { dept: d || { id: r.dept_id, name: r.department, code: r.code, color: r.color, employee_count: 0 }, rows: [], present: 0, late: 0, absent: 0 }; }
      map[r.dept_id].rows.push(r);
      if (r.today_status === 'present') { map[r.dept_id].present++; if (r.is_late) map[r.dept_id].late++; }
      else map[r.dept_id].absent++;
    });
    return Object.values(map);
  }, [analytics, depts]);

  const shiftGroups = useMemo(() => {
    const map: Record<string, { shift: Shift; rows: AnalyticsRow[]; present: number; late: number; absent: number; }> = {};
    analytics.forEach(r => {
      if (!map[r.shift_id]) { const s = shifts.find(s => s.id === r.shift_id); map[r.shift_id] = { shift: s || { id: r.shift_id, name: r.shift_name, shift_type: r.shift_type, start_time: r.start_time, end_time: r.end_time, grace_period_minutes: r.grace_period_minutes, is_flexible: false, employee_count: 0 }, rows: [], present: 0, late: 0, absent: 0 }; }
      map[r.shift_id].rows.push(r);
      if (r.today_status === 'present') { map[r.shift_id].present++; if (r.is_late) map[r.shift_id].late++; }
      else map[r.shift_id].absent++;
    });
    return Object.values(map).sort((a,b) => (a.shift.start_time||'').localeCompare(b.shift.start_time||''));
  }, [analytics, shifts]);

  const totalPresent = analytics.filter(r => r.today_status === 'present').length;
  const totalLate = analytics.filter(r => r.is_late).length;
  const totalAbsent = analytics.filter(r => r.today_status === 'absent').length;
  const totalEmp = new Set(analytics.map(r => r.pk_employee_id)).size;

  const toggle = (set: Set<string>, id: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setter(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Departments & Shifts</h2>
          {lastRefreshed && <p className="text-xs text-slate-400 mt-0.5">Updated {lastRefreshed.toLocaleTimeString()}</p>}
        </div>
        <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Employees" value={totalEmp} icon={Users} description="Active workforce" />
        <MetricCard title="Present Today" value={totalPresent} icon={UserCheck} description="Checked in" colorClass="text-emerald-500" />
        <MetricCard title="Late Arrivals" value={totalLate} icon={AlertTriangle} description="Past grace period" colorClass="text-amber-500" />
        <MetricCard title="Absent Today" value={totalAbsent} icon={UserX} description="Not checked in" colorClass="text-rose-500" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {(['departments','shifts','roster'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={cn("px-4 py-1.5 text-sm font-semibold rounded-lg capitalize transition-all", activeTab === tab ? "bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}>
            {tab === 'departments' ? <><Building2 className="w-3.5 h-3.5 inline mr-1.5" />Departments ({depts.length})</>
             : tab === 'shifts' ? <><Clock className="w-3.5 h-3.5 inline mr-1.5" />Shifts ({shifts.length})</>
             : <><Calendar className="w-3.5 h-3.5 inline mr-1.5" />Roster</>}
          </button>
        ))}
      </div>

      {/* ── DEPARTMENTS TAB ── */}
      {activeTab === 'departments' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => { setDeptForm(emptyDept); setDeptModal({ mode: 'add' }); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
              <Plus className="w-4 h-4" /> Add Department
            </button>
          </div>
          {deptGroups.map(({ dept, rows, present, late, absent }) => {
            const expanded = expandedDepts.has(dept.id);
            const rate = rows.length > 0 ? Math.round((present / rows.length) * 100) : 0;
            const byShift = rows.reduce((acc, r) => { if (!acc[r.shift_id]) acc[r.shift_id] = []; acc[r.shift_id].push(r); return acc; }, {} as Record<string, AnalyticsRow[]>);
            return (
              <div key={dept.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => toggle(expandedDepts, dept.id, setExpandedDepts)} className="flex items-center gap-3 flex-1 text-left">
                    <div className="w-3 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: dept.color }} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{dept.name}</span>
                        <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{dept.code}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs">
                        <span className="text-slate-500">{rows.length} employees</span>
                        <span className="text-emerald-600 font-medium">{present} present</span>
                        {late > 0 && <span className="text-amber-600 font-medium">{late} late</span>}
                        {absent > 0 && <span className="text-rose-500 font-medium">{absent} absent</span>}
                      </div>
                    </div>
                    <div className="w-20 hidden sm:block mr-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">Rate</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{rate}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", rate>=80?"bg-emerald-500":rate>=50?"bg-amber-500":"bg-rose-500")} style={{width:`${rate}%`}} />
                      </div>
                    </div>
                    {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                  </button>
                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setAssignDeptModal(dept)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Assign employees">
                      <UserPlus className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setDeptForm({ name: dept.name, code: dept.code, color: dept.color }); setDeptModal({ mode: 'edit', data: dept }); }} className="p-1.5 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteDept(dept.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    {Object.entries(byShift).map(([sid, emps]) => (
                      <div key={sid}>
                        <div className={cn("px-4 py-2 flex items-center gap-2 text-xs font-semibold border-b border-slate-50 dark:border-slate-800/50", shiftColor(emps[0].shift_type))}>
                          <span>{emps[0].shift_name}</span>
                          <span className="ml-auto opacity-60">{fmt12(emps[0].start_time)} – {fmt12(emps[0].end_time)}</span>
                        </div>
                        {emps.map(emp => (
                          <div key={emp.pk_employee_id} className="flex items-center gap-3 px-6 py-2.5 border-b border-slate-50 dark:border-slate-800/30 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                            <div className={cn("w-2 h-2 rounded-full flex-shrink-0", statusDot(emp.today_status, emp.is_late))} />
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-200 flex-1">{emp.full_name}</span>
                            <span className="text-xs text-slate-400">{emp.employee_code}</span>
                            {emp.today_status === 'present' ? (
                              <div className="flex items-center gap-2 text-xs">
                                {emp.check_in_local && <span className="text-emerald-600">In: {new Date(emp.check_in_local).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>}
                                {emp.is_late && <span className="text-amber-500 font-semibold">Late</span>}
                              </div>
                            ) : <span className="text-xs text-rose-400 font-medium">Absent</span>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {/* Unassigned depts (no analytics) */}
          {depts.filter(d => !deptGroups.find(g => g.dept.id === d.id)).map(dept => (
            <div key={dept.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
              <div className="w-3 h-10 rounded-full" style={{ backgroundColor: dept.color }} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-white">{dept.name}</span>
                  <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{dept.code}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{dept.employee_count} active employees</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setAssignDeptModal(dept)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"><UserPlus className="w-4 h-4" /></button>
                <button onClick={() => { setDeptForm({ name: dept.name, code: dept.code, color: dept.color }); setDeptModal({ mode: 'edit', data: dept }); }} className="p-1.5 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => deleteDept(dept.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SHIFTS TAB ── */}
      {activeTab === 'shifts' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => { setShiftForm(emptyShift as any); setShiftModal({ mode: 'add' }); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
              <Plus className="w-4 h-4" /> Add Shift
            </button>
          </div>
          {shiftGroups.map(({ shift, rows, present, late, absent }) => {
            const expanded = expandedShifts.has(shift.id);
            const rate = rows.length > 0 ? Math.round((present / rows.length) * 100) : 0;
            const lowCoverage = rate < 50 && rows.length > 0;
            return (
              <div key={shift.id} className={cn("bg-white dark:bg-slate-900 border rounded-2xl overflow-hidden shadow-sm", lowCoverage ? "border-rose-200 dark:border-rose-800" : "border-slate-200 dark:border-slate-700")}>
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => toggle(expandedShifts, shift.id, setExpandedShifts)} className="flex items-center gap-3 flex-1 text-left">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border text-xs font-bold", shiftColor(shift.shift_type))}>
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white">{shift.name}</span>
                        {lowCoverage && <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-900/20 px-1.5 py-0.5 rounded-full border border-rose-200">⚠ Low Coverage</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                        <span>{fmt12(shift.start_time)} – {fmt12(shift.end_time)}</span>
                        {shift.grace_period_minutes > 0 && <span className="text-slate-400">+{shift.grace_period_minutes}m grace</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0 hidden sm:flex">
                      <div className="text-center"><p className="text-lg font-bold text-emerald-600">{present}</p><p className="text-[10px] text-slate-400">Present</p></div>
                      <div className="text-center"><p className="text-lg font-bold text-amber-500">{late}</p><p className="text-[10px] text-slate-400">Late</p></div>
                      <div className="text-center"><p className="text-lg font-bold text-rose-500">{absent}</p><p className="text-[10px] text-slate-400">Absent</p></div>
                      <div className="w-16">
                        <div className="text-xs font-bold text-right mb-1 text-slate-600 dark:text-slate-300">{rate}%</div>
                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full", rate>=80?"bg-emerald-500":rate>=50?"bg-amber-500":"bg-rose-500")} style={{width:`${rate}%`}} />
                        </div>
                      </div>
                    </div>
                    {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setAssignShiftModal(shift)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"><UserPlus className="w-4 h-4" /></button>
                    <button onClick={() => { setShiftForm({ name: shift.name, shift_type: shift.shift_type, start_time: shift.start_time || '09:00', end_time: shift.end_time || '18:00', grace_period_minutes: shift.grace_period_minutes, is_flexible: shift.is_flexible }); setShiftModal({ mode: 'edit', data: shift }); }} className="p-1.5 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => deleteShift(shift.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    {rows.map(emp => (
                      <div key={emp.pk_employee_id} className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-50 dark:border-slate-800/30 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                        <div className={cn("w-2 h-2 rounded-full flex-shrink-0", statusDot(emp.today_status, emp.is_late))} />
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200 flex-1">{emp.full_name}</span>
                        <span className="text-xs text-slate-400">{emp.employee_code} · {emp.department}</span>
                        {emp.today_status === 'present' ? (
                          <div className="flex items-center gap-2 text-xs">
                            {emp.check_in_local && <span className="text-emerald-600">In: {new Date(emp.check_in_local).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>}
                            {emp.is_late && <span className="text-amber-500 font-semibold">Late</span>}
                          </div>
                        ) : <span className="text-xs text-rose-400 font-medium">Absent</span>}
                      </div>
                    ))}
                    {/* Employees assigned to this shift but not in analytics */}
                    {shifts.find(s=>s.id===shift.id) && (employees as any[]).filter((e:any) => String(e.fk_shift_id) === shift.id && !rows.find(r => r.pk_employee_id === String(e.pk_employee_id))).map((e:any) => (
                      <div key={e.pk_employee_id} className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-50 dark:border-slate-800/30 last:border-0 opacity-50">
                        <div className="w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-600 flex-shrink-0" />
                        <span className="text-sm text-slate-600 dark:text-slate-400 flex-1">{e.full_name}</span>
                        <span className="text-xs text-slate-400">{e.employee_code}</span>
                        <span className="text-xs text-slate-400">No data</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {/* Shifts with no analytics */}
          {shifts.filter(s => !shiftGroups.find(g => g.shift.id === s.id)).map(shift => (
            <div key={shift.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border", shiftColor(shift.shift_type))}><Clock className="w-5 h-5" /></div>
              <div className="flex-1">
                <span className="font-bold text-slate-900 dark:text-white">{shift.name}</span>
                <p className="text-xs text-slate-500 mt-0.5">{fmt12(shift.start_time)} – {fmt12(shift.end_time)} · {shift.employee_count} employees</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setAssignShiftModal(shift)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"><UserPlus className="w-4 h-4" /></button>
                <button onClick={() => { setShiftForm({ name: shift.name, shift_type: shift.shift_type, start_time: shift.start_time||'09:00', end_time: shift.end_time||'18:00', grace_period_minutes: shift.grace_period_minutes, is_flexible: shift.is_flexible }); setShiftModal({ mode: 'edit', data: shift }); }} className="p-1.5 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => deleteShift(shift.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ROSTER TAB ── */}

      {/* ── ROSTER TAB ── */}
      {activeTab === 'roster' && (
        <RosterTab
          employees={employees as any}
          shifts={shifts.map(s => ({ ...s, id: String((s as any).pk_shift_id || s.id) }))}
        />
      )}

      {/* ── DEPT MODAL ── */}
      {deptModal && (
        <Modal title={deptModal.mode === 'add' ? 'Add Department' : 'Edit Department'} onClose={() => setDeptModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Department Name *</label>
              <input value={deptForm.name} onChange={e => setDeptForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Engineering" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Code *</label>
              <input value={deptForm.code} onChange={e => setDeptForm(f => ({...f, code: e.target.value.toUpperCase()}))} placeholder="e.g. ENG" maxLength={10} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1"><Palette className="w-3 h-3" /> Color</label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {DEPT_COLORS.map(c => (
                  <button key={c} onClick={() => setDeptForm(f => ({...f, color: c}))} className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110", deptForm.color === c ? "border-slate-900 dark:border-white scale-110" : "border-transparent")} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={saveDept} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"><Save className="w-4 h-4" />Save</button>
              <button onClick={() => setDeptModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── SHIFT MODAL ── */}
      {shiftModal && (
        <Modal title={shiftModal.mode === 'add' ? 'Add Shift' : 'Edit Shift'} onClose={() => setShiftModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Shift Name *</label>
              <input value={shiftForm.name} onChange={e => setShiftForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Morning Shift" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Type *</label>
              <select value={shiftForm.shift_type} onChange={e => setShiftForm(f => ({...f, shift_type: e.target.value}))} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {SHIFT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
              </select>
            </div>
            {!shiftForm.is_flexible && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Start Time</label>
                  <input type="time" value={shiftForm.start_time || ''} onChange={e => setShiftForm(f => ({...f, start_time: e.target.value}))} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">End Time</label>
                  <input type="time" value={shiftForm.end_time || ''} onChange={e => setShiftForm(f => ({...f, end_time: e.target.value}))} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Grace Period (minutes)</label>
              <input type="number" value={shiftForm.grace_period_minutes} min={0} max={60} onChange={e => setShiftForm(f => ({...f, grace_period_minutes: Number(e.target.value)}))} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={shiftForm.is_flexible} onChange={e => setShiftForm(f => ({...f, is_flexible: e.target.checked}))} className="rounded" />
              <span className="text-sm text-slate-700 dark:text-slate-300">Flexible hours (no fixed start/end time)</span>
            </label>
            <div className="flex gap-2 pt-2">
              <button onClick={saveShift} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"><Save className="w-4 h-4" />Save</button>
              <button onClick={() => setShiftModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── ASSIGN DEPT MODAL ── */}
      {assignDeptModal && (
        <AssignModal
          title={`Assign to ${assignDeptModal.name}`}
          employees={employees as any}
          currentIds={(employees as any[]).filter((e:any) => String(e.fk_department_id) === assignDeptModal.id).map((e:any) => String(e.pk_employee_id))}
          onAssign={assignDept}
          onClose={() => setAssignDeptModal(null)}
        />
      )}

      {/* ── ASSIGN SHIFT MODAL ── */}
      {assignShiftModal && (
        <AssignModal
          title={`Assign to ${assignShiftModal.name}`}
          employees={employees as any}
          currentIds={(employees as any[]).filter((e:any) => String(e.fk_shift_id) === assignShiftModal.id).map((e:any) => String(e.pk_employee_id))}
          onAssign={assignShift}
          onClose={() => setAssignShiftModal(null)}
        />
      )}
    </div>
  );
}
