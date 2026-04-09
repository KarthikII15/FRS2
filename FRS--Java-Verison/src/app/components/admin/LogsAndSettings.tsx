import React, { useState } from 'react';
import { FileText, Settings } from 'lucide-react';
import { cn } from '../ui/utils';
import { LiveAuditLog } from './LiveAuditLog';
import { AdminSettings } from './AdminSettings';

const tabs = [
  { id: 'audit',    label: 'Audit Log', icon: FileText, desc: 'Live Activity Trail' },
  { id: 'settings', label: 'Settings',  icon: Settings, desc: 'Site Configuration' },
];

export const LogsAndSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'audit' | 'settings'>('audit');

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div>
        <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Logs &amp; Settings</h2>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
          Audit Trail &amp; System Configuration
        </p>
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
        {activeTab === 'audit' ? <LiveAuditLog /> : <AdminSettings />}
      </div>
    </div>
  );
};
