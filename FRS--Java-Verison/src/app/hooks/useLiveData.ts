import { useState, useEffect } from 'react';
import { apiRequest } from '../services/http/apiClient';
import { Employee, AttendanceRecord, Device } from '../types';
import { DeviceAlert } from '../data/enhancedMockData';
import { useAuth } from '../contexts/AuthContext';
import { useScopeHeaders } from './useScopeHeaders';
import { authConfig } from '../config/authConfig';


interface LiveDataState {
    employees: Employee[];
    attendance: AttendanceRecord[];
    devices: Device[];
    alerts: DeviceAlert[];
    isLoading: boolean;
    error: Error | null;
}

export function useLiveData() {
    const { accessToken } = useAuth();
    const scopeHeaders = useScopeHeaders();
    const [data, setData] = useState<LiveDataState>({

        employees: [],
        attendance: [],
        devices: [],
        alerts: [],
        isLoading: true,
        error: null,
    });

    useEffect(() => {
        let isMounted = true;

        async function fetchLiveEnterpriseData() {
            // Fallback to high-fidelity mock data if we're not in API mode
            if (authConfig.mode === 'mock' || false) { // only use mock in explicit mock mode
                if (isMounted) {
                    setData({
                        employees: mockEmployees as any,
                        attendance: mockAttendanceRecords as any,
                        devices: mockDevices as any,
                        alerts: mockAlerts as any,
                        isLoading: false,
                        error: null,
                    });
                }
                return;
            }

            if (!accessToken) {
                if (isMounted) {
                    setData(prev => ({ ...prev, isLoading: false, error: new Error('Session required. Please log in to view live data.') }));
                }
                return;
            }

            try {
                if (isMounted) {
                    setData(prev => ({ ...prev, isLoading: true, error: null }));
                }

                const [employeesRes, attendanceRes, devicesRes, alertsRes] = await Promise.all([
                    apiRequest<{ data: Employee[] }>('/live/employees', { accessToken, scopeHeaders }),
                    apiRequest<{ data: AttendanceRecord[] }>('/live/attendance', { accessToken, scopeHeaders }),
                    apiRequest<{ data: Device[] }>('/live/devices', { accessToken, scopeHeaders }),
                    apiRequest<{ data: DeviceAlert[] }>('/live/alerts', { accessToken, scopeHeaders }),
                ]);


                // Map API snake_case fields to camelCase for analytics.ts compatibility
                const rawAttendance = attendanceRes.data || [];
                const mappedAttendance = rawAttendance.map((r: any) => ({
                    ...r,
                    // Map API fields → analytics.ts expected fields
                    date:         r.attendance_date || r.date,
                    checkIn:      r.check_in       || r.checkIn,
                    checkOut:     r.check_out      || r.checkOut,
                    workingHours: Number(r.working_hours  ?? r.workingHours  ?? 0),
                    overtime:     Number(r.overtime_hours ?? r.overtime      ?? 0),
                    isLate:       r.is_late        ?? r.isLate ?? false,
                    employeeId:   r.fk_employee_id ?? r.employeeId,
                    department:   r.department_name ?? r.department ?? '',
                }));

                const rawEmployees = employeesRes.data || [];
                const mappedEmployees = rawEmployees.map((e: any) => ({
                    ...e,
                    id:         String(e.pk_employee_id ?? e.id),
                    name:       e.full_name   ?? e.name,
                    department: e.department_name ?? e.department ?? '',
                    employeeId: e.employee_code ?? e.employeeId,
                }));

                if (isMounted) {
                    setData({
                        employees: mappedEmployees,
                        attendance: mappedAttendance,
                        devices: devicesRes.data || [],
                        alerts: alertsRes.data || [],
                        isLoading: false,
                        error: null,
                    });
                }
            } catch (err) {
                console.error('[useLiveData] API Request failed:', err);
                if (isMounted) {
                    setData(prev => ({
                        ...prev,
                        isLoading: false,
                        error: err instanceof Error ? err : new Error('Backend connection failed. Is the server running?'),
                    }));
                }
            }
        }

        fetchLiveEnterpriseData();

        return () => {
            isMounted = false;
        };
    }, [accessToken, scopeHeaders]);

    return data;
}
