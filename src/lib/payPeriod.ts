import { addDays, endOfMonth, format, getDate, getDay, setDate, startOfMonth, subDays } from 'date-fns'
import type { CaregiverProfile } from './types'

export interface PayPeriodRange {
  start: string
  end: string
}

function toIso(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

// Weekly/biweekly periods pin one boundary to a fixed weekday. For an
// end-day anchor we want the *upcoming* (or today's) occurrence, since that's
// the period whose payday hasn't happened yet. For a start-day anchor we want
// the most recent occurrence, since that period has already begun and is
// still accumulating hours. Biweekly parity isn't stored anywhere, so this
// picks the single 14-day window ending/starting on the nearest anchor day --
// it can drift a week off the "real" biweekly cycle, but the catch-up button
// (driven by the last generated timesheet) corrects for that in practice.
function nearestWeekday(from: Date, weekday: number, direction: 'next' | 'previous'): Date {
  const delta =
    direction === 'next' ? (weekday - getDay(from) + 7) % 7 : (getDay(from) - weekday + 7) % 7
  return direction === 'next' ? addDays(from, delta) : subDays(from, delta)
}

/**
 * The pay period a parent would default to today: for weekly/biweekly pay,
 * whichever period is closing next (end-day anchor) or already underway
 * (start-day anchor); for semi-monthly/monthly, the calendar period
 * containing today.
 */
export function computeCurrentPayPeriod(caregiver: CaregiverProfile, today: Date = new Date()): PayPeriodRange {
  switch (caregiver.pay_frequency) {
    case 'weekly':
    case 'biweekly': {
      const lengthDays = caregiver.pay_frequency === 'weekly' ? 7 : 14
      if (caregiver.pay_period_anchor === 'end_day') {
        const end = nearestWeekday(today, caregiver.pay_period_end_day ?? 6, 'next')
        return { start: toIso(subDays(end, lengthDays - 1)), end: toIso(end) }
      }
      const start = nearestWeekday(today, caregiver.pay_period_start_day, 'previous')
      return { start: toIso(start), end: toIso(addDays(start, lengthDays - 1)) }
    }
    case 'semi_monthly': {
      const dayOfMonth = getDate(today)
      if (dayOfMonth <= 15) {
        return { start: toIso(startOfMonth(today)), end: toIso(setDate(today, 15)) }
      }
      return { start: toIso(setDate(today, 16)), end: toIso(endOfMonth(today)) }
    }
    case 'monthly':
    default:
      return { start: toIso(startOfMonth(today)), end: toIso(endOfMonth(today)) }
  }
}

/**
 * Extends a period backward to pick up any gap since the last period that
 * was already generated, so a missed pay run gets caught up in one go
 * instead of needing a separate timesheet per skipped period.
 */
export function catchUpPayPeriod(
  caregiver: CaregiverProfile,
  lastPeriodEnd: string | null,
  today: Date = new Date()
): PayPeriodRange {
  const current = computeCurrentPayPeriod(caregiver, today)
  if (!lastPeriodEnd) return current
  const resumeStart = toIso(addDays(new Date(`${lastPeriodEnd}T00:00:00`), 1))
  return { start: resumeStart < current.end ? resumeStart : current.start, end: current.end }
}
