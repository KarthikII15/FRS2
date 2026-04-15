import React, { useState } from 'react';
import { Users, UserPlus } from 'lucide-react';
import { cn } from '../ui/utils';
import { EmployeeLifecycleManagement } from '../hr/EmployeeLifecycleManagement';
import { UserManagement } from './UserManagement';
import { HRMSManagement } from './HRMSManagement';
import { Link2, Shield } from 'lucide-react';
import { UserRoleManagement } from './UserRoleManagement';

const tabs = [
  { id: 'employees', label: 'Employees', icon: UserPlus, desc: 'Roster & Biometrics' },
  { id: 'users',     label: 'System Users', icon: Users,    desc: 'Accounts & Roles' },
  { id: 'rbac',      label: 'Access Control', icon: Shield,  desc: 'RBAC Roles & Policies' },
  { id: 'hrms',      label: 'HRMS Sync',    icon: Link2,    desc: 'Integrations & Webhooks' },
];

export const PeopleManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'employees' | 'users' | 'rbac' | 'hrms'>('employees');

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Workforce Management</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Full Employee Lifecycle & Biometrics</p>
        </div>
      </div>


      {/* INLINE TAB SWITCHER */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl w-fit border border-slate-200/50 dark:border-slate-700/50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'flex items-center gap-3 px-5 py-2.5 rounded-xl transition-all duration-300 group',
                isActive
                  ? 'bg-white dark:bg-slate-900 shadow-[0_10px_25px_-5px_rgba(59,130,246,0.15)] border border-blue-100 dark:border-blue-900/40'
                  : 'hover:bg-white/50 dark:hover:bg-slate-700/50'
              )}
            >
              <div
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500 group-hover:bg-slate-300 dark:group-hover:bg-slate-600'
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex flex-col items-start text-left">
                <span className={cn('text-xs font-black tracking-tight', isActive ? 'text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400')}>
                  {tab.label}
                </span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter leading-none">
                  {tab.desc}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* CONTENT */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        {activeTab === 'employees' && <EmployeeLifecycleManagement />}
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'rbac' && <UserRoleManagement />}
        {activeTab === 'hrms' && <HRMSManagement />}
      </div>
    </div>
  );
};
