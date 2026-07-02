import { addDays, differenceInCalendarWeeks, format, getDate, getDay, parseISO } from 'date-fns'
import type { ExceptionType, ScheduleException, ScheduleShift, ScheduleTemplate } from './types'

export interface GeneratedShiftOccurrence {
  date: string // yyyy-MM-dd
  shift: ScheduleShift
  template: ScheduleTemplate
}

/**
 * Expands recurring schedule templates into concrete shift occurrences for a
 * date range. Templates apply prospectively only -- callers should filter by
 * effective_start_date/effective_end_date, which this function respects.
 */
export function generateShiftsForRange(
  templates: ScheduleTemplate[],
  shiftsByTemplate: Record<string, ScheduleShift[]>,
  rangeStart: string,
  rangeEnd: string
): GeneratedShiftOccurrence[] {
  const occurrences: GeneratedShiftOccurrence[] = []
  const start = parseISO(rangeStart)
  const end = parseISO(rangeEnd)

  for (const template of templates) {
    if (!template.active) continue
    const shifts = shiftsByTemplate[template.id] ?? []
    if (shifts.length === 0) continue

    const templateStart = parseISO(template.effective_start_date)
    const templateEnd = template.effective_end_date ? parseISO(template.effective_end_date) : null

    let cursor = start
    while (cursor <= end) {
      const dateStr = format(cursor, 'yyyy-MM-dd')
      const withinEffectiveRange =
        cursor >= templateStart && (!templateEnd || cursor <= templateEnd)

      if (withinEffectiveRange) {
        for (const shift of shifts) {
          if (matchesRecurrence(template, shift, cursor, templateStart)) {
            occurrences.push({ date: dateStr, shift, template })
          }
        }
      }
      cursor = addDays(cursor, 1)
    }
  }

  return occurrences.sort((a, b) => a.date.localeCompare(b.date))
}

function matchesRecurrence(
  template: ScheduleTemplate,
  shift: ScheduleShift,
  date: Date,
  templateStart: Date
): boolean {
  switch (template.recurrence_type) {
    case 'weekly':
      return shift.day_of_week === getDay(date)
    case 'biweekly': {
      if (shift.day_of_week !== getDay(date)) return false
      const weeksSinceStart = differenceInCalendarWeeks(date, templateStart, { weekStartsOn: 0 })
      return weeksSinceStart % 2 === 0
    }
    case 'monthly_by_date':
      return shift.monthly_day === getDate(date)
    case 'monthly_by_weekday':
      return shift.day_of_week === getDay(date) && matchesMonthlyWeek(shift.monthly_week, date)
    case 'custom':
    default:
      return shift.day_of_week === getDay(date)
  }
}

function matchesMonthlyWeek(monthlyWeek: ScheduleShift['monthly_week'], date: Date): boolean {
  if (!monthlyWeek) return false
  const dayOfMonth = getDate(date)
  const occurrence = Math.ceil(dayOfMonth / 7) // 1..5
  if (monthlyWeek === 'last') {
    const nextWeek = addDays(date, 7)
    return nextWeek.getMonth() !== date.getMonth()
  }
  const ordinals = { first: 1, second: 2, third: 3, fourth: 4 } as const
  return ordinals[monthlyWeek as 'first' | 'second' | 'third' | 'fourth'] === occurrence
}

export function shiftHours(shift: ScheduleShift): number {
  const [sh, sm] = shift.start_time.split(':').map(Number)
  const [eh, em] = shift.end_time.split(':').map(Number)
  let minutes = eh * 60 + em - (sh * 60 + sm)
  if (minutes < 0) minutes += 24 * 60
  if (!shift.paid_break) minutes -= shift.break_minutes
  return Math.max(minutes, 0) / 60
}

/**
 * A schedule exception's own hours: prefers the stored paid_hours (parent can
 * always override), then derives from start_time/end_time if given, then
 * falls back to the referenced original shift's duration. Returns 0 if none
 * of those are available.
 */
export function exceptionHours(
  exception: ScheduleException,
  shiftsById: Record<string, ScheduleShift>
): number {
  if (exception.paid_hours != null) return exception.paid_hours
  if (exception.start_time && exception.end_time) {
    const [sh, sm] = exception.start_time.split(':').map(Number)
    const [eh, em] = exception.end_time.split(':').map(Number)
    let minutes = eh * 60 + em - (sh * 60 + sm)
    if (minutes < 0) minutes += 24 * 60
    return minutes / 60
  }
  const original = exception.original_schedule_shift_id
    ? shiftsById[exception.original_schedule_shift_id]
    : undefined
  return original ? shiftHours(original) : 0
}

/**
 * Sum of approved exception hours of a given type within a set (e.g. all
 * schedule_exceptions rows already filtered to a pay period). Per spec 13.3,
 * only 'approved' exceptions should be reflected in pay/calendar.
 */
export function sumExceptionHoursByType(
  exceptions: ScheduleException[],
  shiftsById: Record<string, ScheduleShift>,
  type: ExceptionType,
  options: { requireAffectsPay?: boolean } = {}
): number {
  return exceptions
    .filter(
      (e) =>
        e.status === 'approved' &&
        e.exception_type === type &&
        (!options.requireAffectsPay || e.affects_pay)
    )
    .reduce((sum, e) => sum + exceptionHours(e, shiftsById), 0)
}

/**
 * Net effect of one-off shift-modification exceptions (added/removed/
 * shortened/extended) on scheduled or guaranteed hours for a period, per spec
 * 13.6: "one-off added shifts do not automatically increase guaranteed hours
 * unless marked as guaranteed. One-off removed shifts do not automatically
 * reduce guaranteed hours unless marked." Non-shift-modification exception
 * types (family cancellation, holiday, weather, other) are their own pay
 * buckets and are not part of this delta.
 */
export function scheduleExceptionHoursDelta(
  exceptions: ScheduleException[],
  shiftsById: Record<string, ScheduleShift>,
  options: { onlyGuaranteed?: boolean } = {}
): number {
  let delta = 0
  for (const exception of exceptions) {
    if (exception.status !== 'approved') continue
    if (options.onlyGuaranteed && !exception.counts_toward_guaranteed_hours) continue
    const hours = exceptionHours(exception, shiftsById)
    const original = exception.original_schedule_shift_id
      ? shiftsById[exception.original_schedule_shift_id]
      : undefined
    const originalHours = original ? shiftHours(original) : 0
    switch (exception.exception_type) {
      case 'added_shift':
        delta += hours
        break
      case 'removed_shift':
        delta -= hours
        break
      case 'shortened_shift':
        delta -= Math.max(originalHours - hours, 0)
        break
      case 'extended_shift':
        delta += Math.max(hours - originalHours, 0)
        break
      default:
        break
    }
  }
  return delta
}
