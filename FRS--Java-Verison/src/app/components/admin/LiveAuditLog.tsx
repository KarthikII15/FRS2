import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Loader2, RefreshCw, Search, Download, AlertCircle, Activity } from 'lucide-react';
import { cn } from '../ui/utils';
import { lightTheme } from '../../../theme/lightTheme';
import { useApiData } from '../../hooks/useApiData';

export const LiveAuditLog: React.FC = () => {
  const { alerts, isLoading, refresh, lastRefreshed } = useApiData({ autoRefreshMs: 60000 });
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const prevCountRef = useRef(0);
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    if (alerts.length > prevCountRef.current) {
      setNewCount(alerts.length - prevCountRef.current);
      setTimeout(() => setNewCount(0), 3000);
    }
    prevCountRef.current = alerts.length;
  }, [alerts.length]);

  const filtered = alerts.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      a.title?.toLowerCase().includes(q) ||
      a.message?.toLowerCase().includes(q) ||
      a.alert_type?.toLowerCase().includes(q);
    const matchSeverity = filterSeverity === 'all' || a.severity === filterSeverity;
    return matchSearch && matchSeverity;
  });

  const severityStyle = (s: string) => {
    if (s === 'critical') return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400';
    if (s === 'high')     return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400';
    if (s === 'medium')   return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400';
    return                       'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400';
  };

  const severityDot = (s: string) => {
    if (s === 'critical') return 'bg-red-500';
    if (s === 'high')     return 'bg-orange-500';
    if (s === 'medium')   return 'bg-amber-500';
    return                       'bg-slate-400';
  };

  const unread = alerts.filter(a => !a.is_read).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className={cn("text-xl font-bold", lightTheme.text.primary)}>Live Audit Log</h2>
            {unread > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                {unread} unread
              </span>
            )}
            {newCount > 0 && (
              <span className="text-xs text-emerald-600 font-semibold animate-pulse">
                +{newCount} new
              </span>
            )}
          </div>
          {lastRefreshed && (
            <p className="text-xs text-slate-500 mt-0.5">
              Live · {alerts.length} total events · Updated {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh()} disabled={isLoading} className="gap-1.5">
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(['critical', 'high', 'medium', 'low'] as const).map(s => {
          const count = alerts.filter(a => a.severity === s).length;
          return (
            <Card
              key={s}
              className={cn("cursor-pointer transition-all", lightTheme.background.card, lightTheme.border.default,
                filterSeverity === s && "ring-2 ring-blue-500"
              )}
              onClick={() => setFilterSeverity(prev => prev === s ? 'all' : s)}
            >
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", severityDot(s))} />
                <div>
                  <p className="text-xs text-slate-500 font-medium capitalize">{s}</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-white">{count}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search + filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search events..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {filterSeverity !== 'all' && (
          <Button variant="outline" size="sm" onClick={() => setFilterSeverity('all')} className="gap-1.5">
            Clear filter
          </Button>
        )}
      </div>

      {/* Events table */}
      <Card className={cn(lightTheme.background.card, lightTheme.border.default)}>
        <CardContent className="p-0">
          {isLoading && alerts.length === 0 ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-slate-400 text-sm">Loading audit events...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Activity className="w-8 h-8 text-slate-400" />
              <p className="text-slate-400 text-sm">No events match the current filter</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((event, i) => (
                <div
                  key={event.pk_alert_id}
                  className={cn(
                    "flex items-start gap-4 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30",
                    !event.is_read && "bg-blue-50/40 dark:bg-blue-900/10"
                  )}
                >
                  {/* Severity dot */}
                  <div className="mt-1.5 flex-shrink-0">
                    <span className={cn("w-2 h-2 rounded-full block", severityDot(event.severity))} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", severityStyle(event.severity))}>
                        {event.severity}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">{event.alert_type}</span>
                      {!event.is_read && (
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">NEW</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-white mt-1">{event.title}</p>
                    <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{event.message}</p>
                    {(event.employee_code || event.external_device_id) && (
                      <div className="flex items-center gap-3 mt-1.5">
                        {event.employee_code && (
                          <span className="text-xs text-slate-400">Employee: <span className="font-mono">{event.employee_code}</span></span>
                        )}
                        {event.external_device_id && (
                          <span className="text-xs text-slate-400">Device: <span className="font-mono">{event.external_device_id}</span></span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-slate-400 font-mono">
                      {new Date(event.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-slate-400 font-mono">
                      {new Date(event.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
