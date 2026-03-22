import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Loader2, RefreshCw, Search, Download, Activity,
  User, Camera, Shield, UserPlus, LogIn, AlertTriangle, Database,
} from 'lucide-react';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useAuth } from '../../contexts/AuthContext';
import { realtimeEngine } from '../../engine/RealTimeEngine';
import { authConfig } from '../../config/authConfig';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';

interface AuditEntry {
  id: number;
  action: string;
  details: string;
  ip_address: string | null;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
  user_role: string | null;
}

function actionIcon(action: string) {
  if (action.startsWith('face.') || action.startsWith('attendance.')) return Camera;
  if (action.startsWith('user.')) return UserPlus;
  if (action.startsWith('employee.')) return User;
  if (action.startsWith('device.') || action.startsWith('camera.')) return Shield;
  if (action.includes('activate') || action.includes('deactivate')) return Activity;
  if (action.startsWith('dept.') || action.startsWith('shift.')) return Database;
  if (action.includes('login') || action.includes('auth')) return LogIn;
  return Database;
}

function actionColor(action: string) {
  if (action.includes('delete') || action.includes('remove')) return 'text-red-500 bg-red-50 dark:bg-red-900/20';
  if (action.includes('create') || action.includes('enroll') || action.includes('mark')) return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20';
  if (action.includes('update') || action.includes('edit')) return 'text-blue-500 bg-blue-50 dark:bg-blue-900/20';
  return 'text-slate-500 bg-slate-100 dark:bg-slate-800';
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    'face.enroll':       'Face Enrolled',
    'attendance.mark':   'Attendance Marked',
    'user.create':       'User Created',
    'user.delete':       'User Deleted',
    'employee.create':   'Employee Created',
    'employee.update':   'Employee Updated',
    'employee.delete':   'Employee Deleted',
    'camera.register':      'Camera Registered',
    'camera.update':        'Camera Updated',
    'camera.delete':        'Camera Deleted',
    'face.enroll.delete':   'Enrollment Removed',
    'employee.activate':    'Employee Activated',
    'employee.deactivate':  'Employee Deactivated',
    'dept.assign':          'Dept Assigned',
    'shift.assign':         'Shift Assigned',
    'dept.create':          'Dept Created',
    'dept.delete':          'Dept Deleted',
    'camera.update':     'Camera Updated',
    'camera.delete':     'Camera Deleted',
    'dept.assign':       'Dept Assigned',
    'shift.assign':      'Shift Assigned',
  };
  return map[action] || action.replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export const LiveAuditLog: React.FC = () => {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [newCount, setNewCount] = useState(0);
  const prevCountRef = useRef(0);

  const fetchAudit = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('search', search);
      if (filterAction !== 'all') params.set('action', filterAction);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        ...scopeHeaders,
      };
      const r = await fetch(`${authConfig.apiBaseUrl}/live/audit?${params}`, { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const rows: AuditEntry[] = data.data || [];
      setTotal(data.total || rows.length);
      setEntries(rows);
      setLastRefreshed(new Date());
      if (rows.length > prevCountRef.current && prevCountRef.current > 0) {
        setNewCount(rows.length - prevCountRef.current);
        setTimeout(() => setNewCount(0), 3000);
      }
      prevCountRef.current = rows.length;
    } catch (e) {
      console.error('[AuditLog]', e);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, search, filterAction, scopeHeaders]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const t = setInterval(fetchAudit, 15000);
    return () => clearInterval(t);
  }, [fetchAudit]);

  // WebSocket real-time push — prepend new audit events instantly
  useEffect(() => {
    const socket = (realtimeEngine as any).socket;
    if (!socket) return;
    const handler = (entry: AuditEntry) => {
      setEntries(prev => [entry, ...prev.slice(0, 99)]);
      setTotal(prev => prev + 1);
      setNewCount(n => n + 1);
      setTimeout(() => setNewCount(n => Math.max(0, n - 1)), 3000);
    };
    socket.on('auditEvent', handler);
    return () => { socket.off('auditEvent', handler); };
  }, []);

  const actionTypes = [
    { value: 'all',             label: 'All Events' },
    { value: 'attendance.mark', label: 'Attendance' },
    { value: 'face.enroll',     label: 'Enrollment' },
    { value: 'user.create',     label: 'User Create' },
    { value: 'user.delete',     label: 'User Delete' },
    { value: 'employee.create', label: 'Employee Create' },
    { value: 'employee.update',    label: 'Employee Update' },
    { value: 'employee.delete',    label: 'Employee Delete' },
    { value: 'employee.activate',  label: 'Activate' },
    { value: 'employee.deactivate',label: 'Deactivate' },
    { value: 'face.enroll.delete', label: 'Enroll Delete' },
    { value: 'dept.assign',        label: 'Dept Assign' },
    { value: 'shift.assign',       label: 'Shift Assign' },
    { value: 'camera.register',    label: 'Camera Add' },
    { value: 'camera.delete',      label: 'Camera Delete' },
  ];

  const handleExport = () => {
    const csv = [
      'Time,Action,Details,User,Role,IP',
      ...entries.map(e => [
        new Date(e.created_at).toLocaleString(),
        e.action,
        `"${e.details.replace(/"/g, '""')}"`,
        e.user_email || 'system',
        e.user_role || '',
        e.ip_address || '',
      ].join(','))
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className={cn('text-xl font-bold', lightTheme.text.primary, 'dark:text-white')}>
              Live Audit Log
            </h2>
            <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              Live
            </span>
            {newCount > 0 && (
              <span className="text-xs text-blue-600 font-semibold animate-pulse">+{newCount} new</span>
            )}
          </div>
          {lastRefreshed && (
            <p className="text-xs text-slate-500 mt-0.5">
              {total} total events · Updated {lastRefreshed.toLocaleTimeString()} · Auto-refresh 10s
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
            <Download className="w-3.5 h-3.5" />Export
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAudit} disabled={isLoading} className="gap-1.5">
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search actions, details, users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {actionTypes.map(t => (
            <button
              key={t.value}
              onClick={() => setFilterAction(t.value)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border font-medium transition-colors',
                filterAction === t.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : cn(lightTheme.background.secondary, lightTheme.text.secondary, lightTheme.border.default,
                      'dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:border-blue-400')
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Audit entries */}
      <Card className={cn(lightTheme.background.card, lightTheme.border.default, 'dark:bg-slate-950 dark:border-border')}>
        <CardContent className="p-0">
          {isLoading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-slate-400 text-sm">Loading audit events...</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Activity className="w-8 h-8 text-slate-300" />
              <p className="text-slate-400 text-sm">No audit events yet</p>
              <p className="text-slate-400 text-xs">Events will appear here as users perform actions</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((entry, i) => {
                const Icon = actionIcon(entry.action);
                const colorCls = actionColor(entry.action);
                return (
                  <div key={entry.id}
                    className={cn(
                      'flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/50',
                      i === 0 && newCount > 0 && 'bg-blue-50/50 dark:bg-blue-900/10'
                    )}
                  >
                    {/* Icon */}
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', colorCls)}>
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('text-xs font-bold uppercase tracking-wide', lightTheme.text.primary, 'dark:text-white')}>
                          {actionLabel(entry.action)}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          {entry.action}
                        </Badge>
                      </div>
                      <p className={cn('text-sm mt-0.5', lightTheme.text.secondary, 'dark:text-slate-300')}>
                        {entry.details}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {entry.user_email && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {entry.user_name || entry.user_email}
                            {entry.user_role && (
                              <span className="ml-1 px-1 py-0 rounded bg-slate-100 dark:bg-slate-800 text-[10px]">
                                {entry.user_role}
                              </span>
                            )}
                          </span>
                        )}
                        {entry.ip_address && (
                          <span className="text-xs text-slate-400">{entry.ip_address}</span>
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-400">
                        {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </p>
                      <p className="text-[10px] text-slate-300 dark:text-slate-600">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
