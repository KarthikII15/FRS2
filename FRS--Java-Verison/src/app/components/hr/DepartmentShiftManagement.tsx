import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Building2, Clock, Plus, Edit, Trash2, Users, Loader2,
  RefreshCw, AlertCircle, ChevronDown, CheckCircle2
} from 'lucide-react';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { useApiData } from '../../hooks/useApiData';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

export const DepartmentShiftManagement: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const { employees } = useApiData({ autoRefreshMs: 0 });

  const [departments, setDepartments] = useState<any[]>([]);
  const [shifts, setShifts]           = useState<any[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [saving, setSaving]           = useState(false);

  // Dept form
  const [deptOpen, setDeptOpen]       = useState(false);
  const [deptEdit, setDeptEdit]       = useState<any>(null);
  const [deptForm, setDeptForm]       = useState({ name: '', code: '', color: '#3B82F6' });

  // Shift form
  const [shiftOpen, setShiftOpen]     = useState(false);
  const [shiftEdit, setShiftEdit]     = useState<any>(null);
  const [shiftForm, setShiftForm]     = useState({
    name: '', shift_type: 'morning', start_time: '09:00', end_time: '18:00', grace_period_minutes: '10', is_flexible: false,
  });

  // Assign dept
  const [assignDeptOpen, setAssignDeptOpen] = useState(false);
  const [assignDept, setAssignDept]         = useState<any>(null);
  const [selectedDeptEmps, setSelectedDeptEmps] = useState<string[]>([]);

  // Assign shift
  const [assignOpen, setAssignOpen]   = useState(false);
  const [assignShift, setAssignShift] = useState<any>(null);
  const [selectedEmps, setSelectedEmps] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const [dR, sR] = await Promise.all([
        apiRequest<{ data: any[] }>('/hr/departments', { accessToken, scopeHeaders }),
        apiRequest<{ data: any[] }>('/hr/shifts',      { accessToken, scopeHeaders }),
      ]);
      setDepartments(dR.data ?? []);
      setShifts(sR.data ?? []);
    } catch (e) {
      toast.error('Load failed', { description: e instanceof Error ? e.message : String(e) });
    } finally { setIsLoading(false); }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  // ── Department CRUD ───────────────────────────────────────
  const saveDept = async () => {
    if (!deptForm.name || !deptForm.code) { toast.error('Name and code required'); return; }
    setSaving(true);
    try {
      if (deptEdit) {
        await apiRequest(`/hr/departments/${deptEdit.id}`, {
          method: 'PUT', accessToken, scopeHeaders, body: JSON.stringify(deptForm),
        });
        toast.success('Department updated');
      } else {
        await apiRequest('/hr/departments', {
          method: 'POST', accessToken, scopeHeaders, body: JSON.stringify(deptForm),
        });
        toast.success('Department created');
      }
      setDeptOpen(false); setDeptEdit(null); setDeptForm({ name: '', code: '', color: '#3B82F6' });
      await load();
    } catch (e) { toast.error('Failed', { description: e instanceof Error ? e.message : String(e) });
    } finally { setSaving(false); }
  };

  const deleteDept = async (d: any) => {
    if (!window.confirm(`Delete department "${d.name}"?`)) return;
    try {
      await apiRequest(`/hr/departments/${d.id}`, { method: 'DELETE', accessToken, scopeHeaders });
      toast.success('Department deleted');
      await load();
    } catch (e) { toast.error('Failed'); }
  };

  // ── Shift CRUD ────────────────────────────────────────────
  const saveShift = async () => {
    if (!shiftForm.name || !shiftForm.shift_type) { toast.error('Name and type required'); return; }
    setSaving(true);
    try {
      const payload = { ...shiftForm, grace_period_minutes: Number(shiftForm.grace_period_minutes) };
      if (shiftEdit) {
        await apiRequest(`/hr/shifts/${shiftEdit.id}`, { method: 'PUT', accessToken, scopeHeaders, body: JSON.stringify(payload) });
        toast.success('Shift updated');
      } else {
        await apiRequest('/hr/shifts', { method: 'POST', accessToken, scopeHeaders, body: JSON.stringify(payload) });
        toast.success('Shift created');
      }
      setShiftOpen(false); setShiftEdit(null);
      setShiftForm({ name: '', shift_type: 'morning', start_time: '09:00', end_time: '18:00', grace_period_minutes: '10', is_flexible: false });
      await load();
    } catch (e) { toast.error('Failed', { description: e instanceof Error ? e.message : String(e) });
    } finally { setSaving(false); }
  };

  const deleteShift = async (s: any) => {
    if (!window.confirm(`Delete shift "${s.name}"?`)) return;
    try {
      await apiRequest(`/hr/shifts/${s.id}`, { method: 'DELETE', accessToken, scopeHeaders });
      toast.success('Shift deleted');
      await load();
    } catch (e) { toast.error('Failed'); }
  };

  const openAssign = (shift: any) => {
    setAssignShift(shift);
    const empIds = employees.filter((e: any) => e.fk_shift_id === shift.id).map((e: any) => String(e.pk_employee_id));
    setSelectedEmps(empIds);
    setAssignOpen(true);
  };

  const openAssignDept = (dept: any) => {
    setAssignDept(dept);
    const empIds = employees.filter((e: any) => e.fk_department_id === dept.id).map((e: any) => String(e.pk_employee_id));
    setSelectedDeptEmps(empIds);
    setAssignDeptOpen(true);
  };

  const saveDeptAssign = async () => {
    if (!assignDept) return;
    setSaving(true);
    try {
      await apiRequest(`/hr/departments/${assignDept.id}/assign`, {
        method: 'POST', accessToken, scopeHeaders,
        body: JSON.stringify({ employee_ids: selectedDeptEmps.map(Number) }),
      });
      toast.success('Staff assigned', { description: `${selectedDeptEmps.length} employees assigned to ${assignDept.name}` });
      setAssignDeptOpen(false);
      await load();
    } catch (e) { toast.error('Failed');
    } finally { setSaving(false); }
  };

  const saveAssign = async () => {
    if (!assignShift) return;
    setSaving(true);
    try {
      await apiRequest(`/hr/shifts/${assignShift.id}/assign`, {
        method: 'POST', accessToken, scopeHeaders,
        body: JSON.stringify({ employee_ids: selectedEmps.map(Number) }),
      });
      toast.success('Staff assigned', { description: `${selectedEmps.length} employees assigned to ${assignShift.name}` });
      setAssignOpen(false);
      await load();
    } catch (e) { toast.error('Failed');
    } finally { setSaving(false); }
  };

  const shiftTypeLabel = (t: string) => ({ morning: 'Morning', evening: 'Evening', night: 'Night', flexible: 'Flexible' }[t] || t);
  const shiftTypeColor = (t: string) => ({
    morning: 'bg-amber-50 text-amber-700 border-amber-200',
    evening: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    night:   'bg-slate-100 text-slate-700 border-slate-200',
    flexible:'bg-emerald-50 text-emerald-700 border-emerald-200',
  }[t] || 'bg-slate-100 text-slate-600');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className={cn("text-xl font-bold", lightTheme.text.primary)}>Departments & Shifts</h2>
        <Button variant="outline" size="sm" onClick={load} disabled={isLoading} className="gap-1.5">
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>

      <Tabs defaultValue="departments">
        <TabsList>
          <TabsTrigger value="departments">Departments ({departments.length})</TabsTrigger>
          <TabsTrigger value="shifts">Shifts ({shifts.length})</TabsTrigger>
        </TabsList>

        {/* ── DEPARTMENTS ── */}
        <TabsContent value="departments" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setDeptEdit(null); setDeptForm({ name:'',code:'',color:'#3B82F6' }); setDeptOpen(true); }}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4" /> Add Department
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-slate-400 text-sm">Loading...</span>
            </div>
          ) : departments.length === 0 ? (
            <Card className={cn(lightTheme.background.card, lightTheme.border.default)}>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Building2 className="w-8 h-8 text-slate-300" />
                <p className="text-slate-400 text-sm">No departments yet. Add your first department.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {departments.map(d => (
                <Card key={d.id} className={cn(lightTheme.background.card, lightTheme.border.default)}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-10 rounded-full" style={{ backgroundColor: d.color || '#3B82F6' }} />
                        <div>
                          <p className={cn("font-bold", lightTheme.text.primary)}>{d.name}</p>
                          <p className="text-xs font-mono text-slate-400">{d.code}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-indigo-600 hover:bg-indigo-50 gap-1"
                          onClick={() => openAssignDept(d)}>
                          <Users className="w-3 h-3" /> Assign
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                          onClick={() => { setDeptEdit(d); setDeptForm({ name: d.name, code: d.code, color: d.color || '#3B82F6' }); setDeptOpen(true); }}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                          onClick={() => deleteDept(d)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-500">{d.employee_count || 0} active employees</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── SHIFTS ── */}
        <TabsContent value="shifts" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setShiftEdit(null); setShiftOpen(true); }}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4" /> Add Shift
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-slate-400 text-sm">Loading...</span>
            </div>
          ) : shifts.length === 0 ? (
            <Card className={cn(lightTheme.background.card, lightTheme.border.default)}>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Clock className="w-8 h-8 text-slate-300" />
                <p className="text-slate-400 text-sm">No shifts yet. Add your first shift.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shifts.map(s => (
                <Card key={s.id} className={cn(lightTheme.background.card, lightTheme.border.default)}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className={cn("font-bold", lightTheme.text.primary)}>{s.name}</p>
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border mt-1 inline-block", shiftTypeColor(s.shift_type))}>
                          {shiftTypeLabel(s.shift_type)}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-indigo-600 hover:bg-indigo-50 gap-1"
                          onClick={() => openAssign(s)}>
                          <Users className="w-3 h-3" /> Assign
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                          onClick={() => {
                            setShiftEdit(s);
                            setShiftForm({ name: s.name, shift_type: s.shift_type, start_time: s.start_time || '09:00', end_time: s.end_time || '18:00', grace_period_minutes: String(s.grace_period_minutes || 10), is_flexible: s.is_flexible || false });
                            setShiftOpen(true);
                          }}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                          onClick={() => deleteShift(s)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                      <div>
                        <p className="text-xs text-slate-400">Start</p>
                        <p className="font-mono font-semibold">{s.start_time || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">End</p>
                        <p className="font-mono font-semibold">{s.end_time || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Grace Period</p>
                        <p className="font-semibold">{s.grace_period_minutes} min</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Employees</p>
                        <p className="font-semibold">{s.employee_count || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dept dialog */}
      <Dialog open={deptOpen} onOpenChange={o => { setDeptOpen(o); if (!o) setDeptEdit(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{deptEdit ? 'Edit Department' : 'New Department'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {[{ label: 'Name *', key: 'name', ph: 'Engineering' }, { label: 'Code *', key: 'code', ph: 'ENG' }].map(f => (
              <div key={f.key}>
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">{f.label}</Label>
                <Input value={(deptForm as any)[f.key]} placeholder={f.ph}
                  onChange={e => setDeptForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Color</Label>
              <input type="color" value={deptForm.color} onChange={e => setDeptForm(p => ({ ...p, color: e.target.value }))}
                className="h-9 w-full rounded-md border border-input cursor-pointer" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setDeptOpen(false)}>Cancel</Button>
            <Button onClick={saveDept} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dept assign dialog */}
      <Dialog open={assignDeptOpen} onOpenChange={setAssignDeptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Staff — {assignDept?.name}</DialogTitle>
            <DialogDescription>Select employees to assign to this department.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-64 overflow-y-auto space-y-2">
            {employees.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">No employees loaded</p>
            ) : employees.map((emp: any) => {
              const id = String(emp.pk_employee_id);
              const checked = selectedDeptEmps.includes(id);
              return (
                <label key={id} className={cn("flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors",
                  checked ? "bg-blue-50 border-blue-200" : cn(lightTheme.background.secondary, lightTheme.border.default)
                )}>
                  <input type="checkbox" checked={checked} onChange={() =>
                    setSelectedDeptEmps(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
                  } className="rounded" />
                  <div>
                    <p className="text-sm font-semibold">{emp.full_name}</p>
                    <p className="text-xs text-slate-400">{emp.employee_code} · {emp.position_title}</p>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex justify-between items-center mt-4">
            <span className="text-xs text-slate-400">{selectedDeptEmps.length} selected</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAssignDeptOpen(false)}>Cancel</Button>
              <Button onClick={saveDeptAssign} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Assign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shift dialog */}
      <Dialog open={shiftOpen} onOpenChange={o => { setShiftOpen(o); if (!o) setShiftEdit(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{shiftEdit ? 'Edit Shift' : 'New Shift'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="col-span-2">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Shift Name *</Label>
              <Input value={shiftForm.name} placeholder="Morning Shift" onChange={e => setShiftForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Type *</Label>
              <Select value={shiftForm.shift_type} onValueChange={v => setShiftForm(p => ({ ...p, shift_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="evening">Evening</SelectItem>
                  <SelectItem value="night">Night</SelectItem>
                  <SelectItem value="flexible">Flexible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Start Time</Label>
              <Input type="time" value={shiftForm.start_time} onChange={e => setShiftForm(p => ({ ...p, start_time: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">End Time</Label>
              <Input type="time" value={shiftForm.end_time} onChange={e => setShiftForm(p => ({ ...p, end_time: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Grace Period (min)</Label>
              <Input type="number" value={shiftForm.grace_period_minutes} onChange={e => setShiftForm(p => ({ ...p, grace_period_minutes: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setShiftOpen(false)}>Cancel</Button>
            <Button onClick={saveShift} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign staff dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Staff — {assignShift?.name}</DialogTitle>
            <DialogDescription>Select employees to assign to this shift.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-64 overflow-y-auto space-y-2">
            {employees.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">No employees loaded</p>
            ) : employees.map((emp: any) => {
              const id = String(emp.pk_employee_id);
              const checked = selectedEmps.includes(id);
              return (
                <label key={id} className={cn("flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors",
                  checked ? "bg-blue-50 border-blue-200" : cn(lightTheme.background.secondary, lightTheme.border.default)
                )}>
                  <input type="checkbox" checked={checked} onChange={() =>
                    setSelectedEmps(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
                  } className="rounded" />
                  <div>
                    <p className="text-sm font-semibold">{emp.full_name}</p>
                    <p className="text-xs text-slate-400">{emp.department_name} · {emp.employee_code}</p>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex justify-between items-center mt-4">
            <span className="text-xs text-slate-400">{selectedEmps.length} selected</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
              <Button onClick={saveAssign} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Assign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
