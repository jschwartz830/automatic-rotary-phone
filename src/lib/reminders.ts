import { addDays, differenceInCalendarDays, parseISO, startOfWeek } from 'date-fns'
import type { CaregiverProfile, LeaveRequest, PaymentRecord, ReminderType, ScheduleException, TimeEntry, Timesheet } from './types'
import type { GeneratedShiftOccurrence } from './schedule'

// Spec 15.14's ten reminder types, in schema/check-constraint order. Used to
// drive the per-type enable/disable settings UI (spec 13.9's "Reminder
// Settings" -- see QUESTIONS_AND_CLARIFICATIONS.md items 17/19).
export const REMINDER_TYPE_INFO: { type: ReminderType; label: string }[] = [
  { type: 'missing_clock_out', label: 'Missing clock-out' },
  { type: 'unsubmitted_timesheet', label: 'Timesheet not submitted' },
  { type: 'pending_timesheet_approval', label: 'Timesheet pending approval' },
  { type: 'pending_pto_request', label: 'PTO request pending' },
  { type: 'payment_due', label: 'Payment due soon' },
  { type: 'payment_overdue', label: 'Payment overdue' },
  { type: 'upcoming_pto', label: 'Upcoming PTO' },
  { type: 'schedule_change', label: 'Schedule changed' },
  { type: 'pto_balance_low', label: 'PTO balance low' },
  { type: 'weekly_summary', label: 'Weekly summary' },
]

const DEFAULT_PAYMENT_REMINDER_DAYS_BEFORE = [0, 1]

// Spec 15.14 lists "pto_balance_low" as a reminder type but doesn't define a
// threshold. One workday's worth of hours remaining is a reasonable, simple
// default -- see SPEC_CHANGE_LOG.md.
const LOW_BALANCE_THRESHOLD_HOURS = 8

// Spec 15.14 lists "schedule_change" but doesn't define a lookback window.
// Surfacing changes made in the last few days for a not-yet-passed date keeps
// the card relevant without re-showing every historical exception forever.
const SCHEDULE_CHANGE_LOOKBACK_DAYS = 3
const SCHEDULE_CHANGE_TYPES = new Set(['added_shift', 'removed_shift', 'shortened_shift', 'extended_shift'])

// Spec 21 scopes these four types to "parent alert" only, with no nanny
// mention -- each is a "the parent needs to act" case (pay someone, approve
// a timesheet/PTO request). Hidden from nanny viewers; see computeReminders'
// viewerIsNanny param.
const PARENT_ONLY_REMINDER_TYPES = new Set([
  'payment_due',
  'payment_overdue',
  'pending_timesheet_approval',
  'pending_pto_request',
])

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
  scheduleExceptions?: ScheduleException[]
  disabledTypes?: Set<string>
  // True when the signed-in viewer is the nanny. Spec 21 scopes
  // payment_due/payment_overdue/pending_timesheet_approval/pending_pto_request
  // to "parent alert" only (no nanny mention) -- those are all "the parent
  // needs to act on this" cases, so a nanny viewer never sees them. Types
  // spec 21 explicitly grants to both (missing_clock_out,
  // unsubmitted_timesheet, upcoming_pto) or doesn't scope at all
  // (schedule_change, pto_balance_low) are unaffected.
  viewerIsNanny?: boolean
}): ReminderCard[] {
  const {
    today,
    timeEntries,
    timesheets,
    leaveRequests,
    paymentRecords,
    caregivers,
    scheduleOccurrences,
    leaveBalances,
    scheduleExceptions,
    disabledTypes,
    viewerIsNanny,
  } = input
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

  for (const ex of scheduleExceptions ?? []) {
    if (ex.status !== 'approved' || !SCHEDULE_CHANGE_TYPES.has(ex.exception_type)) continue
    if (differenceInCalendarDays(parseISO(ex.date), today) < 0) continue // don't resurface past shifts
    if (differenceInCalendarDays(today, parseISO(ex.created_at.slice(0, 10))) > SCHEDULE_CHANGE_LOOKBACK_DAYS) continue
    cards.push({
      id: `schedule-change-${ex.id}`,
      type: 'schedule_change',
      severity: 'info',
      message: `Schedule changed for ${ex.date}: ${ex.exception_type.replace(/_/g, ' ')}.`,
    })
  }

  const visibleCards = viewerIsNanny ? cards.filter((c) => !PARENT_ONLY_REMINDER_TYPES.has(c.type)) : cards
  return disabledTypes && disabledTypes.size > 0 ? visibleCards.filter((c) => !disabledTypes.has(c.type)) : visibleCards
}

/**
 * Weekly summary digest (spec 13.9/15.14 `weekly_summary`; content/cadence
 * resolved as QUESTIONS_AND_CLARIFICATIONS.md item 19, option B). One card
 * per caregiver, recomputed live on every Home.tsx load -- there's no
 * separate "first open this week" cache, since the card's numbers are
 * naturally scoped to the calendar week containing `today` and so already
 * change automatically as the week rolls over. Deliberately does NOT split
 * hours into regular/overtime: that split is only authoritative once
 * computed by the real payroll engine (`calc.ts`) over a caregiver's actual
 * pay period, which may be biweekly and rarely lines up with a calendar
 * week -- approximating it here risked showing a number that quietly
 * disagreed with Pay.tsx. See SPEC_CHANGE_LOG.md for the full writeup.
 */
export function buildWeeklySummaryCards(input: {
  today: Date
  weekStartsOn: 0 | 1
  caregivers: CaregiverProfile[]
  timeEntries: TimeEntry[]
  timesheets: Timesheet[]
  paymentRecords: PaymentRecord[]
  leaveBalances: LeaveBalanceSummary[]
  // True when the signed-in viewer is the nanny looking at their own summary
  // card -- gates the gross-pay/PTO lines on the caregiver's own
  // nanny_can_view_* flags (spec 11/15.4). A parent/co-admin viewing the
  // same caregiver's card always sees everything; the flags only restrict
  // what the caregiver themselves sees.
  viewerIsNanny?: boolean
}): ReminderCard[] {
  const { today, weekStartsOn, caregivers, timeEntries, timesheets, paymentRecords, leaveBalances, viewerIsNanny } =
    input
  const weekStart = startOfWeek(today, { weekStartsOn })
  const weekEnd = addDays(weekStart, 6)
  const weekStartStr = weekStart.toISOString().slice(0, 10)
  const weekEndStr = weekEnd.toISOString().slice(0, 10)
  const todayStr = today.toISOString().slice(0, 10)

  return caregivers.map((cg) => {
    const hoursThisWeek = timeEntries
      .filter((e) => e.caregiver_id === cg.id && !e.deleted_at && e.date >= weekStartStr && e.date <= weekEndStr)
      .reduce((sum, e) => sum + (e.paid_hours ?? 0), 0)

    const currentTimesheet = timesheets.find(
      (t) => t.caregiver_id === cg.id && !t.deleted_at && t.period_start <= todayStr && t.period_end >= todayStr
    )

    const upcomingPayment = paymentRecords
      .filter((p) => p.caregiver_id === cg.id && !p.deleted_at && p.status !== 'paid' && p.status !== 'voided')
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]

    const ptoBalance = leaveBalances.find((b) => b.caregiverId === cg.id && b.leaveType === 'pto')
    const sickBalance = leaveBalances.find((b) => b.caregiverId === cg.id && b.leaveType === 'sick')

    const showGrossPay = !viewerIsNanny || cg.nanny_can_view_gross_pay
    const showPtoBalance = !viewerIsNanny || cg.nanny_can_view_pto_balance

    const parts = [
      `${hoursThisWeek.toFixed(1)} hrs logged this week`,
      `timesheet ${currentTimesheet ? currentTimesheet.status.replace(/_/g, ' ') : 'not yet generated'}`,
    ]
    if (upcomingPayment && showGrossPay) parts.push(`$${upcomingPayment.gross_pay_due.toFixed(2)} due ${upcomingPayment.due_date}`)
    if (ptoBalance?.remainingHours != null && showPtoBalance) parts.push(`${ptoBalance.remainingHours.toFixed(1)} PTO hrs left`)
    if (sickBalance?.remainingHours != null && showPtoBalance) parts.push(`${sickBalance.remainingHours.toFixed(1)} sick hrs left`)

    return {
      id: `weekly-summary-${cg.id}-${weekStartStr}`,
      type: 'weekly_summary',
      severity: 'info',
      message: `${cg.name}: ${parts.join(' · ')}.`,
    }
  })
}
