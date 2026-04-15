import React, { useState, useEffect, useMemo } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '../ui/dialog';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../ui/table';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { 
  Shield, 
  Search, 
  X, 
  Plus, 
  Building2, 
  Users2, 
  ShieldCheck, 
  ChevronDown, 
  ChevronUp,
  Briefcase,
  ExternalLink,
  Info
} from 'lucide-react';
import { apiRequest } from '../../services/http/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { 
  RbacUser, 
  RbacRoleDefinition, 
  RbacSiteOption, 
  RbacRoleAssignment,
  RbacRoleName,
  Permission
} from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: RoleBadge
// ─────────────────────────────────────────────────────────────────────────────

interface RoleBadgeProps {
  roleName: RbacRoleName;
  displayName: string;
  siteName?: string | null;
  onRevoke?: () => void;
  canManage?: boolean;
}

const RoleBadge: React.FC<RoleBadgeProps> = ({ roleName, displayName, siteName, onRevoke, canManage }) => {
  const getColors = () => {
    switch (roleName) {
      case 'super_admin':
        return 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200';
      case 'site_admin':
        return 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200';
      case 'hr_manager':
        return 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const label = roleName === 'hr_manager' && !siteName 
    ? `${displayName} (All Sites)` 
    : siteName 
      ? `${displayName} · ${siteName}` 
      : displayName;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "px-2.5 py-1 rounded-lg text-xs font-bold transition-colors gap-1.5 flex-shrink-0 border",
        getColors()
      )}
    >
      <Shield className="w-3 h-3 opacity-70" />
      <span>{label}</span>
      {onRevoke && canManage && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onRevoke();
          }}
          className="ml-1 hover:bg-black/10 rounded-full p-0.5 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </Badge>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: AssignRoleModal
// ─────────────────────────────────────────────────────────────────────────────

interface AssignRoleModalProps {
  userId: number | null;
  userName: string | null;
  isOpen: boolean;
  onClose: () => void;
  onAssigned: () => void;
  roles: RbacRoleDefinition[];
  sites: RbacSiteOption[];
}

const AssignRoleModal: React.FC<AssignRoleModalProps> = ({ 
  userId, 
  userName, 
  isOpen, 
  onClose, 
  onAssigned, 
  roles, 
  sites 
}) => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  
  const [selectedRoleName, setSelectedRoleName] = useState<RbacRoleName | ''>('');
  const [selectedSiteId, setSelectedSiteId] = useState<string>('all');
  const [scopeChoice, setScopeChoice] = useState<'global' | 'site'>('global');
  const [isAssigning, setIsAssigning] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);

  const selectedRole = roles.find(r => r.roleName === selectedRoleName);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setSelectedRoleName('');
      setSelectedSiteId('all');
      setScopeChoice('global');
      setShowPermissions(false);
    }
  }, [isOpen]);

  const handleAssign = async () => {
    if (!userId || !selectedRoleName) return;

    setIsAssigning(true);
    try {
      const siteId = selectedRoleName === 'super_admin' 
        ? null 
        : (selectedRoleName === 'site_admin' || (selectedRoleName === 'hr_manager' && scopeChoice === 'site'))
          ? parseInt(selectedSiteId)
          : null;

      await apiRequest(`/admin/rbac/users/${userId}/roles`, {
        method: 'POST',
        accessToken,
        scopeHeaders,
        body: JSON.stringify({ 
          roleName: selectedRoleName, 
          siteId: siteId === -1 || isNaN(siteId as any) ? null : siteId 
        })
      });

      toast.success(`Role assigned to ${userName}`);
      onAssigned();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to assign role');
    } finally {
      setIsAssigning(false);
    }
  };

  const isFormValid = () => {
    if (!selectedRoleName) return false;
    if (selectedRoleName === 'site_admin') return selectedSiteId !== 'all';
    if (selectedRoleName === 'hr_manager' && scopeChoice === 'site') return selectedSiteId !== 'all';
    return true;
  };

  const groupedPermissions = useMemo(() => {
    if (!selectedRole || !selectedRole.permissions) return {};
    const groups: Record<string, string[]> = {};
    selectedRole.permissions.forEach(p => {
      const parts = p.split('.');
      const category = parts.length > 1 ? parts[0] : 'Other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(p);
    });
    return groups;
  }, [selectedRole]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl p-0 overflow-hidden rounded-2xl border-none">
        <DialogHeader className="p-6 bg-slate-50 border-b border-slate-100">
          <DialogTitle className="text-xl font-black text-slate-800">Assign Role to {userName}</DialogTitle>
          <DialogDescription className="text-slate-500 font-medium">Select a role and define its operational scope.</DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Role Selection */}
          <div className="space-y-3">
            <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Select Role</Label>
            <div className="grid grid-cols-1 gap-3">
              {roles.map(role => (
                <div 
                  key={role.id}
                  onClick={() => {
                    setSelectedRoleName(role.roleName);
                    // Set default scope/site based on role
                    if (role.roleName === 'site_admin') {
                      setScopeChoice('site');
                    } else if (role.roleName === 'hr_manager') {
                      setScopeChoice('global');
                    } else {
                      setScopeChoice('global');
                    }
                  }}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer group",
                    selectedRoleName === role.roleName 
                      ? "bg-blue-50/50 border-blue-500 shadow-md ring-1 ring-blue-500/20" 
                      : "bg-white border-slate-100 hover:border-slate-300 hover:shadow-sm"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                    selectedRoleName === role.roleName ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                  )}>
                    {role.roleName === 'super_admin' && <ShieldCheck className="w-6 h-6" />}
                    {role.roleName === 'site_admin' && <Building2 className="w-6 h-6" />}
                    {role.roleName === 'hr_manager' && <Users2 className="w-6 h-6" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{role.displayName}</span>
                      {selectedRoleName === role.roleName && (
                        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-white" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{role.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Conditional Site/Scope Selector */}
          {selectedRoleName && selectedRoleName !== 'super_admin' && (
            <div className="space-y-4 p-5 rounded-2xl bg-slate-50 border border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
              {selectedRoleName === 'site_admin' && (
                <div className="space-y-3">
                  <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest flex items-center gap-2">
                    <Building2 className="w-3 h-3" /> Target Site
                  </Label>
                  <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                    <SelectTrigger className="bg-white rounded-xl h-11 border-slate-200 shadow-sm">
                      <SelectValue placeholder="Select a site..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map(site => (
                        <SelectItem key={site.id} value={String(site.id)}>{site.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-slate-500 italic">Site Admins must be restricted to a specific site.</p>
                </div>
              )}

              {selectedRoleName === 'hr_manager' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest flex items-center gap-2">
                       Scope Choice
                    </Label>
                    <RadioGroup 
                      value={scopeChoice} 
                      onValueChange={(v: 'global' | 'site') => setScopeChoice(v)}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm flex-1 cursor-pointer">
                        <RadioGroupItem value="global" id="scope-global" />
                        <Label htmlFor="scope-global" className="font-bold text-sm cursor-pointer">Company-wide</Label>
                      </div>
                      <div className="flex items-center space-x-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm flex-1 cursor-pointer">
                        <RadioGroupItem value="site" id="scope-site" />
                        <Label htmlFor="scope-site" className="font-bold text-sm cursor-pointer">Specific Site</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {scopeChoice === 'site' && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-left-2 duration-200">
                      <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest flex items-center gap-2">
                        Target Site
                      </Label>
                      <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                        <SelectTrigger className="bg-white rounded-xl h-11 border-slate-200 shadow-sm">
                          <SelectValue placeholder="Select a site..." />
                        </SelectTrigger>
                        <SelectContent>
                          {sites.map(site => (
                            <SelectItem key={site.id} value={String(site.id)}>{site.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Permission Preview */}
          {selectedRole && (
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <button 
                onClick={() => setShowPermissions(!showPermissions)}
                className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-bold text-slate-700">View Permissions ({selectedRole.permissions?.length || 0})</span>
                </div>
                {showPermissions ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              
              {showPermissions && (
                <div className="p-4 bg-white border-t border-slate-50 grid grid-cols-2 gap-x-6 gap-y-4 animate-in fade-in duration-200">
                  {Object.entries(groupedPermissions).map(([category, perms]) => (
                    <div key={category} className="space-y-1.5">
                      <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">{category}</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {perms.map(p => (
                          <span key={p} className="text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                            {p.includes('.') ? p.split('.').slice(1).join('.') : p}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100 gap-2">
          <Button variant="ghost" onClick={onClose} className="rounded-xl font-bold">Cancel</Button>
          <Button 
            onClick={handleAssign} 
            disabled={!isFormValid() || isAssigning}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-xl font-bold shadow-lg shadow-blue-500/20"
          >
            {isAssigning ? 'Assigning...' : 'Assign Role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component: UserRoleManagement
// ─────────────────────────────────────────────────────────────────────────────

export const UserRoleManagement: React.FC = () => {
  const { accessToken, can } = useAuth();
  const scopeHeaders = useScopeHeaders();
  
  const [users, setUsers] = useState<RbacUser[]>([]);
  const [roles, setRoles] = useState<RbacRoleDefinition[]>([]);
  const [sites, setSites] = useState<RbacSiteOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal State
  const [assignmentModal, setAssignmentModal] = useState<{
    userId: number | null;
    userName: string | null;
    isOpen: boolean;
  }>({
    userId: null,
    userName: null,
    isOpen: false
  });

  const fetchData = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const [uRes, rRes, sRes] = await Promise.all([
        apiRequest<RbacUser[]>('/admin/rbac/users', { accessToken, scopeHeaders }),
        apiRequest<RbacRoleDefinition[]>('/admin/rbac/roles', { accessToken, scopeHeaders }),
        apiRequest<RbacSiteOption[]>('/admin/rbac/sites', { accessToken, scopeHeaders })
      ]);
      setUsers(uRes || []);
      setRoles(rRes || []);
      setSites(sRes || []);
    } catch (error) {
      toast.error('Failed to load access control data');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [accessToken, scopeHeaders]);

  const handleRevoke = async (userRoleId: number, userName: string) => {
    if (!accessToken) return;
    
    try {
      await apiRequest(`/admin/rbac/user-roles/${userRoleId}`, {
        method: 'DELETE',
        accessToken,
        scopeHeaders
      });
      toast.success(`Role revoked from ${userName}`);
      fetchData(); // Refresh list
    } catch (error: any) {
      toast.error(error.message || 'Failed to revoke role');
    }
  };

  const filteredUsers = users.filter(u => 
    (u.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || 
    (u.email?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  const canManage = can('users.roles.manage');

  if (isLoading && users.length === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-slate-100 rounded-3xl" />
        <div className="h-[400px] bg-slate-50 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Access Control</h1>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Manage user roles and permissions</p>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            placeholder="Search by name or email..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 h-11 rounded-2xl border-slate-200 w-full md:w-[320px] bg-white shadow-sm ring-blue-500/10 focus:ring-4 transition-all"
          />
        </div>
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/50 bg-white overflow-hidden rounded-[2rem]">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-100 bg-slate-50/50">
              <TableHead className="pl-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">User Profile</TableHead>
              <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Active Roles</TableHead>
              <TableHead className="text-right pr-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-400 gap-3">
                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
                      <Search className="w-8 h-8 opacity-20" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-500">No users found</p>
                      <p className="text-xs">Try adjusting your search query</p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map(user => (
                <TableRow key={user.id} className="group hover:bg-slate-50/30 transition-colors border-b border-slate-50 last:border-0">
                  <TableCell className="pl-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
                        <span className="font-black text-sm tracking-tighter">
                          {(user.name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="font-black text-slate-900 tracking-tight leading-none mb-1">{user.name || 'Unknown User'}</div>
                        <div className="text-xs font-semibold text-slate-400 lowercase">{user.email || 'no-email@provided.com'}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {!user.assignments || user.assignments.length === 0 ? (
                        <div className="flex items-center gap-2 text-slate-300">
                          <Info className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">No roles assigned</span>
                        </div>
                      ) : (
                        user.assignments.map(assignment => (
                          <RoleBadge 
                            key={assignment.id}
                            roleName={assignment.roleName}
                            displayName={assignment.displayName}
                            siteName={assignment.siteName}
                            onRevoke={() => handleRevoke(assignment.id, user.name || 'User')}
                            canManage={canManage}
                          />
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    {canManage && (
                      <Button 
                        size="sm"
                        variant="ghost"
                        onClick={() => setAssignmentModal({ userId: user.id, userName: user.name || 'User', isOpen: true })}
                        className="h-10 px-4 rounded-xl bg-slate-50 hover:bg-blue-600 hover:text-white transition-all font-black text-[10px] uppercase tracking-widest text-slate-500 gap-2 border border-slate-100"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Assign Role
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <AssignRoleModal 
        userId={assignmentModal.userId}
        userName={assignmentModal.userName}
        isOpen={assignmentModal.isOpen}
        onClose={() => setAssignmentModal({ ...assignmentModal, isOpen: false })}
        onAssigned={fetchData}
        roles={roles}
        sites={sites}
      />
    </div>
  );
};
