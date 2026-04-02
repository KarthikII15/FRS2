import { useDepartmentsAndShifts } from '../../hooks/useDepartmentsAndShifts';
import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { 
  UserPlus, UserMinus, Users, ScanFace, Search, Upload, Camera, 
  Edit, UserX, Mail, Phone, Loader2, RefreshCw, AlertCircle, 
  CheckCircle2, XCircle, CalendarDays, MoreHorizontal
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { EmployeeProfileDashboard } from './EmployeeProfileDashboard';
import { BulkImportModal } from './BulkImportModal';
import { BulkFaceEnrollModal } from './BulkFaceEnrollModal';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';

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
  shift_name?: string;
  face_enrolled?: boolean;
  phone_number?: string;
  fk_department_id?: number;
  fk_shift_id?: number;
}

const ModernStatCard = ({ title, value, icon: Icon, description, colorClass, bgClass }: any) => (
  <Card className={cn("border-none shadow-sm overflow-hidden transition-all hover:shadow-md", bgClass)}>
    <CardContent className="p-5">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500/70 mb-1">{title}</p>
          <h2 className="text-2xl font-black text-slate-800 tracking-tighter">{value}</h2>
        </div>
        <div className={cn("p-2 rounded-xl bg-white/60 backdrop-blur-sm shadow-sm", colorClass)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-[9px] font-bold text-slate-400 mt-3 uppercase tracking-tight">{description}</p>
    </CardContent>
  </Card>
);

export const EmployeeLifecycleManagement: React.FC = () => {
  const { departments = [], shifts = [] } = useDepartmentsAndShifts();
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiEmployee | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<ApiEmployee | null>(null);

  const [form, setForm] = useState({
    employee_code: '', full_name: '', email: '', position_title: '',
    location_label: '', join_date: new Date().toISOString().slice(0, 10),
    phone_number: '', status: 'active', fk_department_id: '', fk_shift_id: '',
  });

  const loadEmployees = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await apiRequest<{ data: ApiEmployee[] }>('/employees', { accessToken, scopeHeaders });
      setEmployees(res.data ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { loadEmployees(); }, [accessToken]);

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter(e => e.status === 'active').length,
    inactive: employees.filter(e => e.status === 'inactive').length,
    onLeave: employees.filter(e => e.status === 'on-leave').length,
    enrolled: employees.filter(e => e.face_enrolled).length,
  }), [employees]);

  const filtered = employees.filter(e => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q || e.full_name?.toLowerCase().includes(q) || e.employee_code?.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || e.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleAdd = async () => {
    setSaving(true);
    try {
      await apiRequest('/employees', {
        method: 'POST', accessToken, scopeHeaders,
        body: JSON.stringify({ ...form, fk_department_id: Number(form.fk_department_id), fk_shift_id: Number(form.fk_shift_id) }),
      });
      toast.success('Employee onboarded');
      setIsAddOpen(false);
      loadEmployees();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  if (selectedEmployee) return <EmployeeProfileDashboard canEnroll={true} employee={selectedEmployee as any} onBack={() => setSelectedEmployee(null)} />;

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Workforce Management</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Full Employee Lifecycle & Biometrics</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBulkImport(true)} className="rounded-xl font-bold"><Upload className="w-3.5 h-3.5 mr-2" />Import</Button>
          <Button variant="outline" size="sm" onClick={() => setShowFaceEnroll(true)} className="rounded-xl font-bold border-violet-200 text-violet-600 hover:bg-violet-50"><Camera className="w-3.5 h-3.5 mr-2" />Face Enroll</Button>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild><Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl"><UserPlus className="w-3.5 h-3.5 mr-2" />Add Employee</Button></DialogTrigger>
            <DialogContent className="max-w-2xl rounded-2xl border-none">
              <DialogHeader><DialogTitle className="font-black text-xl">Onboard New Talent</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-400">Full Name</Label><Input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} className="rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-400">Employee ID</Label><Input value={form.employee_code} onChange={e => setForm({...form, employee_code: e.target.value})} className="rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-400">Email Address</Label><Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-400">Title</Label><Input value={form.position_title} onChange={e => setForm({...form, position_title: e.target.value})} className="rounded-xl" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-400">Department</Label>
                  <Select value={form.fk_department_id} onValueChange={v => setForm({...form, fk_department_id: v})}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{departments.map(d => <SelectItem key={d.pk_department_id} value={String(d.pk_department_id)}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-slate-400">Shift Assignment</Label>
                  <Select value={form.fk_shift_id} onValueChange={v => setForm({...form, fk_shift_id: v})}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{shifts.map(s => <SelectItem key={s.pk_shift_id} value={String(s.pk_shift_id)}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleAdd} className="w-full bg-blue-600 font-bold rounded-xl py-6 mt-2" disabled={saving}>{saving ? <Loader2 className="animate-spin mr-2" /> : "Complete Onboarding"}</Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* THEMED KPI GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <ModernStatCard title="Total Headcount" value={stats.total} icon={Users} bgClass="bg-gradient-to-br from-slate-50 to-white" colorClass="text-slate-600" description="System database" />
        <ModernStatCard title="Currently Active" value={stats.active} icon={CheckCircle2} bgClass="bg-gradient-to-br from-emerald-50 to-white" colorClass="text-emerald-600" description="Presence authorized" />
        <ModernStatCard title="Inactive/Exited" value={stats.inactive} icon={UserX} bgClass="bg-gradient-to-br from-rose-50 to-white" colorClass="text-rose-600" description="Access revoked" />
        <ModernStatCard title="On Leave" value={stats.onLeave} icon={CalendarDays} bgClass="bg-gradient-to-br from-amber-50 to-white" colorClass="text-amber-600" description="Temporary absence" />
        <ModernStatCard title="Face Enrolled" value={stats.enrolled} icon={ScanFace} bgClass="bg-gradient-to-br from-violet-50 to-white" colorClass="text-violet-600" description="Ready for recognition" />
      </div>

      {/* CONTROLS */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search name, email, or code..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 rounded-xl border-slate-100 shadow-sm" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44 rounded-xl border-slate-100 shadow-sm font-bold text-slate-600"><SelectValue /></SelectTrigger>
          <SelectContent className="rounded-xl"><SelectItem value="all">All Statuses</SelectItem><SelectItem value="active">Active Only</SelectItem><SelectItem value="on-leave">On Leave</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
        </Select>
      </div>

      {/* MODERN TABLE */}
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardContent className="p-0">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50">
              <tr className="border-none">
                {['Employee Details', 'Code', 'Department', 'Status', 'Biometrics', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(emp => (
                <tr key={emp.pk_employee_id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs shadow-sm">
                        {emp.full_name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                      </div>
                      <div className="flex flex-col">
                        <button onClick={() => setSelectedEmployee(emp)} className="text-sm font-black text-slate-800 hover:text-blue-600 transition-colors text-left">{emp.full_name}</button>
                        <span className="text-[10px] font-medium text-slate-400 truncate max-w-[150px]">{emp.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-500 font-mono tracking-tighter">{emp.employee_code}</td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{emp.department_name || 'General'}</td>
                  <td className="px-6 py-4">
                    <Badge className={cn("rounded-lg border-none px-2.5 py-0.5 text-[9px] font-black uppercase", 
                      emp.status === 'active' ? "bg-emerald-50 text-emerald-600" : emp.status === 'on-leave' ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                    )}>{emp.status}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full shadow-sm", emp.face_enrolled ? "bg-violet-500 animate-pulse" : "bg-slate-200")} />
                      <span className={cn("text-[10px] font-black uppercase", emp.face_enrolled ? "text-violet-600" : "text-slate-300")}>
                        {emp.face_enrolled ? "Enrolled" : "Pending"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600"><Edit className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600"><UserMinus className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="py-20 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">No matching personnel records found</div>}
        </CardContent>
      </Card>

      {/* MODALS */}
      {showFaceEnroll && <BulkFaceEnrollModal onClose={() => setShowFaceEnroll(false)} onSuccess={() => { setShowFaceEnroll(false); loadEmployees(); }} />}
      {showBulkImport && <BulkImportModal onClose={() => setShowBulkImport(false)} onSuccess={() => { setShowBulkImport(false); loadEmployees(); }} />}
    </div>
  );
};
