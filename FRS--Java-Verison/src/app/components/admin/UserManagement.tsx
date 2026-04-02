import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { User, Employee } from '../../types';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/http/apiClient';
import { Users, UserPlus, Edit, Trash2, Shield, Search, UserCheck, Clock, UserCog, Building2 } from 'lucide-react';

const ModernStatCard = ({ title, value, icon: Icon, description, colorClass, bgClass }: any) => (
  <Card className={cn("border-none shadow-sm overflow-hidden", bgClass)}>
    <CardContent className="p-6">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500/70 mb-1">{title}</p>
          <h2 className="text-3xl font-black text-slate-800 tracking-tighter">{value}</h2>
        </div>
        <div className={cn("p-2.5 rounded-xl bg-white/60 backdrop-blur-sm shadow-sm", colorClass)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-[10px] font-bold text-slate-400 mt-4 uppercase tracking-tight">{description}</p>
    </CardContent>
  </Card>
);

export const UserManagement: React.FC<{ users: User[], employees: Employee[] }> = ({ users, employees }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', role: 'hr' as 'admin' | 'hr', department: '' });
  const { accessToken } = useAuth();
  const [localUsers, setLocalUsers] = useState<User[]>(users);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    apiRequest<any>('/users', { accessToken }).then(res => {
      const data = res?.data ?? res ?? [];
      if (Array.isArray(data)) {
        setLocalUsers(data.map((u: any) => ({
          id: String(u.pk_user_id || u.id),
          name: u.username || u.name || u.email,
          email: u.email,
          role: u.role,
          department: u.department === 'Human Resource' ? 'Human Resources' : (u.department || 'IT'),
          createdAt: new Date(u.created_at || Date.now()),
        })));
      }
    }).catch(() => {});
  }, [accessToken]);

  // CALCULATION LOGIC
  const enrolledCount = employees.filter(e => (e as any).is_face_registered || (e as any).face_id || (e as any).face_enrolled === true).length;
  const pendingCount = employees.length - enrolledCount;

  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error("Required fields missing");
      return;
    }
    setIsSaving(true);
    try {
      const res = await apiRequest<any>('/users', {
        method: 'POST', accessToken,
        body: JSON.stringify({ email: newUser.email, username: newUser.name, password: newUser.password, role: newUser.role, department: newUser.department }),
      });
      setLocalUsers(prev => [{ id: String(res.pk_user_id || res.id), name: res.username || newUser.name, email: res.email, role: res.role, department: res.department, createdAt: new Date() } as User, ...prev]);
      toast.success("User Created");
      setIsCreateDialogOpen(false);
      setNewUser({ email: '', password: '', name: '', role: 'hr', department: '' });
    } catch (e: any) { toast.error("Failed to create user"); }
    finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-6">
      {/* HEADER CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ModernStatCard 
          title="Administrative Users" value={localUsers.length} icon={UserCog} colorClass="text-blue-600" 
          bgClass="bg-gradient-to-br from-blue-50 to-white" description="Platform access accounts" 
        />
        <ModernStatCard 
          title="Registered Employees" value={enrolledCount} icon={UserCheck} colorClass="text-emerald-600" 
          bgClass="bg-gradient-to-br from-emerald-50 to-white" description="Biometrics Enrolled" 
        />
        <ModernStatCard 
          title="Pending Enrollment" value={pendingCount} icon={Clock} colorClass="text-amber-600" 
          bgClass="bg-gradient-to-br from-amber-50 to-white" description="Awaiting Face Scan" 
        />
      </div>

      {/* USER TABLE */}
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 py-4">
          <div>
            <CardTitle className="text-lg font-black text-slate-800 tracking-tight">System Users</CardTitle>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Manage platform access</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild><Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 rounded-xl"><UserPlus className="w-4 h-4 mr-2" />Create User</Button></DialogTrigger>
            <DialogContent className="rounded-2xl border-none">
              <DialogHeader><DialogTitle className="font-black text-xl">Create User Account</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Full Name</Label><Input value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="rounded-xl border-slate-100" /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Department</Label><Input value={newUser.department} onChange={e => setNewUser({...newUser, department: e.target.value})} className="rounded-xl border-slate-100" /></div>
                </div>
                <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Email Address</Label><Input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="rounded-xl border-slate-100" /></div>
                <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Initial Password</Label><Input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="rounded-xl border-slate-100" /></div>
                <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">System Role</Label>
                  <Select value={newUser.role} onValueChange={(v: any) => setNewUser({...newUser, role: v})}>
                    <SelectTrigger className="rounded-xl border-slate-100"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl"><SelectItem value="hr">HR Personnel</SelectItem><SelectItem value="admin">Administrator</SelectItem></SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreateUser} className="w-full bg-blue-600 rounded-xl font-bold mt-2" disabled={isSaving}>Register Account</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-none">
                <TableHead className="text-[10px] font-black uppercase text-slate-400 pl-6">Profile</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-slate-400">Access Role</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-slate-400">Department</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-slate-400">Joined</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase text-slate-400 pr-6">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {localUsers.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase())).map(user => (
                <TableRow key={user.id} className="border-slate-50 hover:bg-slate-50/30 transition-colors">
                  <TableCell className="pl-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-700 text-sm">{user.name}</span>
                      <span className="text-[11px] text-slate-400 font-medium">{user.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("rounded-lg px-2 py-0.5 text-[10px] font-bold border-none capitalize", user.role === 'admin' ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600")}>
                      <Shield className="w-3 h-3 mr-1.5 opacity-60" /> {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-bold text-slate-500 uppercase tracking-tight">{user.department || '—'}</TableCell>
                  <TableCell className="text-xs text-slate-400 font-mono">{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right pr-6 py-4">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 rounded-lg"><Edit className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
