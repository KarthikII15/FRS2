#!/bin/bash
# ============================================================
# FRS2 — Fix employee lifecycle crash + UI improvements
# 1. Fix EmployeeLifecycleManagement (field name mismatch crash)
# 2. Remove AI Insights tab from HR dashboard  
# 3. Add Employee Management to both HR + Admin (add/edit/remove)
# 4. Add Live Audit Log to Admin dashboard
# Run: bash ~/FRS_/FRS--Java-Verison/fix_employee_and_ui.sh
# ============================================================
set -e

PROJECT="$HOME/FRS_/FRS--Java-Verison"
SRC="$PROJECT/src/app"

echo ""
echo "=================================================="
echo " FRS2: Employee lifecycle fix + UI improvements"
echo "=================================================="
echo ""

cd "$PROJECT"

# ══════════════════════════════════════════════════════════
# 1. FIX HRDashboard — remove AI Insights, fix nav
# ══════════════════════════════════════════════════════════
echo "[1/5] Updating HRDashboard navigation..."

python3 << 'PYEOF'
import os, re

path = os.path.expanduser("~/FRS_/FRS--Java-Verison/src/app/components/HRDashboard.tsx")
with open(path) as f:
    c = f.read()

# Remove AI Insights from navigation items
c = re.sub(
    r"\s*\{\s*label:\s*'AI Insights'.*?value:\s*'ai-insights'\s*\},?\n",
    "\n",
    c, flags=re.DOTALL
)

# Remove AI Insights case from renderContent
c = re.sub(
    r"\s*case 'ai-insights':\s*\n\s*return <AIInsightsPanel[^;]+;",
    "",
    c
)

# Remove AIInsightsPanel import
c = c.replace("import { AIInsightsPanel } from './hr/AIInsightsPanel';\n", "")
c = c.replace("import { mockAIInsights } from '../utils/mockData';\n", "")

# Rename 'Employee Lifecycle' nav item to 'Employee Management'
c = c.replace(
    "label: 'Employee Lifecycle',",
    "label: 'Employee Management',"
)

with open(path, 'w') as f:
    f.write(c)

print("  ✅ HRDashboard.tsx — AI Insights removed, Employee Management renamed")
PYEOF

# ══════════════════════════════════════════════════════════
# 2. REWRITE EmployeeLifecycleManagement with real API + fix crash
# ══════════════════════════════════════════════════════════
echo "[2/5] Rewriting EmployeeLifecycleManagement with real API..."

cat > "$SRC/components/hr/EmployeeLifecycleManagement.tsx" << 'TSEOF'
import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  UserPlus, UserMinus, Users, ScanFace, Search,
  Edit, UserX, Mail, Phone, Loader2, RefreshCw, AlertCircle, X
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogTrigger,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '../ui/select';
import { EmployeeProfileDashboard } from './EmployeeProfileDashboard';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { useApiData } from '../../hooks/useApiData';

interface ApiEmployee {
  pk_employee_id: number;
  employee_code: string;
  full_name: string;
  email: string;
  position_title: string;
  location_label: string;
  join_date: string;
  status: 'active' | 'inactive' | 'on-leave';
  department_name: string;
  shift_type: string;
  phone_number?: string;
  face_enrolled?: boolean;
  fk_department_id?: number;
  fk_shift_id?: number;
}

interface NewEmployeeForm {
  employee_code: string;
  full_name: string;
  email: string;
  position_title: string;
  location_label: string;
  join_date: string;
  phone_number: string;
  status: 'active' | 'inactive' | 'on-leave';
  fk_department_id: string;
  fk_shift_id: string;
}

const EMPTY_FORM: NewEmployeeForm = {
  employee_code: '', full_name: '', email: '', position_title: '',
  location_label: '', join_date: new Date().toISOString().slice(0, 10),
  phone_number: '', status: 'active', fk_department_id: '', fk_shift_id: '',
};

export const EmployeeLifecycleManagement: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isAddOpen, setIsAddOpen]   = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiEmployee | null>(null);
  const [form, setForm]             = useState<NewEmployeeForm>(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<ApiEmployee | null>(null);

  // Departments and shifts for dropdowns
  const { } = useApiData({ autoRefreshMs: 0 });
  const [departments, setDepartments] = useState<{ pk_department_id: number; name: string }[]>([]);
  const [shifts, setShifts]           = useState<{ pk_shift_id: number; name: string; shift_type: string }[]>([]);

  const loadEmployees = async () => {
    if (!accessToken) return;
    setIsLoading(true); setError(null);
    try {
      const res = await apiRequest<{ data: ApiEmployee[] }>('/employees', { accessToken, scopeHeaders });
      setEmployees(res.data ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load';
      setError(msg);
      toast.error('Load failed', { description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const loadDropdowns = async () => {
    if (!accessToken) return;
    try {
      const [deptRes, shiftRes] = await Promise.allSettled([
        apiRequest<{ data: any[] }>('/live/employees?limit=1', { accessToken, scopeHeaders }),
        apiRequest<{ data: any[] }>('/live/shifts', { accessToken, scopeHeaders }),
      ]);
      // Load departments from DB directly via attendance live endpoint
      const empRes = await apiRequest<{ data: any[] }>('/live/employees?limit=200', { accessToken, scopeHeaders });
      const deptMap = new Map<number, string>();
      (empRes.data ?? []).forEach((e: any) => {
        if (e.fk_department_id && e.department_name) deptMap.set(e.fk_department_id, e.department_name);
      });
      setDepartments(Array.from(deptMap.entries()).map(([id, name]) => ({ pk_department_id: id, name })));

      if (shiftRes.status === 'fulfilled') {
        setShifts((shiftRes.value as any).data ?? []);
      }
    } catch (_) {}
  };

  useEffect(() => {
    loadEmployees();
    loadDropdowns();
  }, [accessToken]);

  const filtered = useMemo(() => employees.filter(e => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q ||
      (e.full_name ?? '').toLowerCase().includes(q) ||
      (e.email ?? '').toLowerCase().includes(q) ||
      (e.employee_code ?? '').toLowerCase().includes(q) ||
      (e.department_name ?? '').toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || e.status === filterStatus;
    return matchSearch && matchStatus;
  }), [employees, searchTerm, filterStatus]);

  const stats = useMemo(() => ({
    total:    employees.length,
    active:   employees.filter(e => e.status === 'active').length,
    inactive: employees.filter(e => e.status === 'inactive').length,
    onLeave:  employees.filter(e => e.status === 'on-leave').length,
    enrolled: employees.filter(e => e.face_enrolled).length,
  }), [employees]);

  const handleAdd = async () => {
    if (!form.full_name || !form.email || !form.employee_code || !form.position_title) {
      toast.error('Fill in all required fields');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/employees', {
        method: 'POST',
        accessToken,
        scopeHeaders,
        body: JSON.stringify({
          ...form,
          fk_department_id: form.fk_department_id ? Number(form.fk_department_id) : undefined,
          fk_shift_id:      form.fk_shift_id      ? Number(form.fk_shift_id)      : undefined,
        }),
      });
      toast.success('Employee added', { description: `${form.full_name} has been onboarded.` });
      setIsAddOpen(false);
      setForm(EMPTY_FORM);
      await loadEmployees();
    } catch (e) {
      toast.error('Failed to add employee', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/employees/${editTarget.pk_employee_id}`, {
        method: 'PUT',
        accessToken,
        scopeHeaders,
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email,
          position_title: form.position_title,
          location_label: form.location_label,
          phone_number: form.phone_number,
          status: form.status,
          fk_department_id: form.fk_department_id ? Number(form.fk_department_id) : undefined,
          fk_shift_id:      form.fk_shift_id      ? Number(form.fk_shift_id)      : undefined,
        }),
      });
      toast.success('Employee updated');
      setIsEditOpen(false);
      setEditTarget(null);
      await loadEmployees();
    } catch (e) {
      toast.error('Update failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (emp: ApiEmployee) => {
    if (!window.confirm(`Deactivate ${emp.full_name}?`)) return;
    try {
      await apiRequest(`/employees/${emp.pk_employee_id}/deactivate`, {
        method: 'POST', accessToken, scopeHeaders,
      });
      toast.success('Employee deactivated', { description: `${emp.full_name} has been deactivated.` });
      await loadEmployees();
    } catch (e) {
      toast.error('Failed', { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleDelete = async (emp: ApiEmployee) => {
    if (!window.confirm(`Permanently delete ${emp.full_name}? This cannot be undone.`)) return;
    try {
      await apiRequest(`/employees/${emp.pk_employee_id}`, {
        method: 'DELETE', accessToken, scopeHeaders,
      });
      toast.success('Employee removed');
      await loadEmployees();
    } catch (e) {
      toast.error('Delete failed', { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const openEdit = (emp: ApiEmployee) => {
    setEditTarget(emp);
    setForm({
      employee_code:  emp.employee_code,
      full_name:      emp.full_name,
      email:          emp.email,
      position_title: emp.position_title,
      location_label: emp.location_label ?? '',
      join_date:      emp.join_date?.slice(0,10) ?? '',
      phone_number:   emp.phone_number ?? '',
      status:         emp.status,
      fk_department_id: emp.fk_department_id ? String(emp.fk_department_id) : '',
      fk_shift_id:    emp.fk_shift_id ? String(emp.fk_shift_id) : '',
    });
    setIsEditOpen(true);
  };

  const statusBadge = (s: string) => {
    if (s === 'active')    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (s === 'inactive')  return 'bg-red-100 text-red-700 border-red-200';
    if (s === 'on-leave')  return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-600';
  };

  const initials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);

  if (selectedEmployee) {
    return (
      <EmployeeProfileDashboard
        employee={selectedEmployee as any}
        onBack={() => setSelectedEmployee(null)}
      />
    );
  }

  // ── Employee form (reused for add/edit) ───────────────────────
  const EmployeeForm = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      {[
        { label: 'Full Name *',      key: 'full_name',      type: 'text',   placeholder: 'Alice Smith' },
        { label: 'Employee Code *',  key: 'employee_code',  type: 'text',   placeholder: 'EMP006' },
        { label: 'Work Email *',     key: 'email',          type: 'email',  placeholder: 'alice@company.com' },
        { label: 'Position / Title *', key: 'position_title', type: 'text', placeholder: 'Software Engineer' },
        { label: 'Location',         key: 'location_label', type: 'text',   placeholder: 'Building A' },
        { label: 'Phone',            key: 'phone_number',   type: 'tel',    placeholder: '+1 234-567-8900' },
        { label: 'Join Date',        key: 'join_date',      type: 'date',   placeholder: '' },
      ].map(f => (
        <div key={f.key}>
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
            {f.label}
          </Label>
          <Input
            type={f.type}
            placeholder={f.placeholder}
            value={(form as any)[f.key]}
            onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
          />
        </div>
      ))}
      <div>
        <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Status</Label>
        <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as any }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="on-leave">On Leave</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {departments.length > 0 && (
        <div>
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Department</Label>
          <Select value={form.fk_department_id} onValueChange={v => setForm(p => ({ ...p, fk_department_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
            <SelectContent>
              {departments.map(d => (
                <SelectItem key={d.pk_department_id} value={String(d.pk_department_id)}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {shifts.length > 0 && (
        <div>
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Shift</Label>
          <Select value={form.fk_shift_id} onValueChange={v => setForm(p => ({ ...p, fk_shift_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
            <SelectContent>
              {shifts.map(s => (
                <SelectItem key={s.pk_shift_id} value={String(s.pk_shift_id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={cn("text-xl font-bold", lightTheme.text.primary)}>Employee Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">{stats.total} employees · {stats.active} active</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadEmployees} disabled={isLoading} className="gap-1.5">
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
          <Dialog open={isAddOpen} onOpenChange={o => { setIsAddOpen(o); if (!o) setForm(EMPTY_FORM); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                <UserPlus className="w-4 h-4" /> Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Onboard New Employee</DialogTitle>
                <DialogDescription>Fill in the employee details. Fields marked * are required.</DialogDescription>
              </DialogHeader>
              <EmployeeForm />
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Onboard Employee
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: stats.total,    color: 'text-blue-600' },
          { label: 'Active', value: stats.active,  color: 'text-emerald-600' },
          { label: 'Inactive', value: stats.inactive, color: 'text-red-500' },
          { label: 'On Leave', value: stats.onLeave, color: 'text-amber-600' },
          { label: 'Face Enrolled', value: stats.enrolled, color: 'text-purple-600' },
        ].map(s => (
          <Card key={s.label} className={cn(lightTheme.background.card, lightTheme.border.default)}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-slate-500 font-medium">{s.label}</p>
              <p className={cn("text-2xl font-bold mt-1", s.color)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by name, email, code, department..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="on-leave">On Leave</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Employee Table */}
      <Card className={cn(lightTheme.background.card, lightTheme.border.default)}>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-slate-400 text-sm">Loading employees...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <AlertCircle className="w-6 h-6 text-red-400" />
              <span className="text-slate-400 text-sm">{error}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Users className="w-8 h-8 text-slate-400" />
              <p className="text-slate-400 text-sm">No employees found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    {['Employee', 'Code', 'Department', 'Position', 'Status', 'Face', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((emp, i) => (
                    <tr
                      key={emp.pk_employee_id}
                      className={cn("border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors",
                        i % 2 !== 0 && "bg-slate-50/30 dark:bg-slate-800/10"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                              {initials(emp.full_name || '?')}
                            </span>
                          </div>
                          <div>
                            <button
                              className="font-medium text-slate-900 dark:text-white hover:text-blue-600 transition-colors text-left"
                              onClick={() => setSelectedEmployee(emp)}
                            >
                              {emp.full_name}
                            </button>
                            <p className="text-xs text-slate-400">{emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500">{emp.employee_code}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{emp.department_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{emp.position_title}</td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", statusBadge(emp.status))}>
                          {emp.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border",
                          emp.face_enrolled
                            ? "bg-purple-100 text-purple-700 border-purple-200"
                            : "bg-slate-100 text-slate-400 border-slate-200"
                        )}>
                          {emp.face_enrolled ? '✓ Enrolled' : 'Not enrolled'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 px-2 text-xs text-blue-600 hover:bg-blue-50"
                            onClick={() => openEdit(emp)}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          {emp.status === 'active' ? (
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 px-2 text-xs text-amber-600 hover:bg-amber-50"
                              onClick={() => handleDeactivate(emp)}
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 px-2 text-xs text-red-600 hover:bg-red-50"
                              onClick={() => handleDelete(emp)}
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={o => { setIsEditOpen(o); if (!o) { setEditTarget(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Employee — {editTarget?.full_name}</DialogTitle>
            <DialogDescription>Update employee information in the system.</DialogDescription>
          </DialogHeader>
          <EmployeeForm />
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};
TSEOF
echo "  ✅ EmployeeLifecycleManagement.tsx rewritten"

# ══════════════════════════════════════════════════════════
# 3. Write Live Audit Log component for Admin
# ══════════════════════════════════════════════════════════
echo "[3/5] Writing LiveAuditLog component..."

cat > "$SRC/components/admin/LiveAuditLog.tsx" << 'TSEOF'
import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Loader2, RefreshCw, Search, Download, AlertCircle, Activity } from 'lucide-react';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useApiData } from '../../hooks/useApiData';

export const LiveAuditLog: React.FC = () => {
  const { alerts, isLoading, refresh, lastRefreshed } = useApiData({ autoRefreshMs: 15000 });
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const prevCountRef = useRef(0);
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    if (alerts.length > prevCountRef.current) {
      setNewCount(alerts.length - prevCountRef.current);
      setTimeout(() => setNewCount(0), 3000);
    }
    prevCountRef.current = alerts.length;
  }, [alerts.length]);

  const filtered = alerts.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      a.title?.toLowerCase().includes(q) ||
      a.message?.toLowerCase().includes(q) ||
      a.alert_type?.toLowerCase().includes(q);
    const matchSeverity = filterSeverity === 'all' || a.severity === filterSeverity;
    return matchSearch && matchSeverity;
  });

  const severityStyle = (s: string) => {
    if (s === 'critical') return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400';
    if (s === 'high')     return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400';
    if (s === 'medium')   return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400';
    return                       'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400';
  };

  const severityDot = (s: string) => {
    if (s === 'critical') return 'bg-red-500';
    if (s === 'high')     return 'bg-orange-500';
    if (s === 'medium')   return 'bg-amber-500';
    return                       'bg-slate-400';
  };

  const unread = alerts.filter(a => !a.is_read).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className={cn("text-xl font-bold", lightTheme.text.primary)}>Live Audit Log</h2>
            {unread > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                {unread} unread
              </span>
            )}
            {newCount > 0 && (
              <span className="text-xs text-emerald-600 font-semibold animate-pulse">
                +{newCount} new
              </span>
            )}
          </div>
          {lastRefreshed && (
            <p className="text-xs text-slate-500 mt-0.5">
              Live · {alerts.length} total events · Updated {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh()} disabled={isLoading} className="gap-1.5">
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(['critical', 'high', 'medium', 'low'] as const).map(s => {
          const count = alerts.filter(a => a.severity === s).length;
          return (
            <Card
              key={s}
              className={cn("cursor-pointer transition-all", lightTheme.background.card, lightTheme.border.default,
                filterSeverity === s && "ring-2 ring-blue-500"
              )}
              onClick={() => setFilterSeverity(prev => prev === s ? 'all' : s)}
            >
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", severityDot(s))} />
                <div>
                  <p className="text-xs text-slate-500 font-medium capitalize">{s}</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-white">{count}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search + filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search events..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {filterSeverity !== 'all' && (
          <Button variant="outline" size="sm" onClick={() => setFilterSeverity('all')} className="gap-1.5">
            Clear filter
          </Button>
        )}
      </div>

      {/* Events table */}
      <Card className={cn(lightTheme.background.card, lightTheme.border.default)}>
        <CardContent className="p-0">
          {isLoading && alerts.length === 0 ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-slate-400 text-sm">Loading audit events...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Activity className="w-8 h-8 text-slate-400" />
              <p className="text-slate-400 text-sm">No events match the current filter</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((event, i) => (
                <div
                  key={event.pk_alert_id}
                  className={cn(
                    "flex items-start gap-4 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30",
                    !event.is_read && "bg-blue-50/40 dark:bg-blue-900/10"
                  )}
                >
                  {/* Severity dot */}
                  <div className="mt-1.5 flex-shrink-0">
                    <span className={cn("w-2 h-2 rounded-full block", severityDot(event.severity))} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", severityStyle(event.severity))}>
                        {event.severity}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">{event.alert_type}</span>
                      {!event.is_read && (
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">NEW</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-white mt-1">{event.title}</p>
                    <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{event.message}</p>
                    {(event.employee_code || event.external_device_id) && (
                      <div className="flex items-center gap-3 mt-1.5">
                        {event.employee_code && (
                          <span className="text-xs text-slate-400">Employee: <span className="font-mono">{event.employee_code}</span></span>
                        )}
                        {event.external_device_id && (
                          <span className="text-xs text-slate-400">Device: <span className="font-mono">{event.external_device_id}</span></span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-slate-400 font-mono">
                      {new Date(event.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-slate-400 font-mono">
                      {new Date(event.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
TSEOF
echo "  ✅ LiveAuditLog.tsx written"

# ══════════════════════════════════════════════════════════
# 4. Update AdminDashboard — add Employee Management + Live Audit
# ══════════════════════════════════════════════════════════
echo "[4/5] Updating AdminDashboard with new tabs..."

cat > "$SRC/components/AdminDashboard.tsx" << 'TSEOF'
import React, { useEffect, useMemo, useState } from 'react';
import { Sidebar } from './shared/Sidebar';
import { MobileNav } from './shared/MobileNav';
import { MetricCard } from './shared/MetricCard';
import {
  Users, Monitor, Activity, FileText, Database,
  AlertCircle, Building2, ShieldCheck, Loader2, RefreshCw, UserPlus,
} from 'lucide-react';
import { UserManagement } from './admin/UserManagement';
import { SystemHealth } from './admin/SystemHealth';
import { OperationsConsole } from './admin/OperationsConsole';
import { AccuracyLogs } from './admin/AccuracyLogs';
import { LiveAuditLog } from './admin/LiveAuditLog';
import { LiveOfficeIntelligence } from './hr/LiveOfficeIntelligence';
import { EmployeeLifecycleManagement } from './hr/EmployeeLifecycleManagement';
import { Activity as ActivityIcon } from 'lucide-react';
import { lightTheme } from '../../theme/lightTheme';
import { cn } from './ui/utils';
import { useAuth } from '../contexts/AuthContext';
import { useApiData } from '../hooks/useApiData';
import { Button } from './ui/button';
import { toast } from 'sonner';

export const AdminDashboard: React.FC = () => {
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const { employees, devices, alerts, metrics, isLoading, refresh, lastRefreshed } = useApiData({ autoRefreshMs: 30000 });

  const navigationItems = [
    { label: 'Overview',                icon: Activity,      value: 'overview',         permission: 'devices.read'    as const },
    { label: 'Employee Management',     icon: UserPlus,      value: 'employees',        permission: 'users.read'      as const },
    { label: 'Users & Roles',           icon: Users,         value: 'users',            permission: 'users.read'      as const },
    { label: 'Operations Console',      icon: Building2,     value: 'operations',       permission: 'facility.manage' as const },
    { label: 'Live Office Intelligence',icon: ActivityIcon,  value: 'presence-monitor', permission: 'attendance.read' as const },
    { label: 'Accuracy',                icon: Database,      value: 'accuracy',         permission: 'devices.read'    as const },
    { label: 'Live Audit Log',          icon: FileText,      value: 'audit',            permission: 'audit.read'      as const },
  ];

  const visibleNavItems = useMemo(
    () => navigationItems.filter(i => !i.permission || can(i.permission)),
    [can]
  );

  useEffect(() => {
    if (!visibleNavItems.some(i => i.value === activeTab)) {
      setActiveTab(visibleNavItems[0]?.value ?? 'overview');
    }
  }, [activeTab, visibleNavItems]);

  const onlineDevices  = devices.filter(d => d.status === 'online').length;
  const offlineDevices = devices.filter(d => d.status === 'offline').length;
  const errorDevices   = devices.filter(d => d.status === 'error').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;
  const unreadAlerts   = alerts.filter(a => !a.is_read).length;
  const avgAccuracy    = devices.length > 0
    ? (devices.reduce((s, d) => s + (d.recognition_accuracy || 0), 0) / devices.length).toFixed(1)
    : '0';

  const mappedDevices = devices.map(d => ({
    id: d.external_device_id, name: d.name, type: 'Camera' as const,
    status: d.status === 'online' ? 'Online' : d.status === 'error' ? 'Warning' : 'Offline',
    location: d.location_label, assignedPoint: d.location_label,
    lastActive: d.last_active, ipAddress: d.ip_address,
    recognitionAccuracy: d.recognition_accuracy, totalScans: d.total_scans,
    errorRate: d.error_rate, model: d.model,
  }));

  const renderContent = () => {
    if (isLoading && devices.length === 0 && activeTab === 'overview') return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
        <span className="text-slate-400 text-sm">Loading live data...</span>
      </div>
    );
    switch (activeTab) {
      case 'overview':         return <SystemHealth devices={mappedDevices as any} alerts={alerts as any} />;
      case 'employees':        return <EmployeeLifecycleManagement />;
      case 'users':            return <UserManagement users={[]} employees={employees as any} />;
      case 'operations':       return <OperationsConsole />;
      case 'presence-monitor': return <LiveOfficeIntelligence role="admin" />;
      case 'accuracy':         return <AccuracyLogs devices={mappedDevices as any} />;
      case 'audit':            return <LiveAuditLog />;
      default:                 return null;
    }
  };

  return (
    <div className={cn("min-h-screen", lightTheme.background.primary, "dark:bg-background")}>
      <Sidebar
        title="Admin Dashboard"
        unreadAlerts={unreadAlerts}
        navigationItems={visibleNavItems}
        activeTab={activeTab}
        onNavigate={setActiveTab}
        liveAlerts={alerts}
      />
      <MobileNav
        title="Admin Dashboard"
        unreadAlerts={unreadAlerts}
        navigationItems={visibleNavItems}
        activeTab={activeTab}
        onNavigate={setActiveTab}
        liveAlerts={alerts}
      />
      <main className="md:ml-64 p-4 md:p-6 mt-16 md:mt-0">
        <div className="max-w-[1600px] mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className={cn("text-2xl font-bold", lightTheme.text.primary)}>Admin Dashboard</h1>
              {lastRefreshed && (
                <p className="text-xs text-slate-500 mt-0.5">Updated {lastRefreshed.toLocaleTimeString()}</p>
              )}
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => { refresh(); toast.success('Refreshed'); }}
              disabled={isLoading}
              className="gap-1.5"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </Button>
          </div>

          {/* KPI cards — only on overview */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <MetricCard title="Total Devices"   value={String(devices.length)}  icon={Monitor}     trend={`${onlineDevices} online`}    trendUp={onlineDevices > 0} />
              <MetricCard title="Online"          value={String(onlineDevices)}    icon={Activity}    trend={offlineDevices > 0 ? `${offlineDevices} offline` : 'All healthy'} trendUp={offlineDevices === 0} />
              <MetricCard title="Critical Alerts" value={String(criticalAlerts)}   icon={AlertCircle} trend={`${unreadAlerts} unread`}      trendUp={criticalAlerts === 0} />
              <MetricCard title="Avg Accuracy"    value={`${avgAccuracy}%`}        icon={ShieldCheck} trend={errorDevices > 0 ? `${errorDevices} error` : 'Nominal'} trendUp={errorDevices === 0} />
            </div>
          )}

          {renderContent()}
        </div>
      </main>
    </div>
  );
};
TSEOF
echo "  ✅ AdminDashboard.tsx updated"

# ══════════════════════════════════════════════════════════
# 5. Rebuild frontend
# ══════════════════════════════════════════════════════════
echo ""
echo "[5/5] Rebuilding frontend container..."

docker compose build frontend 2>&1 | grep -E "FINISHED|ERROR|error" | head -10
docker compose up -d frontend

echo ""
echo "  Waiting for frontend to start..."
sleep 12

STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://172.20.100.222:5173 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  echo "  ✅ Frontend is up"
else
  echo "  ⚠️  HTTP $STATUS — run: docker compose logs --tail=40 frontend"
fi

echo ""
echo "=================================================="
echo " ✅ All done!"
echo "=================================================="
echo ""
echo "Changes deployed:"
echo "  HR Dashboard:"
echo "    • Employee Lifecycle → Employee Management (full CRUD from DB)"
echo "    • AI Insights tab removed"
echo "    • White screen crash fixed (field name mismatch emp.name vs full_name)"
echo ""
echo "  Admin Dashboard:"  
echo "    • Employee Management tab added (same full CRUD)"
echo "    • Audit Logs → Live Audit Log (real system_alert rows, live refresh)"
echo "    • All mock data removed"
echo ""
echo "  Hard refresh browser: Ctrl+Shift+R"
echo "  Open: http://172.20.100.222:5173"
echo ""