import { addDays, differenceInCalendarDays, endOfMonth, format, getDate, getDay, parseISO, setDate, startOfMonth, subDays } from 'date-fns'
import type { CaregiverProfile, PaymentMethodLabel } from './types'

// Spec 13.8 "Payment method label" -- centralized so the caregiver settings
// form and the Pay screen's payment rows can't drift out of sync on display
// text.
const PAYMENT_METHOD_LABELS: Record<PaymentMethodLabel, string> = {
  zelle: 'Zelle',
  venmo: 'Venmo',
  check: 'Check',
  bank_transfer: 'Bank transfer',
  payroll_provider: 'Payroll provider',
  cash: 'Cash',
  other: 'Other',
}

export function formatPaymentMethod(label: PaymentMethodLabel | null): string | null {
  if (!label) return null
  return PAYMENT_METHOD_LABELS[label] ?? label
}

// Spec 17 "Payment Status" defines upcoming/due/overdue purely from
// due_date vs. today -- but every payment_records insert site stores a flat
// 'due' regardless of date, so those three are computed for display here
// rather than trusted from the stored column. Statuses outside that trio
// (partially_paid/paid/corrected/voided) are date-independent and pass
// through unchanged.
export function paymentDisplayStatus(status: string, dueDate: string, today: Date = new Date()): string {
  if (status !== 'due') return status
  const daysUntilDue = differenceInCalendarDays(parseISO(dueDate), today)
  if (daysUntilDue > 0) return 'upcoming'
  if (daysUntilDue < 0) return 'overdue'
  return 'due'
}

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
