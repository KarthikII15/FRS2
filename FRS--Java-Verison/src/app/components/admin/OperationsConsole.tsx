import React, { useState } from 'react';
import { Badge } from '../ui/badge';
import { Activity, LayoutDashboard, Zap } from 'lucide-react';
import { cn } from '../ui/utils';


import { FacilityIntelligenceDashboard } from './FacilityIntelligenceDashboard';
import { HardwareMetricsDashboard } from './HardwareMetricsDashboard';
import { useApiData } from '../../hooks/useApiData';

export const OperationsConsole: React.FC = () => {
    const [activeSubTab, setActiveSubTab] = useState('facility');
    const { devices } = useApiData({ autoRefreshMs: 30000 });
    const onlineCount = devices.filter(d => d.status === 'online').length;
    const isLive = onlineCount > 0;

    const subTabs = [
        { id: 'facility',  label: 'Intelligence', icon: LayoutDashboard, desc: 'Facility Insights' },
        { id: 'metrics',   label: 'Pulse',         icon: Zap,             desc: 'Hardware Health' },
    ];

    const renderSubContent = () => {
        switch (activeSubTab) {
            case 'facility':  return <FacilityIntelligenceDashboard />;
            case 'metrics':   return <HardwareMetricsDashboard />;
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
            {/* PAGE HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Operations Control</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Facility Management & Edge Telemetry</p>
                </div>
                <div className="flex items-center gap-2">
                   <Badge className={cn(
                     "border-none font-black text-[9px] px-3 py-1 uppercase tracking-tighter",
                     isLive ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"
                   )}>
                     <Activity className={cn("w-3 h-3 mr-1.5", isLive && "animate-pulse")} />
                     {isLive ? `${onlineCount} Node${onlineCount !== 1 ? 's' : ''} Live` : 'No Nodes Online'}
                   </Badge>
                </div>
            </div>

            {/* FLOATING SUB-NAV */}
            <div className="flex flex-wrap items-center gap-3 p-1.5 bg-slate-100/50 backdrop-blur-sm rounded-2xl w-fit border border-slate-200/50">
                {subTabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveSubTab(tab.id)}
                        className={cn(
                            "flex items-center gap-3 px-5 py-2.5 rounded-xl transition-all duration-300 group",
                            activeSubTab === tab.id
                                ? "bg-white shadow-[0_10px_25px_-5px_rgba(59,130,246,0.2)] border border-blue-100"
                                : "hover:bg-white/50"
                        )}
                    >
                        <div className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            activeSubTab === tab.id ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500 group-hover:bg-slate-300"
                        )}>
                            <tab.icon className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col items-start text-left">
                            <span className={cn("text-xs font-black tracking-tight", activeSubTab === tab.id ? "text-slate-800" : "text-slate-500")}>
                                {tab.label}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter leading-none">
                                {tab.desc}
                            </span>
                        </div>
                    </button>
                ))}
            </div>

            {/* CONTENT AREA */}
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                {renderSubContent()}
            </div>
        </div>
    );
};
