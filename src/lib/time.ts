import type { TimeFormat } from '../context/PreferencesContext'
import type { TimeEntry } from './types'

// Formats an ISO datetime string (e.g. clock_in_at) as a clock time honoring
// the user's 12h/24h preference.
export function formatDateTime(iso: string, timeFormat: TimeFormat): string {
  const date = new Date(iso)
  return timeFormat === '24h'
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
}

// Formats a plain "HH:MM" or "HH:MM:SS" time-of-day string (as stored for
// manual entries and schedule shifts) honoring the user's 12h/24h preference.
export function formatTimeOfDay(time: string, timeFormat: TimeFormat): string {
  const [hStr, mStr] = time.split(':')
  const hour = Number(hStr)
  const minute = Number(mStr)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return time
  if (timeFormat === '24h') {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }
  const period = hour < 12 ? 'AM' : 'PM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`
}

// Resolves a time entry's displayed start/end, preferring manual times and
// falling back to clock timestamps, honoring the user's 12h/24h preference.
export function formatEntryTimeRange(
  entry: Pick<TimeEntry, 'manual_start_time' | 'manual_end_time' | 'clock_in_at' | 'clock_out_at'>,
  timeFormat: TimeFormat
): { start: string; end: string } {
  const start = entry.manual_start_time
    ? formatTimeOfDay(entry.manual_start_time, timeFormat)
    : entry.clock_in_at
      ? formatDateTime(entry.clock_in_at, timeFormat)
      : '—'
  const end = entry.manual_end_time
    ? formatTimeOfDay(entry.manual_end_time, timeFormat)
    : entry.clock_out_at
      ? formatDateTime(entry.clock_out_at, timeFormat)
      : '—'
  return { start, end }
}

// Tight time-of-day for dense grids: "8a", "5:30p" (12h) or "08:00" (24h).
export function formatTimeCompact(time: string, timeFormat: TimeFormat): string {
  if (timeFormat === '24h') return formatTimeOfDay(time, timeFormat)
  const [hStr, mStr] = time.split(':')
  const hour = Number(hStr)
  const minute = Number(mStr)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return time
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour < 12 ? 'a' : 'p'}`
}

// Compact range for a time entry, using clock timestamps when there are no
// manual times.
export function formatEntryRangeCompact(
  entry: Pick<TimeEntry, 'manual_start_time' | 'manual_end_time' | 'clock_in_at' | 'clock_out_at'>,
  timeFormat: TimeFormat
): string {
  const part = (manual: string | null, stamp: string | null) =>
    manual
      ? formatTimeCompact(manual, timeFormat)
      : stamp
        ? formatTimeCompact(new Date(stamp).toTimeString().slice(0, 5), timeFormat)
        : '—'
  return `${part(entry.manual_start_time, entry.clock_in_at)}–${part(entry.manual_end_time, entry.clock_out_at)}`
}
