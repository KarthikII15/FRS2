import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { 
  Zap, Cpu, Thermometer, MemoryStick, HardDrive, 
  Activity, RefreshCw, Layers, ShieldCheck, AlertCircle,
  Network
} from 'lucide-react';
import { cn } from '../ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { apiRequest } from '../../services/http/apiClient';
import { realtimeEngine } from '../../engine/RealTimeEngine';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid
} from 'recharts';

// --- Types ---
interface NugBox {
  pk_nug_id: string; 
  name: string; 
  device_code: string; 
  ip_address: string;
  status: string; 
  location_label?: string;
  cpu_percent: number | null; 
  memory_used_mb: number | null; 
  memory_total_mb: number | null;
  gpu_percent: number | null; 
  temperature_c: number | null; 
  disk_used_gb: number | null; 
  uptime_seconds: number | null;
  model: string;
  last_heartbeat: string | null;
}

interface TelemetryPoint {
  time: string;
  cpu: number;
  gpu: number;
  ram: number;
}

const fmtTemp = (t: number | null) => t != null && !isNaN(t) ? `${Number(t).toFixed(1)}°C` : '—';
const fmtMem = (used: number | null, total: number | null) => {
  if (used == null || total == null) return '—';
  return `${(Number(used)/1024).toFixed(1)} / ${(Number(total)/1024).toFixed(1)} GB`;
};
const fmtUptime = (s: number | null) => {
  if (!s) return '—';
  const n = Number(s);
  const d = Math.floor(n / 86400);
  const h = Math.floor((n % 86400) / 3600);
  const m = Math.floor((n % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// --- Sub-component: Metric Ring ---
const MetricRing = ({ label, value, unit = '%', color = 'stroke-blue-500', size = 60 }: { label: string, value: number | null, unit?: string, color?: string, size?: number }) => {
  const radius = (size / 2) - 5;
  const circumference = 2 * Math.PI * radius;
  const val = value != null ? Math.min(100, Math.max(0, value)) : 0;
  const offset = circumference - (val / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="w-full h-full transform -rotate-90">
          <circle cx={size/2} cy={size/2} r={radius} className="stroke-slate-100 dark:stroke-slate-800" strokeWidth="4" fill="transparent" />
          <circle 
            cx={size/2} cy={size/2} r={radius} 
            className={cn("transition-all duration-1000 ease-out", color)} 
            strokeWidth="4" strokeDasharray={circumference} strokeDashoffset={offset} 
            strokeLinecap="round" fill="transparent" 
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-black text-slate-700 dark:text-slate-300">
            {value != null ? `${Math.round(value)}${unit}` : '—'}
          </span>
        </div>
      </div>
      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
    </div>
  );
};

// --- Sub-component: Pulse Sparkline ---
const PulseSparkline = ({ data, dataKey, color }: { data: TelemetryPoint[], dataKey: 'cpu' | 'gpu' | 'ram', color: string }) => {
  return (
    <div className="h-12 w-full mt-2 opacity-80 group-hover:opacity-100 transition-opacity">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <Area 
            type="monotone" 
            dataKey={dataKey} 
            stroke={color} 
            strokeWidth={2}
            fillOpacity={1} 
            fill={`url(#grad-${dataKey})`} 
            isAnimationActive={false}
          />
          <YAxis hide domain={[0, 100]} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// --- Sub-component: Cluster Trend Chart ---
const ClusterTrendChart = ({ title, data, dataKey, color, type = 'area' }: { title: string, data: any[], dataKey: string, color: string, type?: 'area' | 'line' }) => (
  <Card className="border-none shadow-sm bg-white dark:bg-slate-900 overflow-hidden">
    <CardHeader className="pb-2">
      <div className="flex justify-between items-center">
        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</CardTitle>
        <div className="p-1 bg-slate-50 dark:bg-slate-800 rounded-lg">
          {type === 'area' ? <Activity className="w-3 h-3 text-blue-500" /> : <ShieldCheck className="w-3 h-3 text-purple-500" />}
        </div>
      </div>
    </CardHeader>
    <CardContent className="pt-0">
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'area' ? (
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`grad-cluster-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.2}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
              <XAxis dataKey="time" hide />
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#94a3b8' }} />
              <ChartTooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: 'rgba(255,255,255,0.9)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
              />
              <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={3} fill={`url(#grad-cluster-${dataKey})`} isAnimationActive={false} />
            </AreaChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
              <XAxis dataKey="time" hide />
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#94a3b8' }} />
              <ChartTooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: 'rgba(255,255,255,0.9)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
              />
              <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={3} dot={{ r: 4, fill: color, strokeWidth: 2, stroke: '#fff' }} isAnimationActive={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </CardContent>
  </Card>
);

export const HardwareMetricsDashboard: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [nugs, setNugs] = useState<NugBox[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [history, setHistory] = useState<Record<string, TelemetryPoint[]>>({});
  const [globalHistory, setGlobalHistory] = useState<TelemetryPoint[]>([]);

  const updateHistory = useCallback((newNugs: NugBox[]) => {
    setHistory(prev => {
      const next = { ...prev };
      const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      let totalCpu = 0;
      let totalGpu = 0;
      let totalRam = 0;
      let onlineCount = 0;

      newNugs.forEach(n => {
        const id = n.pk_nug_id;
        const currentPoints = next[id] || [];
        const ramPct = n.memory_used_mb && n.memory_total_mb ? (n.memory_used_mb / n.memory_total_mb) * 100 : 0;
        
        const newPoint: TelemetryPoint = {
          time: currentTime,
          cpu: n.cpu_percent ?? 0,
          gpu: n.gpu_percent ?? 0,
          ram: ramPct
        };
        
        if (n.status === 'online') {
          totalCpu += newPoint.cpu;
          totalGpu += newPoint.gpu;
          totalRam += newPoint.ram;
          onlineCount++;
        }

        const updatedPoints = [...currentPoints, newPoint].slice(-30);
        next[id] = updatedPoints;
      });

      // Update Global History
      if (onlineCount > 0) {
        const globalPoint: TelemetryPoint = {
          time: currentTime,
          cpu: totalCpu / onlineCount,
          gpu: totalGpu / onlineCount,
          ram: totalRam / onlineCount
        };
        setGlobalHistory(g => [...g, globalPoint].slice(-40));
      }

      return next;
    });
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const opts = { accessToken, scopeHeaders };
      const res = await apiRequest<{ nug_boxes: NugBox[] }>('/devices/hierarchy', opts);
      if (res.nug_boxes) {
        setNugs(res.nug_boxes);
        updateHistory(res.nug_boxes);
      }
    } catch (e) {
      console.error('Failed to fetch hardware metrics:', e);
    } finally {
      setLoading(false);
    }
  }, [accessToken, scopeHeaders, updateHistory]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time listener
  useEffect(() => {
    const socket = (realtimeEngine as any).socket;
    if (!socket) return;
    const onSync = () => fetchData();
    socket.on('deviceStatusUpdate', onSync);
    return () => {
      socket.off('deviceStatusUpdate', onSync);
    };
  }, [fetchData]);

  if (isLoading && nugs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
              <Zap className="w-6 h-6 text-blue-100" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-100 opacity-80">Total Clusters</p>
              <h3 className="text-2xl font-black">{nugs.length} Monitoring Nodes</h3>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-sm bg-white dark:bg-slate-900 overflow-hidden">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl">
              <ShieldCheck className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Online Rate</p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">
                {Math.round((nugs.filter(n => n.status === 'online').length / (nugs.length || 1)) * 100)}%
              </h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white dark:bg-slate-900 overflow-hidden">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl">
              <Activity className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Total Capacity</p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">
                {(nugs.reduce((s, n) => s + (n.memory_total_mb || 0), 0) / 1024).toFixed(1)} GB RAM
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CLUSTER DYNAMICS - NEW ANALYTICS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClusterTrendChart 
          title="Cluster CPU Activity (Live)" 
          data={globalHistory} 
          dataKey="cpu" 
          color="#3b82f6" 
          type="area" 
        />
        <ClusterTrendChart 
          title="System Memory Pulse (%)" 
          data={globalHistory} 
          dataKey="ram" 
          color="#9333ea" 
          type="line" 
        />
      </div>

      {/* NODE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {nugs.map((nug) => {
          const isOnline = nug.status === 'online';
          const isWarning = (nug.temperature_c || 0) > 75 || (nug.cpu_percent || 0) > 90;

          return (
            <Card key={nug.pk_nug_id} className="border-none shadow-lg bg-white dark:bg-slate-900 overflow-hidden group">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-800/30 py-4 px-6 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-xl flex items-center justify-center transition-colors",
                    isOnline ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10" : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                  )}>
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-black text-slate-800 dark:text-slate-100">{nug.name}</CardTitle>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{nug.location_label || 'Unassigned Zone'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={cn(
                    "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest border-none shadow-sm",
                    isOnline ? "bg-emerald-500 text-white" : "bg-slate-400 text-white"
                  )}>
                    {nug.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {!isOnline ? (
                   <div className="flex flex-col items-center justify-center py-8 gap-3 opacity-40">
                      <AlertCircle className="w-10 h-10 text-slate-400" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Node Connectivity Lost</p>
                   </div>
                ) : (
                  <div className="space-y-6">
                    {/* KEY RINGS */}
                    <div className="flex items-center justify-between px-2">
                        <MetricRing label="CPU" value={nug.cpu_percent} color="stroke-blue-500" size={70} />
                        <MetricRing label="GPU" value={nug.gpu_percent} color="stroke-indigo-500" size={70} />
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-[70px] h-[70px] rounded-full border-4 border-slate-100 dark:border-slate-800 flex items-center justify-center">
                            <Thermometer className={cn("w-6 h-6", isWarning ? "text-rose-500 animate-pulse" : "text-amber-500")} />
                          </div>
                          <span className="text-[10px] font-black text-slate-700 dark:text-slate-300">{fmtTemp(nug.temperature_c)}</span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Temp</span>
                        </div>
                        <MetricRing label={`RAM`} value={nug.memory_used_mb && nug.memory_total_mb ? (nug.memory_used_mb/nug.memory_total_mb)*100 : null} color="stroke-emerald-500" size={70} />
                    </div>

                    {/* LIVE TREND SPARKLINE */}
                    <div className="grid grid-cols-3 gap-2 px-2 py-1 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-slate-100/50 dark:border-slate-800/50">
                       <div className="flex flex-col gap-1">
                          <PulseSparkline data={history[nug.pk_nug_id] || []} dataKey="cpu" color="#3b82f6" />
                          <span className="text-[8px] font-black uppercase text-center text-blue-500 opacity-60">CPU Trend</span>
                       </div>
                       <div className="flex flex-col gap-1">
                          <PulseSparkline data={history[nug.pk_nug_id] || []} dataKey="gpu" color="#6366f1" />
                          <span className="text-[8px] font-black uppercase text-center text-indigo-500 opacity-60">GPU Trend</span>
                       </div>
                       <div className="flex flex-col gap-1">
                          <PulseSparkline data={history[nug.pk_nug_id] || []} dataKey="ram" color="#10b981" />
                          <span className="text-[8px] font-black uppercase text-center text-emerald-500 opacity-60">RAM Trend</span>
                       </div>
                    </div>

                    {/* DETAILED LEDGER */}
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 pt-4 border-t border-slate-50 dark:border-slate-800/50">
                      <div className="flex items-center gap-3">
                        <MemoryStick className="w-4 h-4 text-slate-400" />
                        <div className="min-w-0">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Memory Context</p>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{fmtMem(nug.memory_used_mb, nug.memory_total_mb)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Activity className="w-4 h-4 text-slate-400" />
                        <div className="min-w-0">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active Pulse</p>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{fmtUptime(nug.uptime_seconds)} Uptime</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <HardDrive className="w-4 h-4 text-slate-400" />
                        <div className="min-w-0">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Storage Mass</p>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{nug.disk_used_gb != null ? `${Number(nug.disk_used_gb).toFixed(1)} GB Used` : '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Network className="w-4 h-4 text-slate-400" />
                        <div className="min-w-0">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Node Path</p>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate truncate">{nug.ip_address}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
              {isOnline && (
                <div className="h-1 w-full bg-slate-50 dark:bg-slate-800">
                   <div className={cn("h-full transition-all duration-1000", isWarning ? "bg-rose-500" : "bg-blue-500")} style={{width: `${nug.cpu_percent || 0}%`}} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
      
      {nugs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
           <Layers className="w-12 h-12 text-slate-300 mb-4" />
           <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No hardware nodes detected in hierarchy</p>
        </div>
      )}
    </div>
  );
};
