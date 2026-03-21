import { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '../services/http/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { useScopeHeaders } from './useScopeHeaders';
import { authConfig } from '../config/authConfig';

export interface LiveEmployee {
  pk_employee_id: number;
  employee_code: string;
  full_name: string;
  email: string;
  position_title: string;
  location_label: string;
  join_date: string;
  status: 'active' | 'inactive' | 'on-leave';
  department_name: string;
  shift_type: string;
  face_enrolled?: boolean;
  fk_department_id?: number;
  fk_shift_id?: number;
}

export interface LiveAttendanceRecord {
  pk_attendance_id: number;
  fk_employee_id: number;
  employee_code: string;
  full_name: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  status: 'present' | 'late' | 'absent' | 'on-leave' | 'on-break';
  working_hours: number;
  overtime_hours: number;
  is_late: boolean;
  device_id: string | null;
  location_label: string | null;
  recognition_accuracy: number | null;
}

export interface LiveDevice {
  pk_device_id: number;
  external_device_id: string;
  name: string;
  location_label: string;
  ip_address: string;
  status: 'online' | 'offline' | 'error';
  recognition_accuracy: number;
  total_scans: number;
  error_rate: number;
  model: string;
  last_active: string;
}

export interface LiveAlert {
  pk_alert_id: number;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  employee_code?: string;
  external_device_id?: string;
}

export interface DashboardMetrics {
  totalEmployees: number;
  presentToday: number;
  lateToday: number;
  absentToday: number;
  onBreak: number;
  onLeave: number;
  avgWorkingHours: number;
  totalOvertimeHours: number;
  attendanceRate: number;
  punctualityRate: number;
}

export interface ApiDataState {
  employees: LiveEmployee[];
  attendance: LiveAttendanceRecord[];
  devices: LiveDevice[];
  alerts: LiveAlert[];
  metrics: DashboardMetrics | null;
  isLoading: boolean;
  error: string | null;
  lastRefreshed: Date | null;
}

// Global cache to prevent duplicate parallel requests
const cache: { data: ApiDataState | null; ts: number; inflight: Promise<ApiDataState> | null } = {
  data: null, ts: 0, inflight: null,
};
const CACHE_TTL = 15000; // 20s — don't re-fetch if data is fresh

export function useApiData(options: { autoRefreshMs?: number } = {}) {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const { autoRefreshMs = 60000 } = options;
  const isMountedRef = useRef(true);

  const [state, setState] = useState<ApiDataState>(
    cache.data ?? {
      employees: [], attendance: [], devices: [], alerts: [],
      metrics: null, isLoading: true, error: null, lastRefreshed: null,
    }
  );

  const fetchAll = useCallback(async () => {
    if (authConfig.mode === 'mock' || !accessToken) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    // Return cached data if fresh
    if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
      if (isMountedRef.current) setState(cache.data);
      return;
    }

    // Deduplicate: if a fetch is already in flight, wait for it
    if (!cache.inflight) {
      cache.inflight = (async (): Promise<ApiDataState> => {
        const opts = { accessToken, scopeHeaders };
        const [empR, attR, devR, alrR, metR] = await Promise.allSettled([
          apiRequest<{ data: LiveEmployee[] }>('/live/employees', opts),
          apiRequest<{ data: LiveAttendanceRecord[] }>('/live/attendance?limit=500', opts),
          apiRequest<{ data: LiveDevice[] }>('/live/devices', opts),
          apiRequest<{ data: LiveAlert[] }>('/live/alerts', opts),
          apiRequest<DashboardMetrics>('/live/metrics', opts),
        ]);
        const get = <T>(r: PromiseSettledResult<any>, fallback: T): T =>
          r.status === 'fulfilled' ? r.value : fallback;
        const newState: ApiDataState = {
          employees:  get(empR, { data: [] }).data ?? [],
          attendance: get(attR, { data: [] }).data ?? [],
          devices:    get(devR, { data: [] }).data ?? [],
          alerts:     get(alrR, { data: [] }).data ?? [],
          metrics:    get(metR, null),
          isLoading:  false,
          error:      null,
          lastRefreshed: new Date(),
        };
        cache.data = newState;
        cache.ts   = Date.now();
        cache.inflight = null;
        return newState;
      })().catch(err => {
        cache.inflight = null;
        throw err;
      });
    }

    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const newState = await cache.inflight!;
      if (isMountedRef.current) setState(newState);
    } catch (err) {
      if (isMountedRef.current) {
        setState(prev => ({
          ...prev, isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch',
        }));
      }
    }
  }, [accessToken]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchAll();
    return () => { isMountedRef.current = false; };
  }, [fetchAll]);

  useEffect(() => {
    if (autoRefreshMs > 0) {
      const t = setInterval(fetchAll, autoRefreshMs);
      return () => clearInterval(t);
    }
  }, [fetchAll, autoRefreshMs]);

  return { ...state, refresh: () => { cache.ts = 0; fetchAll(); } };
}
