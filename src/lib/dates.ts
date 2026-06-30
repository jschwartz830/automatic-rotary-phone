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
