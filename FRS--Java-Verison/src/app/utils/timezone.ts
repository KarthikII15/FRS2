// Shared timezone utility — all time display goes through here
// Site timezone is loaded once and cached

let _siteTz: string = 'UTC';

export function setSiteTimezone(tz: string) {
  _siteTz = tz;
  // Expose globally for non-hook components
  (window as any).__siteTz = tz;
}

export function getSiteTimezone(): string {
  return _siteTz;
}

// Format ISO string to time in site timezone e.g. "02:18 PM"
export function formatTimeInSiteTz(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    // Ensure we have a proper ISO format (T separator) for consistent parsing
    const normalized = typeof iso === 'string' ? iso.replace(' ', 'T') : iso;
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: _siteTz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(normalized));
  } catch {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

// Format ISO string to date in site timezone e.g. "Mar 27, 2026"
export function formatDateInSiteTz(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: _siteTz,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleDateString();
  }
}

// Get today's date string (YYYY-MM-DD) in site timezone
export function todayInSiteTz(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: _siteTz,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date()).split('/');
    // en-CA gives YYYY/MM/DD or YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', { timeZone: _siteTz }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// Format with date + time
export function formatDateTimeInSiteTz(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: _siteTz,
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}
