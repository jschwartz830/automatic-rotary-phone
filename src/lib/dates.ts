// Native <input type="date"> lets some browsers commit a day value that
// doesn't exist for the chosen month (e.g. June 31) when typed via keyboard
// rather than picked, silently rolling it into the next month. Round-tripping
// through Date and comparing components catches that before it's submitted.
export function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [, y, m, d] = match
  const year = Number(y)
  const month = Number(m)
  const day = Number(d)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

// Local calendar date as YYYY-MM-DD. Unlike toISOString().slice(0, 10), this
// doesn't jump to tomorrow in the evening for households west of UTC.
export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayIso(): string {
  return toIsoDate(new Date())
}

function parseIsoDate(iso: string): Date | null {
  if (!isValidCalendarDate(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "Mon, Sep 22" for a stored YYYY-MM-DD date (year appended when it isn't the
// current year). Falls back to the raw string for anything unparseable.
export function formatDay(iso: string | null | undefined, opts: { weekday?: boolean } = {}): string {
  if (!iso) return '—'
  const date = parseIsoDate(iso.slice(0, 10))
  if (!date) return iso
  const weekday = opts.weekday ?? true
  const base = `${MONTHS[date.getMonth()]} ${date.getDate()}`
  const year = date.getFullYear() !== new Date().getFullYear() ? `, ${date.getFullYear()}` : ''
  return `${weekday ? `${WEEKDAYS[date.getDay()]}, ` : ''}${base}${year}`
}

// "Sep 8 – 21" / "Sep 29 – Oct 12" / "Dec 29, 2025 – Jan 11, 2026".
export function formatDayRange(start: string, end: string | null | undefined): string {
  if (!end || end === start) return formatDay(start, { weekday: false })
  const s = parseIsoDate(start)
  const e = parseIsoDate(end)
  if (!s || !e) return `${start} – ${end}`
  if (s.getFullYear() !== e.getFullYear()) {
    return `${MONTHS[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`
  }
  const year = s.getFullYear() !== new Date().getFullYear() ? `, ${s.getFullYear()}` : ''
  const endPart = s.getMonth() === e.getMonth() ? `${e.getDate()}` : `${MONTHS[e.getMonth()]} ${e.getDate()}`
  return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${endPart}${year}`
}

// Compact hours: 8 -> "8h", 7.5 -> "7.5h", 7.25 -> "7.25h".
export function formatHours(hours: number | null | undefined): string {
  const n = hours ?? 0
  return `${Number(n.toFixed(2))}h`
}

export function formatMoney(amount: number | null | undefined): string {
  return `$${(amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
