import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Users, UserCheck, UserX, Clock, TrendingUp, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { apiRequest } from '../../services/http/apiClient';
import { cn } from '../ui/utils';

interface DayData {
  date_str: string;
  present: number;
  late: number;
  absent: number;
  total: number;
  rate: string;
}

interface CalendarProps {
  onDayClick?: (date: string, data: DayData | null) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// Indian public holidays 2026 (fallback if Google Calendar unavailable)
const INDIAN_HOLIDAYS_2026: Record<string, string> = {
  '2026-01-01': 'New Year\'s Day',
  '2026-01-14': 'Makar Sankranti',
  '2026-01-26': 'Republic Day',
  '2026-03-30': 'Eid al-Fitr',
  '2026-04-02': 'Ram Navami',
  '2026-04-03': 'Good Friday',
  '2026-04-14': 'Dr. Ambedkar Jayanti',
  '2026-05-01': 'Labour Day',
  '2026-08-15': 'Independence Day',
  '2026-09-17': 'Ganesh Chaturthi',
  '2026-10-02': 'Gandhi Jayanti',
  '2026-10-20': 'Dussehra',
  '2026-11-09': 'Diwali',
  '2026-11-10': 'Diwali Holiday',
  '2026-12-25': 'Christmas',
};

export default function AttendanceCalendar({ onDayClick }: CalendarProps) {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [calData, setCalData] = useState<Record<string, DayData>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<{ date: string; data: DayData | null } | null>(null);
  const [holidays, setHolidays] = useState<Record<string, string>>(INDIAN_HOLIDAYS_2026);

  // Fetch calendar data from backend
  const fetchCalendar = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ data: DayData[] }>(
        `/live/calendar?year=${year}&month=${month}`,
        { accessToken, scopeHeaders }
      );
      const map: Record<string, DayData> = {};
      res.data.forEach(d => { map[d.date_str] = d; });
      setCalData(map);
    } catch { }
    setLoading(false);
  }, [accessToken, year, month]);

  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

  // Try to fetch holidays from Google Calendar MCP (graceful fallback)
  useEffect(() => {
    // Google Calendar integration would go here
    // For now using static Indian holidays
    setHolidays(INDIAN_HOLIDAYS_2026);
  }, [year]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const getDayStr = (d: number) =>
    `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const isWeekend = (d: number) => {
    const dow = new Date(year, month - 1, d).getDay();
    return dow === 0 || dow === 6;
  };

  const handleDayClick = (d: number) => {
    const dateStr = getDayStr(d);
    const data = calData[dateStr] || null;
    setSelectedDay({ date: dateStr, data });
    onDayClick?.(dateStr, data);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-slate-900 dark:text-white text-sm">
            {MONTHS[month - 1]} {year}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}
            className="px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
          >
            Today
          </button>
          <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
        {WEEKDAYS.map(d => (
          <div key={d} className={cn(
            "text-center py-1.5 text-xs font-semibold",
            d === 'Sun' || d === 'Sat' ? 'text-rose-400' : 'text-slate-400 dark:text-slate-500'
          )}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr">
        {cells.map((d, i) => {
          if (!d) return <div key={`empty-${i}`} className="border-b border-r border-slate-50 dark:border-slate-800/50" />;
          const dateStr = getDayStr(d);
          const data = calData[dateStr];
          const isToday = dateStr === todayStr;
          const isWknd = isWeekend(d);
          const holiday = holidays[dateStr];
          const isSelected = selectedDay?.date === dateStr;
          const hasData = data && data.present > 0;
          const rate = data ? Number(data.rate) : 0;

          return (
            <div
              key={dateStr}
              onClick={() => handleDayClick(d)}
              className={cn(
                "border-b border-r border-slate-50 dark:border-slate-800/50 p-1 cursor-pointer transition-all duration-150 relative",
                isSelected ? "bg-blue-50 dark:bg-blue-900/30 ring-1 ring-inset ring-blue-400" : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                isWknd && !isSelected ? "bg-rose-50 dark:bg-rose-900/15 ring-1 ring-inset ring-rose-100 dark:ring-rose-900/30" : "",
                holiday && !isSelected ? "bg-amber-50 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-200 dark:ring-amber-800" : "",
              )}
            >
              {/* Day number */}
              <div className={cn(
                "w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-0.5",
                isToday ? "bg-blue-600 text-white" : isWknd ? "text-rose-400" : "text-slate-700 dark:text-slate-300"
              )}>
                {d}
              </div>

              {/* Holiday label */}
              {holiday && (
                <div className="text-[9px] leading-tight text-amber-700 dark:text-amber-300 font-bold truncate mb-0.5 bg-amber-100 dark:bg-amber-900/30 px-1 rounded">
                  🎉 {holiday}
                </div>
              )}

              {/* Attendance data */}
              {hasData && !loading && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  <div className="flex items-center gap-0.5 flex-wrap">
                    <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                      {data.present}P
                    </span>
                    {data.late > 0 && (
                      <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                        {data.late}L
                      </span>
                    )}
                    {data.absent > 0 && (
                      <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400">
                        {data.absent}A
                      </span>
                    )}
                  </div>

                </div>
              )}

              {/* Weekend/no data indicator */}
              {!hasData && !isWknd && !holiday && !loading && dateStr <= todayStr && (
                <div className="text-[9px] text-slate-300 dark:text-slate-600">—</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
        <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/>Present</span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"/>Late</span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block"/>Absent</span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-full bg-amber-100 border border-amber-300 inline-block"/>Holiday</span>
      </div>

      {/* Day detail popup */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedDay(null)}>
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-80 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Popup header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <p className="font-bold text-slate-900 dark:text-white">
                  {new Date(selectedDay.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                {holidays[selectedDay.date] && (
                  <p className="text-xs text-amber-600 font-medium mt-0.5">🎉 {holidays[selectedDay.date]}</p>
                )}
              </div>
              <button onClick={() => setSelectedDay(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* Popup stats */}
            {selectedDay.data && selectedDay.data.total > 0 ? (
              <div className="p-5 space-y-4">
                {/* Rate bar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-500 font-medium">Attendance Rate</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{selectedDay.data.rate}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full",
                        Number(selectedDay.data.rate) >= 80 ? "bg-emerald-500" :
                        Number(selectedDay.data.rate) >= 50 ? "bg-amber-500" : "bg-rose-500"
                      )}
                      style={{ width: `${selectedDay.data.rate}%` }}
                    />
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-emerald-600 font-medium">Present</p>
                      <p className="text-xl font-bold text-emerald-700">{selectedDay.data.present}</p>
                    </div>
                  </div>
                  <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-3 flex items-center gap-2">
                    <UserX className="w-5 h-5 text-rose-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-rose-600 font-medium">Absent</p>
                      <p className="text-xl font-bold text-rose-700">{selectedDay.data.absent}</p>
                    </div>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-amber-600 font-medium">Late</p>
                      <p className="text-xl font-bold text-amber-700">{selectedDay.data.late}</p>
                    </div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-blue-600 font-medium">Total</p>
                      <p className="text-xl font-bold text-blue-700">{selectedDay.data.total}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center">
                <TrendingUp className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No attendance data for this day</p>
                {(() => { const dow = new Date(selectedDay.date + 'T12:00:00').getDay(); return dow === 0 || dow === 6; })() && (
                  <p className="text-xs text-slate-400 mt-1">Weekend</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
