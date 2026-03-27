import { useDepartmentsAndShifts } from '../../hooks/useDepartmentsAndShifts';
import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  UserPlus, UserMinus, Users, ScanFace, Search, Upload, Camera,
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
import { BulkImportModal } from './BulkImportModal';
import { BulkFaceEnrollModal } from './BulkFaceEnrollModal';
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
  const { departments = [], shifts = [] } = useDepartmentsAndShifts();
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isAddOpen, setIsAddOpen]   = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiEmployee | null>(null);
  const [form, setForm]             = useState<NewEmployeeForm>(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<ApiEmployee | null>(null);


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

  useEffect(() => {
    loadEmployees();
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
      <EmployeeProfileDashboard canEnroll={true}
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
                <SelectItem key={s.pk_shift_id || (s as any).id} value={String(s.pk_shift_id || (s as any).id)}>{s.name}</SelectItem>
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
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowBulkImport(true)}>
              <Upload className="w-4 h-4" /> Bulk Import
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10" onClick={() => setShowFaceEnroll(true)}>
              <Camera className="w-4 h-4" /> Bulk Face Enroll
            </Button>
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      {[
        { label: 'Full Name *',        key: 'full_name',      type: 'text',  placeholder: 'Alice Smith' },
        { label: 'Employee Code *',    key: 'employee_code',  type: 'text',  placeholder: 'EMP006' },
        { label: 'Work Email *',       key: 'email',          type: 'email', placeholder: 'alice@company.com' },
        { label: 'Position / Title *', key: 'position_title', type: 'text',  placeholder: 'Software Engineer' },
        { label: 'Location',           key: 'location_label', type: 'text',  placeholder: 'Building A' },
        { label: 'Phone',              key: 'phone_number',   type: 'tel',   placeholder: '+1 234-567-8900' },
        { label: 'Join Date',          key: 'join_date',      type: 'date',  placeholder: '' },
      ].map(f => (
        <div key={f.key}>
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">{f.label}</Label>
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
                <SelectItem key={s.pk_shift_id || (s as any).id} value={String(s.pk_shift_id || (s as any).id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      {[
        { label: 'Full Name *',        key: 'full_name',      type: 'text',  placeholder: 'Alice Smith' },
        { label: 'Employee Code *',    key: 'employee_code',  type: 'text',  placeholder: 'EMP006' },
        { label: 'Work Email *',       key: 'email',          type: 'email', placeholder: 'alice@company.com' },
        { label: 'Position / Title *', key: 'position_title', type: 'text',  placeholder: 'Software Engineer' },
        { label: 'Location',           key: 'location_label', type: 'text',  placeholder: 'Building A' },
        { label: 'Phone',              key: 'phone_number',   type: 'tel',   placeholder: '+1 234-567-8900' },
        { label: 'Join Date',          key: 'join_date',      type: 'date',  placeholder: '' },
      ].map(f => (
        <div key={f.key}>
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">{f.label}</Label>
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
                <SelectItem key={s.pk_shift_id || (s as any).id} value={String(s.pk_shift_id || (s as any).id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {showFaceEnroll && (
        <BulkFaceEnrollModal
          onClose={() => setShowFaceEnroll(false)}
          onSuccess={() => { setShowFaceEnroll(false); loadEmployees(); }}
        />
      )}
      {showBulkImport && (
        <BulkImportModal
          onClose={() => setShowBulkImport(false)}
          onSuccess={() => { setShowBulkImport(false); loadEmployees(); }}
        />
      )}
    </div>
  );
};
