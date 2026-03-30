import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useScopeHeaders } from '../../hooks/useScopeHeaders';
import { apiRequest } from '../../services/http/apiClient';
import { Globe, Clock, Save, CheckCircle } from 'lucide-react';

const TIMEZONES = [
  { value: 'UTC',                label: 'UTC — Coordinated Universal Time',         abbr: 'UTC'  },
  { value: 'Asia/Kolkata',       label: 'Asia/Kolkata — India Standard Time',       abbr: 'IST'  },
  { value: 'Asia/Dubai',         label: 'Asia/Dubai — Gulf Standard Time',          abbr: 'GST'  },
  { value: 'Asia/Singapore',     label: 'Asia/Singapore — Singapore Time',          abbr: 'SGT'  },
  { value: 'Asia/Tokyo',         label: 'Asia/Tokyo — Japan Standard Time',         abbr: 'JST'  },
  { value: 'Asia/Shanghai',      label: 'Asia/Shanghai — China Standard Time',      abbr: 'CST'  },
  { value: 'Europe/London',      label: 'Europe/London — Greenwich Mean Time',      abbr: 'GMT'  },
  { value: 'Europe/Paris',       label: 'Europe/Paris — Central European Time',     abbr: 'CET'  },
  { value: 'Europe/Berlin',      label: 'Europe/Berlin — Central European Time',    abbr: 'CET'  },
  { value: 'America/New_York',   label: 'America/New_York — Eastern Time',          abbr: 'EST'  },
  { value: 'America/Chicago',    label: 'America/Chicago — Central Time',           abbr: 'CST'  },
  { value: 'America/Denver',     label: 'America/Denver — Mountain Time',           abbr: 'MST'  },
  { value: 'America/Los_Angeles',label: 'America/Los_Angeles — Pacific Time',       abbr: 'PST'  },
  { value: 'America/Sao_Paulo',  label: 'America/Sao_Paulo — Brasilia Time',        abbr: 'BRT'  },
  { value: 'Australia/Sydney',   label: 'Australia/Sydney — Australian Eastern Time', abbr: 'AEST'},
  { value: 'Pacific/Auckland',   label: 'Pacific/Auckland — New Zealand Time',      abbr: 'NZST' },
];

interface SiteSettings {
  pk_site_id: string;
  site_name: string;
  timezone: string;
  timezone_label: string;
}

export default function SiteSettings() {
  const { accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [selectedTz, setSelectedTz] = useState('UTC');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState('');

  // Load current settings
  useEffect(() => {
    if (!accessToken) return;
    apiRequest<SiteSettings>('/site/settings', { accessToken, scopeHeaders })
      .then(d => {
        setSettings(d);
        setSelectedTz(d.timezone);
      })
      .catch(() => setError('Failed to load site settings'))
      .finally(() => setLoading(false));
  }, [accessToken]);

  // Live clock in selected timezone
  useEffect(() => {
    const update = () => {
      try {
        setCurrentTime(new Intl.DateTimeFormat('en-IN', {
          timeZone: selectedTz,
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: true, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
        }).format(new Date()));
      } catch { setCurrentTime('Invalid timezone'); }
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [selectedTz]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const abbr = TIMEZONES.find(t => t.value === selectedTz)?.abbr || selectedTz;
      const updated = await apiRequest<SiteSettings>('/site/settings', {
        accessToken, scopeHeaders,
        method: 'PATCH',
        body: JSON.stringify({ timezone: selectedTz, timezone_label: abbr }),
      });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Site Settings</h2>
        <p className="text-sm text-slate-500 mt-1">
          Configure timezone for <span className="font-medium">{settings?.site_name}</span>.
          All attendance times, late arrival calculations, and shift schedules will use this timezone.
        </p>
      </div>

      {/* Current time preview */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center gap-3">
        <Clock className="w-5 h-5 text-blue-500 flex-shrink-0" />
        <div>
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">Current time in selected timezone</p>
          <p className="text-lg font-mono font-semibold text-blue-900 dark:text-blue-100">{currentTime}</p>
        </div>
      </div>

      {/* Timezone selector */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-slate-500" />
          <h3 className="font-medium text-slate-900 dark:text-white">Timezone</h3>
          {settings?.timezone_label && (
            <span className="ml-auto text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
              Current: {settings.timezone_label} ({settings.timezone})
            </span>
          )}
        </div>

        <select
          value={selectedTz}
          onChange={e => setSelectedTz(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {TIMEZONES.map(tz => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300">
          ⚠ Changing timezone affects: late arrival detection, check-in/out display times, shift scheduling, and attendance date rollover at midnight.
        </div>
      </div>

      {/* What this affects */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
        <h3 className="font-medium text-slate-900 dark:text-white mb-3">What timezone affects</h3>
        <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-400">
          {[
            '🕐 Late arrival calculation',
            '📅 Attendance date (midnight rollover)',
            '⏰ Check-in / check-out display times',
            '🔄 Shift start & end times',
          ].map(item => (
            <div key={item} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
              {item}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || selectedTz === settings?.timezone}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {saved && (
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            Settings saved successfully
          </div>
        )}
      </div>
    </div>
  );
}
