import { addDays, format, parseISO } from 'date-fns'
import type { LeaveRequest, PaymentRecord, TimeEntry, Timesheet } from './types'

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
      const dayEntries = entries.filter((entry) => entry.date === date)
      const dayLeave = leaveRequests.filter((leave) => date >= leave.start_date && date <= leave.end_date)
      const leaveHours = (type: LeaveRequest['leave_type']) =>
        dayLeave.filter((leave) => leave.leave_type === type).reduce((sum, leave) => sum + leaveHoursForDate(leave, date), 0)
      const entryDetails = dayEntries
        .map((entry) => `${entry.manual_start_time ?? entry.clock_in_at ?? ''}–${entry.manual_end_time ?? entry.clock_out_at ?? ''}`)
        .join('; ')

      return {
        record_type: recordType,
        period_start: record.period_start,
        period_end: record.period_end,
        date,
        hours_worked: dayEntries.reduce((sum, entry) => sum + (entry.paid_hours ?? 0), 0),
        time_entry_count: dayEntries.length,
        time_entry_times: entryDetails,
        pto_hours: leaveHours('pto'),
        sick_hours: leaveHours('sick'),
        holiday_hours: leaveHours('holiday'),
        unpaid_time_off_hours: leaveHours('unpaid'),
        other_paid_time_off_hours: leaveHours('other_paid'),
        time_off_notes: dayLeave.map((leave) => leave.nanny_note ?? leave.parent_note ?? '').filter(Boolean).join('; '),
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
