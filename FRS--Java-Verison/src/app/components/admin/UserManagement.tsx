import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { MetricCard } from '../shared/MetricCard';
import { User, Employee, UserRole } from '../../types';
import { UserCheck, Clock, UserCog, Search, Edit, Trash2, Shield, UserPlus, KeyRound } from 'lucide-react';

interface ExtendedUser extends User {
  last_login?: string;
}

export const UserManagement: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExtendedUser | null>(null);
  const [editForm, setEditForm] = useState({ name: '', role: 'hr' as 'admin' | 'hr' | 'viewer', department: '' });
  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', role: 'hr' as 'admin' | 'hr' | 'viewer', department: '' });
  const [localUsers, setLocalUsers] = useState<ExtendedUser[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<{pk_department_id: number; name: string}[]>([]);
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong'>('weak');
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<ExtendedUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetStrength, setResetStrength] = useState<'weak' | 'medium' | 'strong'>('weak');
  const [isSaving, setIsSaving] = useState(false);
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();

  // Password strength
  useEffect(() => {
    const pwd = newUser.password;
    if (pwd.length < 6) setPasswordStrength('weak');
    else if (pwd.length < 12 || !/[A-Z]/.test(pwd) || !/[0-9]/.test(pwd)) setPasswordStrength('medium');
    else setPasswordStrength('strong');
  }, [newUser.password]);

  // Fetch users
  useEffect(() => {
    if (!accessToken) return;
    apiRequest<any>('/users', { accessToken, scopeHeaders }).then(res => {
      const data = res?.data ?? res ?? [];
      if (Array.isArray(data)) {
        setLocalUsers(data.map((u: any) => ({
          id: String(u.pk_user_id || u.id),
          name: u.username || u.name || u.email,
          email: u.email,
          role: u.role as 'admin' | 'hr' | 'viewer',
          department: u.department === 'Human Resource' ? 'Human Resources' : (u.department || 'IT'),
          createdAt: new Date(u.created_at || Date.now()),
          last_login: u.last_login,
          password: '',
        } as ExtendedUser)));
      }
    }).catch(() => {});
  }, [accessToken, scopeHeaders]);

  // Fetch employees for KPI
  useEffect(() => {
    if (!accessToken) return;
    apiRequest<{data: Employee[]}>('/live/employees', { accessToken, scopeHeaders }).then(res => {
      setEmployees(res.data || []);
    }).catch(() => setEmployees([]));
  }, [accessToken, scopeHeaders]);

  // Fetch departments
  useEffect(() => {
    if (!accessToken) return;
    apiRequest<{data: {pk_department_id: number; name: string}[]}>('/hr/departments', { accessToken, scopeHeaders }).then(res => {
      setDepartments(res.data || []);
    }).catch(() => setDepartments([]));
  }, [accessToken, scopeHeaders]);

  const enrolledCount = employees.filter((e: any) => e.face_enrolled === true).length;
  const pendingCount = employees.length - enrolledCount;

  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error("Required fields missing");
      return;
    }
    setIsSaving(true);
    try {
      const res = await apiRequest<any>('/users', {
        method: 'POST',
        accessToken,
        scopeHeaders,
        body: JSON.stringify({ email: newUser.email, username: newUser.name, password: newUser.password, role: newUser.role, department: newUser.department }),
      });
          setLocalUsers(prev => [{
        id: String(res.pk_user_id || res.id),
        name: res.username || newUser.name,
        email: res.email,
        role: res.role as 'admin' | 'hr' | 'viewer',
        department: res.department,
        createdAt: new Date(),
        last_login: undefined,
        password: '',
      } as ExtendedUser, ...prev]);
      toast.success("User Created");
      setIsCreateDialogOpen(false);
      setNewUser({ email: '', password: '', name: '', role: 'hr', department: '' });
    } catch (e: any) {
      toast.error("Failed to create user");
    } finally {
      setIsSaving(false);
    }
  };

  const strengthOf = (pwd: string): 'weak' | 'medium' | 'strong' =>
    pwd.length < 6 ? 'weak' : (pwd.length < 12 || !/[A-Z]/.test(pwd) || !/[0-9]/.test(pwd)) ? 'medium' : 'strong';

  const openResetPassword = (user: ExtendedUser) => {
    setResetTarget(user);
    setResetPassword('');
    setResetStrength('weak');
    setIsResetPasswordOpen(true);
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !resetPassword) return;
    if (resetStrength === 'weak') { toast.error('Password too weak'); return; }
    setIsSaving(true);
    try {
      await apiRequest(`/users/${resetTarget.id}/password`, {
        method: 'PUT', accessToken, scopeHeaders,
        body: JSON.stringify({ password: resetPassword }),
      });
      toast.success(`Password reset for ${resetTarget.name}`);
      setIsResetPasswordOpen(false);
    } catch {
      toast.error('Password reset failed');
    } finally { setIsSaving(false); }
  };

  const openEditUser = (user: ExtendedUser) => {
    setEditTarget(user);
    setEditForm({ name: user.name, role: user.role as 'admin' | 'hr' | 'viewer', department: user.department || '' });
    setIsEditDialogOpen(true);
  };

  const handleEditUser = async () => {
    if (!editTarget) return;
    setIsSaving(true);
    try {
      await apiRequest(`/users/${editTarget.id}`, {
        method: 'PUT', accessToken, scopeHeaders,
        body: JSON.stringify({ username: editForm.name, role: editForm.role, department: editForm.department }),
      });
      setLocalUsers(prev => prev.map(u => u.id === editTarget.id
        ? { ...u, name: editForm.name, role: editForm.role as UserRole, department: editForm.department }
        : u
      ));
      toast.success('User updated');
      setIsEditDialogOpen(false);
    } catch {
      toast.error('Failed to update user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    try {
      await apiRequest(`/users/${userId}`, { method: 'DELETE', accessToken, scopeHeaders });
      setLocalUsers(prev => prev.filter(u => u.id !== userId));
      toast.success(`Deleted ${userName}`);
    } catch (e) {
      toast.error("Failed to delete user");
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard title="Administrative Users" value={localUsers.length} icon={UserCog} description="Platform access accounts" colorClass="text-blue-500" />
        <MetricCard title="Registered Employees" value={enrolledCount} icon={UserCheck} description="Biometrics Enrolled" colorClass="text-emerald-500" />
        <MetricCard title="Pending Enrollment" value={pendingCount} icon={Clock} description="Awaiting Face Scan" colorClass="text-amber-500" />
      </div>

      {/* Users Table */}
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 py-4 pb-6">
          <div>
            <CardTitle className="text-lg font-black text-slate-800 tracking-tight">System Users</CardTitle>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Manage platform access</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search users..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 h-10 rounded-xl border-slate-200 w-[280px] bg-slate-50 shadow-sm"
              />
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 rounded-xl h-10 shadow-sm">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Create User
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl border-none max-w-md p-0">
                <DialogHeader className="p-6 border-b">
                  <DialogTitle className="font-black text-xl">Create User Account</DialogTitle>
                </DialogHeader>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Full Name</Label>
                      <Input value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="rounded-xl h-11 border-slate-200" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Department</Label>
                      <Select value={newUser.department} onValueChange={(v) => setNewUser({...newUser, department: v})}>
                        <SelectTrigger className="rounded-xl h-11 border-slate-200">
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map(d => (
                            <SelectItem key={d.pk_department_id} value={d.name}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Email Address</Label>
                    <Input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="rounded-xl h-11 border-slate-200" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Initial Password</Label>
                    <div>
                      <Input 
                        type="password" 
                        value={newUser.password} 
                        onChange={e => setNewUser({...newUser, password: e.target.value})} 
                        className={cn("rounded-xl h-11 border pr-12", {
                          'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200': passwordStrength === 'strong',
                          'border-amber-300 bg-amber-50 ring-1 ring-amber-200': passwordStrength === 'medium',
                          'border-rose-300 bg-rose-50 ring-1 ring-rose-200': passwordStrength === 'weak',
                        })} 
                      />
                      <div className="flex gap-1 mt-2 h-1">
                        <div className={cn("flex-1 h-full rounded-full transition-all", {
                          'bg-emerald-500': passwordStrength === 'strong',
                        })} />
                        <div className={cn("flex-1 h-full rounded-full transition-all", {
                          'bg-amber-500': passwordStrength === 'medium',
                        })} />
                        <div className={cn("flex-1 h-full rounded-full transition-all", {
                          'bg-rose-500': passwordStrength === 'weak',
                        })} />
                      </div>
                      <span className={cn("text-[10px] font-bold uppercase tracking-wider mt-1 block", {
                        'text-emerald-600': passwordStrength === 'strong',
                        'text-amber-600': passwordStrength === 'medium',
                        'text-rose-600': passwordStrength === 'weak',
                      })}>{passwordStrength.toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">System Role</Label>
                    <Select value={newUser.role} onValueChange={(v: any) => setNewUser({...newUser, role: v})}>
                      <SelectTrigger className="rounded-xl h-11 border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hr">HR Personnel</SelectItem>
                        <SelectItem value="admin">Administrator</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreateUser} className="w-full bg-blue-600 hover:bg-blue-700 rounded-xl h-11 font-bold" disabled={isSaving}>
                    Register Account
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-200">
                <TableHead className="pl-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Profile</TableHead>
                <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wide">Role</TableHead>
                <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wide">Department</TableHead>
                <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wide">Joined</TableHead>
                <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wide">Last Login</TableHead>
                <TableHead className="text-right pr-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {localUsers.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase())).map(user => (
                <TableRow key={user.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <TableCell className="pl-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg">
                        <span className="text-xs font-bold text-white uppercase tracking-wide">
                          {user.name.split(' ').map((n: string) => n[0]).join('').slice(0,2) || 'U'}
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-slate-900">{user.name}</div>
                        <div className="text-xs text-slate-500">{user.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn(
                      "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border-none",
                      user.role === 'admin' && 'bg-blue-100 text-blue-800',
                      user.role === 'hr' && 'bg-emerald-100 text-emerald-800',
                      true && 'bg-slate-100 text-slate-800'
                    )}>
                      <Shield className="w-3 h-3 mr-1 inline opacity-70" />
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-medium text-slate-700 uppercase tracking-wide">{user.department || '—'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono text-slate-500">{new Date(user.createdAt).toLocaleDateString()}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono text-slate-500">
                      {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right pr-6 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-amber-50 rounded-lg text-slate-500 hover:text-amber-600 transition-colors" title="Reset password" onClick={() => openResetPassword(user)}>
                        <KeyRound className="h-4 w-4" />
                        <span className="sr-only">Reset Password</span>
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors" onClick={() => openEditUser(user)}>
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-rose-50 rounded-lg text-slate-500 hover:text-rose-600 transition-colors">
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete <strong>{user.name}</strong> and remove their access.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => handleDeleteUser(user.id, user.name)}>
                              Delete User
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {/* RESET PASSWORD DIALOG */}
      <Dialog open={isResetPasswordOpen} onOpenChange={setIsResetPasswordOpen}>
        <DialogContent className="rounded-2xl border-none max-w-sm p-0">
          <DialogHeader className="p-6 border-b">
            <DialogTitle className="font-black text-xl">Reset Password</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 mt-1">{resetTarget?.name} · {resetTarget?.email}</DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">New Password</Label>
              <Input
                type="password"
                value={resetPassword}
                onChange={e => { setResetPassword(e.target.value); setResetStrength(strengthOf(e.target.value)); }}
                className={cn('rounded-xl h-11 border', {
                  'border-emerald-300 bg-emerald-50': resetStrength === 'strong',
                  'border-amber-300 bg-amber-50': resetStrength === 'medium',
                  'border-rose-300 bg-rose-50': resetStrength === 'weak' && resetPassword.length > 0,
                })}
                placeholder="Enter new password…"
              />
              {resetPassword.length > 0 && (
                <span className={cn('text-[10px] font-bold uppercase tracking-wider', {
                  'text-emerald-600': resetStrength === 'strong',
                  'text-amber-600': resetStrength === 'medium',
                  'text-rose-600': resetStrength === 'weak',
                })}>{resetStrength} password</span>
              )}
            </div>
            <Button onClick={handleResetPassword} className="w-full bg-amber-500 hover:bg-amber-600 rounded-xl h-11 font-bold text-white" disabled={isSaving || !resetPassword}>
              Reset Password
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT USER DIALOG */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="rounded-2xl border-none max-w-md p-0">
          <DialogHeader className="p-6 border-b">
            <DialogTitle className="font-black text-xl">Edit User Account</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 mt-1">{editTarget?.email}</DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Full Name</Label>
              <Input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="rounded-xl h-11 border-slate-200" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Department</Label>
              <Select value={editForm.department} onValueChange={v => setEditForm({...editForm, department: v})}>
                <SelectTrigger className="rounded-xl h-11 border-slate-200"><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => <SelectItem key={d.pk_department_id} value={d.name}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">System Role</Label>
              <Select value={editForm.role} onValueChange={(v: any) => setEditForm({...editForm, role: v})}>
                <SelectTrigger className="rounded-xl h-11 border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hr">HR Personnel</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleEditUser} className="w-full bg-blue-600 hover:bg-blue-700 rounded-xl h-11 font-bold" disabled={isSaving}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

