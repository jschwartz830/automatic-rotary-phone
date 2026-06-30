import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { LeaveRequest, PaymentRecord, TimeEntry, Timesheet } from './types'

export interface ReminderCard {
  id: string
  type: string
  severity: 'info' | 'warning' | 'urgent'
  message: string
}

/**
 * Computes in-app reminder cards client-side, per spec section 21. GitHub
 * Pages has no backend cron, so these are recalculated whenever the app is
 * opened rather than pushed proactively.
 */
export function computeReminders(input: {
  today: Date
  timeEntries: TimeEntry[]
  timesheets: Timesheet[]
  leaveRequests: LeaveRequest[]
  paymentRecords: PaymentRecord[]
}): ReminderCard[] {
  const { today, timeEntries, timesheets, leaveRequests, paymentRecords } = input
  const cards: ReminderCard[] = []

  // Per spec 21, this should fire "after scheduled shift end plus grace
  // period," but reminders are computed without schedule context here. As a
  // stand-in, treat 12 hours since clock-in as the grace period -- long
  // enough that someone still mid-shift isn't flagged, short enough to catch
  // a forgotten clock-out same day or the day after.
  const MISSING_CLOCK_OUT_GRACE_HOURS = 12
  for (const entry of timeEntries) {
    if (entry.clock_in_at && !entry.clock_out_at) {
      const hoursSinceClockIn = (today.getTime() - new Date(entry.clock_in_at).getTime()) / 3_600_000
      if (hoursSinceClockIn >= MISSING_CLOCK_OUT_GRACE_HOURS) {
        cards.push({
          id: `missing-clock-out-${entry.id}`,
          type: 'missing_clock_out',
          severity: 'warning',
          message: `Clock-out missing for ${entry.date}.`,
        })
      }
    }
  }

  for (const ts of timesheets) {
    if (ts.status === 'draft' && differenceInCalendarDays(today, parseISO(ts.period_end)) >= 0) {
      cards.push({
        id: `unsubmitted-${ts.id}`,
        type: 'unsubmitted_timesheet',
        severity: 'warning',
        message: `Timesheet for ${ts.period_start} – ${ts.period_end} has not been submitted.`,
      })
    }
    if (ts.status === 'submitted') {
      cards.push({
        id: `pending-approval-${ts.id}`,
        type: 'pending_timesheet_approval',
        severity: 'info',
        message: `Timesheet for ${ts.period_start} – ${ts.period_end} is ready for review.`,
      })
    }
  }

  for (const lr of leaveRequests) {
    if (lr.status === 'requested') {
      cards.push({
        id: `pto-pending-${lr.id}`,
        type: 'pending_pto_request',
        severity: 'info',
        message: `${lr.leave_type.toUpperCase()} request pending for ${lr.start_date}.`,
      })
    }
    if (lr.status === 'approved' && differenceInCalendarDays(parseISO(lr.start_date), today) <= 7 && differenceInCalendarDays(parseISO(lr.start_date), today) >= 0) {
      cards.push({
        id: `upcoming-pto-${lr.id}`,
        type: 'upcoming_pto',
        severity: 'info',
        message: `Upcoming ${lr.leave_type} starting ${lr.start_date}.`,
      })
    }
  }

  for (const pr of paymentRecords) {
    if (pr.status === 'paid' || pr.status === 'voided') continue
    const daysUntilDue = differenceInCalendarDays(parseISO(pr.due_date), today)
    if (daysUntilDue < 0) {
      cards.push({
        id: `payment-overdue-${pr.id}`,
        type: 'payment_overdue',
        severity: 'urgent',
        message: `Payment for ${pr.period_start} – ${pr.period_end} is overdue.`,
      })
    } else if (daysUntilDue === 0) {
      cards.push({
        id: `payment-due-today-${pr.id}`,
        type: 'payment_due',
        severity: 'warning',
        message: `Payment for ${pr.period_start} – ${pr.period_end} is due today.`,
      })
    } else if (daysUntilDue === 1) {
      cards.push({
        id: `payment-due-tomorrow-${pr.id}`,
        type: 'payment_due',
        severity: 'info',
        message: `Payment for ${pr.period_start} – ${pr.period_end} is due tomorrow.`,
      })
    }
  }

  return cards
}
