import { addDays, format, parseISO } from 'date-fns'
import {
  scheduleExceptionHoursDelta,
  shiftHours,
  sumExceptionHoursByType,
  type GeneratedShiftOccurrence,
} from './schedule'
import type { LeaveRequest, PaymentRecord, ScheduleException, ScheduleShift, TimeEntry, Timesheet } from './types'

type PayExportRecord = Timesheet | PaymentRecord

function datesInRange(start: string, end: string): string[] {
  const dates: string[] = []
  for (let date = parseISO(start); date <= parseISO(end); date = addDays(date, 1)) {
    dates.push(format(date, 'yyyy-MM-dd'))
  }
  return dates
}

function leaveHoursForDate(leave: LeaveRequest, date: string): number {
  if (date < leave.start_date || date > leave.end_date || leave.hours_requested == null) return 0
  const days = datesInRange(leave.start_date, leave.end_date).length
  return leave.hours_requested / days
}

// Optional schedule data (a period's active recurring occurrences + approved
// exceptions) used to add per-day scheduled hours and per-day family
// cancellation hours on top of the worked/leave hours every caller already
// gets. The CSV export path (buildDailyPayExportRows) doesn't load this and
// omits both fields, exactly as before this refactor -- only the new in-app
// daily-detail view (Pay.tsx) passes it.
export interface DailyScheduleContext {
  occurrences: GeneratedShiftOccurrence[]
  exceptions: ScheduleException[]
  shiftsById: Record<string, ScheduleShift>
  // Mirrors Pay.tsx's computePeriodTotals gating: family cancellation (and
  // weather emergency) hours only count when the caregiver's guarantee flag
  // is on. Defaults to false (matching computePeriodTotals' ternary) so a
  // caller that omits it doesn't accidentally show paid hours the period
  // total wouldn't credit.
  familyCancellationCountsTowardGuarantee?: boolean
}

// One calendar day's worth of the spec 13.5 per-day breakdown: date,
// scheduled hours, actual clock times, actual worked hours, PTO/sick/
// unpaid/family-cancellation hours, notes, and each time entry's own status.
// Shared building block for the CSV "Daily Detail" export
// (buildDailyPayExportRows) and the in-app daily table on a timesheet's
// detail view (Pay.tsx's DailyDetail) -- both need the same worked/leave
// hours per day, just shaped differently (CSV row vs typed numbers for
// rendering).
export interface DailyBreakdown {
  date: string
  scheduledHours: number | null
  entryTimeRanges: string[]
  entryCount: number
  actualWorkedHours: number
  ptoHours: number
  sickHours: number
  holidayHours: number
  unpaidHours: number
  otherPaidHours: number
  familyCancellationHours: number | null
  leaveNotes: string
  entryNotes: string[]
  entryStatuses: string[]
}

export function computeDailyBreakdown(
  date: string,
  entries: TimeEntry[],
  leaveRequests: LeaveRequest[],
  schedule?: DailyScheduleContext
): DailyBreakdown {
  const dayEntries = entries.filter((entry) => entry.date === date)
  // Mirrors Pay.tsx's computePeriodTotals: only approved entries count toward
  // paid hours, so a day with a pending/rejected entry alongside an approved
  // one doesn't show a "Worked" total that exceeds the period total above it.
  const approvedDayEntries = dayEntries.filter((entry) => entry.status === 'approved')
  const dayLeave = leaveRequests.filter((leave) => date >= leave.start_date && date <= leave.end_date)
  const leaveHours = (type: LeaveRequest['leave_type']) =>
    dayLeave.filter((leave) => leave.leave_type === type).reduce((sum, leave) => sum + leaveHoursForDate(leave, date), 0)

  let scheduledHours: number | null = null
  let familyCancellationHours: number | null = null
  if (schedule) {
    const dayExceptions = schedule.exceptions.filter((e) => e.date === date)
    // Mirrors Pay.tsx's computePeriodTotals: recurring occurrence hours net
    // against the same one-off added/removed/shortened/extended-shift
    // exception delta the period total uses, just scoped to this one date.
    scheduledHours = Math.max(
      schedule.occurrences.filter((o) => o.date === date).reduce((sum, o) => sum + shiftHours(o.shift), 0) +
        scheduleExceptionHoursDelta(dayExceptions, schedule.shiftsById),
      0
    )
    // Mirrors Pay.tsx's computePeriodTotals: weather_emergency folds into the
    // same "didn't work, still paid" bucket as family_cancellation, only
    // exceptions marked affects_pay count, and neither counts at all unless
    // the caregiver's guarantee flag is on.
    familyCancellationHours = schedule.familyCancellationCountsTowardGuarantee
      ? sumExceptionHoursByType(dayExceptions, schedule.shiftsById, 'family_cancellation', { requireAffectsPay: true }) +
        sumExceptionHoursByType(dayExceptions, schedule.shiftsById, 'weather_emergency', { requireAffectsPay: true })
      : 0
  }

  return {
    date,
    scheduledHours,
    entryTimeRanges: dayEntries.map(
      (entry) => `${entry.manual_start_time ?? entry.clock_in_at ?? ''}–${entry.manual_end_time ?? entry.clock_out_at ?? ''}`
    ),
    entryCount: dayEntries.length,
    actualWorkedHours: approvedDayEntries.reduce((sum, entry) => sum + (entry.paid_hours ?? 0), 0),
    ptoHours: leaveHours('pto'),
    sickHours: leaveHours('sick'),
    holidayHours: leaveHours('holiday'),
    unpaidHours: leaveHours('unpaid'),
    otherPaidHours: leaveHours('other_paid'),
    familyCancellationHours,
    leaveNotes: dayLeave.map((leave) => leave.nanny_note ?? leave.parent_note ?? '').filter(Boolean).join('; '),
    entryNotes: dayEntries.map((entry) => entry.nanny_note ?? entry.parent_note ?? '').filter(Boolean),
    entryStatuses: [...new Set(dayEntries.map((entry) => entry.status))],
  }
}

/**
 * Produces one CSV record for each calendar day in every exported pay period.
 * Pay amounts remain period-level values because the pay calculation can include
 * overtime, guarantees, reimbursements, and manual adjustments that cannot be
 * assigned to one particular day without inventing an allocation rule.
 */
export function buildDailyPayExportRows(
  records: PayExportRecord[],
  entries: TimeEntry[],
  leaveRequests: LeaveRequest[],
  recordType: 'timesheet' | 'payment'
): Record<string, unknown>[] {
  return records.flatMap((record) =>
    datesInRange(record.period_start, record.period_end).map((date) => {
      const day = computeDailyBreakdown(date, entries, leaveRequests)

      return {
        record_type: recordType,
        period_start: record.period_start,
        period_end: record.period_end,
        date,
        hours_worked: day.actualWorkedHours,
        time_entry_count: day.entryCount,
        time_entry_times: day.entryTimeRanges.join('; '),
        pto_hours: day.ptoHours,
        sick_hours: day.sickHours,
        holiday_hours: day.holidayHours,
        unpaid_time_off_hours: day.unpaidHours,
        other_paid_time_off_hours: day.otherPaidHours,
        time_off_notes: day.leaveNotes,
        record_status: record.status,
        actual_worked_hours_period: record.actual_worked_hours,
        regular_worked_hours_period: record.regular_worked_hours,
        overtime_worked_hours_period: record.overtime_worked_hours,
        paid_pto_hours_period: record.paid_pto_hours,
        paid_sick_hours_period: record.paid_sick_hours,
        paid_holiday_hours_period: record.paid_holiday_hours,
        family_cancellation_hours_period: record.family_cancellation_hours,
        guaranteed_hours_period: record.guaranteed_hours,
        guarantee_adjustment_hours_period: record.guarantee_adjustment_hours,
        payable_regular_hours_period: record.payable_regular_hours,
        payable_overtime_hours_period: record.payable_overtime_hours,
        hourly_rate: record.hourly_rate,
        overtime_rate: record.overtime_rate,
        gross_pay_due: record.gross_pay_due,
        reimbursements: record.reimbursements,
        manual_adjustments: record.manual_adjustments,
        ...(recordType === 'payment'
          ? {
              due_date: (record as PaymentRecord).due_date,
              payment_status: (record as PaymentRecord).status,
              amount_paid: (record as PaymentRecord).amount_paid,
              paid_at: (record as PaymentRecord).paid_at,
              payment_method: (record as PaymentRecord).payment_method_label,
            }
          : { unpaid_time_off_hours_period: (record as Timesheet).unpaid_time_off_hours }),
      }
    })
  )
}

/**
 * The same per-day breakdown as buildDailyPayExportRows, but for one
 * timesheet, typed for rendering rather than shaped into a CSV row -- spec
 * 13.5's in-app "Timesheet Display" per-day table (QUESTIONS_AND_CLARIFICATIONS.md
 * item 36), nested inside Pay.tsx's timesheet detail view. Unlike the CSV
 * path, this always includes a schedule context so scheduled hours and
 * family-cancellation hours are populated per day, not just left null.
 */
export function buildTimesheetDailyBreakdown(
  timesheet: Timesheet,
  entries: TimeEntry[],
  leaveRequests: LeaveRequest[],
  schedule: DailyScheduleContext
): DailyBreakdown[] {
  return datesInRange(timesheet.period_start, timesheet.period_end).map((date) =>
    computeDailyBreakdown(date, entries, leaveRequests, schedule)
  )
}
