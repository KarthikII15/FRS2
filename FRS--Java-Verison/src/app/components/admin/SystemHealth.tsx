import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { cn } from '../ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { useApiData } from '../../hooks/useApiData';
import { apiRequest } from '../../services/http/apiClient';
import { Terminal, Shield, Zap, Database, Camera, Brain, Activity as ActivityIcon, Thermometer } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Brush } from 'recharts';

// --- UNIFIED NEON STICKERS ---

const NeonIcon = ({ icon: Icon, color }: { icon: any; color: string }) => (
  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 shadow-sm">
    <Icon className={cn("w-4 h-4", color)} />
  </div>
);

const ModularCard = ({ title, value, neonColor, icon, description, children, className }: {
  title: string; value?: any; neonColor?: string; icon?: React.ReactNode;
  description?: React.ReactNode; children?: React.ReactNode; className?: string;
}) => (
  <Card className={cn(
    "border shadow-sm transition-all duration-300 hover:shadow-md overflow-hidden",
    "bg-white border-slate-100 dark:bg-slate-900 dark:border-slate-800",
    className
  )}>
    <CardContent className="p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className={cn("text-[10px] font-black uppercase tracking-widest mb-1", neonColor)}>{title}</p>
          <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tighter">{value}</h2>
        </div>
        <div className="p-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
          {icon}
        </div>
      </div>
      {description && <div className="mt-2">{description}</div>}
      {children}
    </CardContent>
  </Card>
);

export const SystemHealth: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const { devices: liveDevices, refresh: refreshDevices } = useApiData({ autoRefreshMs: 15000 });
  const [trends, setTrends] = useState<any[]>([]);
  const [hourly, setHourly] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [pulse, setPulse] = useState<any[]>([]);

  // Load Pulse from LocalStorage
  useEffect(() => {
    try {
      const savedPulse = localStorage.getItem('system_thermal_pulse');
      if (savedPulse) setPulse(JSON.parse(savedPulse));
    } catch (e) {
      console.error("Failed to load pulse history", e);
    }
  }, []);

  // Save Pulse to LocalStorage
  useEffect(() => {
    if (pulse.length > 0) {
      localStorage.setItem('system_thermal_pulse', JSON.stringify(pulse));
    }
  }, [pulse]);

  useEffect(() => { refreshDevices(); }, []);

  useEffect(() => {
    if (!accessToken) return;
    const fetchData = async () => {
      try {
        const [accRes, actRes, logRes] = await Promise.all([
          apiRequest('/live/accuracy-trend', { accessToken, scopeHeaders }).catch(() => null),
          apiRequest('/live/activity/hourly', { accessToken, scopeHeaders }).catch(() => null),
          apiRequest('/live/audit?limit=6', { accessToken, scopeHeaders }).catch(() => null),
        ]);
        if ((accRes as any)?.data) setTrends((accRes as any).data);
        if ((actRes as any)?.data) setHourly((actRes as any).data);
        if ((logRes as any)?.data) setLogs((logRes as any).data);
      } catch (err) { console.error(err); }
    };
    fetchData();
  }, [accessToken, scopeHeaders]);

  // Effect for Tracking Thermal Pulse
  useEffect(() => {
    if (!liveDevices?.length) return;
    const onlineNodes = liveDevices.filter(d => d.status === 'online' && d.temperature_c !== undefined);
    if (!onlineNodes.length) return;
    
    const avgTemp = onlineNodes.reduce((s, n) => s + Number(n.temperature_c || 0), 0) / onlineNodes.length;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    setPulse(prev => {
        const next = [...prev, { time, value: parseFloat(avgTemp.toFixed(1)) }];
        return next.slice(-2000); // Allow larger history (approx 8 hours @ 15s)
    });
  }, [liveDevices]);

  const devices = liveDevices || [];
  const totalScans = devices.reduce((s, d) => s + Number(d.total_scans || 0), 0);

  // Use device_type field (from new listDevices) or fallback to model/name detection
  const isCamera = (d: any) => (d.device_type === 'Camera') ||
    (!d.device_type && !d.model?.toLowerCase().includes('jetson') && !d.external_device_id?.includes('jetson'));
  const isAI = (d: any) => (d.device_type === 'AI') ||
    (!d.device_type && (d.model?.toLowerCase().includes('jetson') || d.external_device_id?.includes('jetson')));

  const cameras = devices.filter(isCamera);
  const jetsons = devices.filter(isAI);

  const recDevices = cameras.filter(d => Number(d.recognition_accuracy) > 0);
  const avgAccuracy = recDevices.length > 0
    ? (recDevices.reduce((s, d) => s + Number(d.recognition_accuracy), 0) / recDevices.length).toFixed(1)
    : '0.0';

  const onlineNodesCount = devices.filter(d => d.status === 'online').length;

  return (
    <div className="space-y-6">
      {/* --- TOP METRICS ROW --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        <ModularCard
          title="Infrastructure"
          value={devices.length}
          neonColor="text-blue-500"
          icon={<NeonIcon icon={Database} color="text-blue-500" />}
          description={
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-2">
                <Camera className="w-3 h-3 text-blue-400" />
                <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">{cameras.length} Cams</span>
              </div>
              <div className="flex items-center gap-2">
                <Brain className="w-3 h-3 text-purple-400" />
                <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">{jetsons.length} AI Nodes</span>
              </div>
            </div>
          }
        />

        <ModularCard
          title="Recognition Rate"
          value={`${avgAccuracy}%`}
          neonColor="text-purple-500"
          icon={<NeonIcon icon={Shield} color="text-purple-500" />}
          description={<div className="h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full mt-3"><div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(Number(avgAccuracy), 100)}%` }} /></div>}
        />

        <ModularCard
          title="Audit Stream"
          value={logs.length}
          neonColor="text-emerald-500"
          icon={<NeonIcon icon={Terminal} color="text-emerald-500" />}
          description={<Badge className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-none text-[8px] font-black px-2 uppercase tracking-widest mt-2">Live Sync Active</Badge>}
        />

        <ModularCard
          title="Lifetime Scans"
          value={totalScans.toLocaleString()}
          neonColor="text-orange-500"
          icon={<NeonIcon icon={Zap} color="text-orange-500" />}
          description={<span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mt-2 block">Total Frames Parsed</span>}
        />
      </div>

      {/* --- CHARTS ROW --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ModularCard title="System Activity (24h)" neonColor="text-blue-500" icon={<ActivityIcon className="w-4 h-4 text-blue-500" />}>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={hourly}>
              <defs><linearGradient id="chartBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
              <XAxis dataKey="label" fontSize={10} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#fff' }} />
              <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} fill="url(#chartBlue)" />
            </AreaChart>
          </ResponsiveContainer>
        </ModularCard>

        <ModularCard title="Thermal Pulse (°C)" neonColor="text-orange-500" icon={<Thermometer className="w-4 h-4 text-orange-500" />}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={pulse} margin={{ bottom: 20 }}>
              <defs><linearGradient id="chartOrange" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.2} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
              <XAxis dataKey="time" hide />
              <YAxis fontSize={10} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#fff' }} />
              <Area type="monotone" dataKey="value" stroke="#f97316" strokeWidth={3} fill="url(#chartOrange)" isAnimationActive={false} />
              {pulse.length > 40 && <Brush dataKey="time" height={20} stroke="#f97316" fill="#fff" />}
            </AreaChart>
          </ResponsiveContainer>
        </ModularCard>

        <ModularCard title="Accuracy Trend (%)" neonColor="text-purple-500" icon={<Shield className="w-4 h-4 text-purple-500" />}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trends.filter(t => t.scans > 0)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
              <XAxis dataKey="day" fontSize={10} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
              <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} fontSize={10} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
              <Tooltip />
              <Line type="monotone" dataKey="accuracy" stroke="#9333ea" strokeWidth={3} dot={{ r: 4, fill: '#9333ea', strokeWidth: 2, stroke: '#fff' }} />
            </LineChart>
          </ResponsiveContainer>
        </ModularCard>
      </div>

      {/* --- AVAILABILITY & LOGS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ModularCard title="Node Availability" neonColor="text-emerald-500">
          <div className="relative w-full h-[140px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Online', value: onlineNodesCount || 0 },
                    { name: 'Offline', value: Math.max(0, devices.length - onlineNodesCount) },
                  ]}
                  cx="50%" cy="50%" innerRadius={45} outerRadius={60} paddingAngle={8} dataKey="value" stroke="none"
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#f43f5e" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
              <span className="text-2xl font-black text-slate-800 dark:text-white leading-none">{onlineNodesCount}</span>
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Live Nodes</span>
            </div>
          </div>

          <div className="w-full space-y-2 mt-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <NeonIcon icon={Camera} color="text-blue-500" />
                <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase">Camera Cluster</span>
              </div>
              <Badge className="bg-white dark:bg-slate-900 text-blue-600 border-slate-100 dark:border-slate-700 text-[10px] font-black">
                {cameras.filter(c => c.status === 'online').length}/{cameras.length}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <NeonIcon icon={Brain} color="text-purple-500" />
                <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase">AI Edge Cluster</span>
              </div>
              <Badge className="bg-white dark:bg-slate-900 text-purple-600 border-slate-100 dark:border-slate-700 text-[10px] font-black">
                {jetsons.filter(j => j.status === 'online').length}/{jetsons.length}
              </Badge>
            </div>
          </div>
        </ModularCard>

        <ModularCard title="Audit Stream Logs" neonColor="text-slate-400" className="lg:col-span-2">
          <div className="space-y-2">
            {logs.map((log, i) => (
              <div key={log.pk_audit_id || i} className="px-4 py-3 rounded-xl flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-100 dark:hover:border-slate-700">
                <div className="flex gap-4 items-center">
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-center shadow-sm">
                    <Terminal className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-700 dark:text-slate-200 capitalize">{log.action?.replace(/[._]/g, ' ')}</p>
                    <p className="text-[10px] font-bold text-slate-400">{log.user_name || log.entity_name || 'System'}</p>
                  </div>
                </div>
                <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase">
                  {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
            {logs.length === 0 && (
              <p className="text-center text-xs text-slate-300 uppercase tracking-widest py-8">No recent events</p>
            )}
          </div>
        </ModularCard>
      </div>
    </div>
  );
};
