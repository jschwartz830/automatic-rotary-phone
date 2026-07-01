import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { CaregiverProfile, LeaveRequest, PaymentRecord, TimeEntry, Timesheet } from './types'
import type { GeneratedShiftOccurrence } from './schedule'

const DEFAULT_PAYMENT_REMINDER_DAYS_BEFORE = [0, 1]

// Spec 15.14 lists "pto_balance_low" as a reminder type but doesn't define a
// threshold. One workday's worth of hours remaining is a reasonable, simple
// default -- see SPEC_CHANGE_LOG.md.
const LOW_BALANCE_THRESHOLD_HOURS = 8

export interface ReminderCard {
  id: string
  type: string
  severity: 'info' | 'warning' | 'urgent'
  message: string
}

export interface LeaveBalanceSummary {
  caregiverId: string
  leaveType: string
  remainingHours: number | null
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
  caregivers?: CaregiverProfile[]
  scheduleOccurrences?: GeneratedShiftOccurrence[]
  leaveBalances?: LeaveBalanceSummary[]
}): ReminderCard[] {
  const { today, timeEntries, timesheets, leaveRequests, paymentRecords, caregivers, scheduleOccurrences, leaveBalances } = input
  // Index schedule occurrences by date for O(1) lookup
  const occurrencesByDate = new Map<string, GeneratedShiftOccurrence[]>()
  for (const occ of scheduleOccurrences ?? []) {
    const list = occurrencesByDate.get(occ.date) ?? []
    list.push(occ)
    occurrencesByDate.set(occ.date, list)
  }
  const cards: ReminderCard[] = []
  const reminderDaysByCaregiver = new Map(
    (caregivers ?? []).map((c) => [
      c.id,
      c.payment_reminder_days_before?.length ? c.payment_reminder_days_before : DEFAULT_PAYMENT_REMINDER_DAYS_BEFORE,
    ])
  )

  // Per spec 21, fire after scheduled shift end + 30 min grace. When no
  // schedule occurrence exists for that date, fall back to 12 h since clock-in.
  const FALLBACK_GRACE_HOURS = 12
  const SCHEDULE_GRACE_MINUTES = 30
  for (const entry of timeEntries) {
    if (!entry.clock_in_at || entry.clock_out_at) continue
    const clockInTime = new Date(entry.clock_in_at)
    const occs = occurrencesByDate.get(entry.date)
    let thresholdMs: number
    if (occs && occs.length > 0) {
      // Use the latest shift end time on that day + grace
      const latestEndMinutes = Math.max(
        ...occs.map((o) => {
          const [h, m] = o.shift.end_time.split(':').map(Number)
          return h * 60 + m
        })
      )
      const entryDate = parseISO(entry.date)
      const shiftEndMs =
        new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate()).getTime() +
        latestEndMinutes * 60_000
      thresholdMs = shiftEndMs + SCHEDULE_GRACE_MINUTES * 60_000
    } else {
      thresholdMs = clockInTime.getTime() + FALLBACK_GRACE_HOURS * 3_600_000
    }
    if (today.getTime() >= thresholdMs) {
      cards.push({
        id: `missing-clock-out-${entry.id}`,
        type: 'missing_clock_out',
        severity: 'warning',
        message: `Clock-out missing for ${entry.date}.`,
      })
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
      continue
    }
    const leadDays = reminderDaysByCaregiver.get(pr.caregiver_id) ?? DEFAULT_PAYMENT_REMINDER_DAYS_BEFORE
    if (!leadDays.includes(daysUntilDue)) continue
    if (daysUntilDue === 0) {
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
    } else {
      cards.push({
        id: `payment-due-soon-${pr.id}-${daysUntilDue}`,
        type: 'payment_due',
        severity: 'info',
        message: `Payment for ${pr.period_start} – ${pr.period_end} is due in ${daysUntilDue} days.`,
      })
    }
  }

  for (const balance of leaveBalances ?? []) {
    if (balance.remainingHours == null) continue
    if (balance.remainingHours <= LOW_BALANCE_THRESHOLD_HOURS) {
      cards.push({
        id: `pto-balance-low-${balance.caregiverId}-${balance.leaveType}`,
        type: 'pto_balance_low',
        severity: balance.remainingHours <= 0 ? 'warning' : 'info',
        message:
          balance.remainingHours <= 0
            ? `${balance.leaveType.toUpperCase()} balance is used up.`
            : `${balance.leaveType.toUpperCase()} balance is low: ${balance.remainingHours.toFixed(1)} hrs left.`,
      })
    }
  }

  return cards
}
