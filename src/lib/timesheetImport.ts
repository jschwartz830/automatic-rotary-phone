import { isValidCalendarDate } from './dates'
import { parseCsv } from './csv'
import type { Timesheet, TimesheetStatus } from './types'

export type ImportedTimesheet = Pick<
  Timesheet,
  | 'period_start'
  | 'period_end'
  | 'status'
  | 'scheduled_hours'
  | 'guaranteed_hours'
  | 'actual_worked_hours'
  | 'regular_worked_hours'
  | 'overtime_worked_hours'
  | 'paid_pto_hours'
  | 'paid_sick_hours'
  | 'paid_holiday_hours'
  | 'family_cancellation_hours'
  | 'unpaid_time_off_hours'
  | 'guarantee_adjustment_hours'
  | 'payable_regular_hours'
  | 'payable_overtime_hours'
  | 'hourly_rate'
  | 'overtime_rate'
  | 'gross_pay_due'
  | 'reimbursements'
  | 'manual_adjustments'
>

const statuses: TimesheetStatus[] = ['draft', 'submitted', 'needs_correction', 'approved', 'payment_due', 'paid', 'locked']

function numberValue(row: Record<string, string>, key: string, fallback = 0): number {
  const value = row[key]
  if (value === undefined || value.trim() === '') return fallback
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`Invalid number for ${key}.`)
  return number
}

function optionalNumber(row: Record<string, string>, key: string): number | null {
  const value = row[key]
  if (value === undefined || value.trim() === '') return null
  return numberValue(row, key)
}

/**
 * Accepts the daily-detail timesheet CSV exported by this app. Rows from the
 * same period are consolidated into one timesheet using their repeated
 * period-level values, so a detailed export can be imported without editing.
 */
export function parseTimesheetImport(text: string): ImportedTimesheet[] {
  const rows = parseCsv(text)
  if (rows.length === 0) throw new Error('The CSV does not contain any data rows.')
  if (!rows.every((row) => row.period_start && row.period_end)) {
    throw new Error('The CSV must include period_start and period_end columns.')
  }
  if (rows.some((row) => row.record_type && row.record_type !== 'timesheet')) {
    throw new Error('Only a timesheet daily-detail CSV can be imported.')
  }
  const periods = new Map<string, Record<string, string>>()
  for (const row of rows) {
    const key = `${row.period_start}|${row.period_end}`
    if (!periods.has(key)) periods.set(key, row)
  }
  return [...periods.values()].map((row) => {
    if (!isValidCalendarDate(row.period_start) || !isValidCalendarDate(row.period_end) || row.period_start > row.period_end) {
      throw new Error(`Invalid pay period ${row.period_start}–${row.period_end}.`)
    }
    const status = (row.record_status || row.status || 'approved') as TimesheetStatus
    if (!statuses.includes(status)) throw new Error(`Invalid timesheet status "${status}".`)
    const periodNumber = (name: string, legacyName = name) => numberValue(row, name, numberValue(row, legacyName))
    return {
      period_start: row.period_start,
      period_end: row.period_end,
      status,
      scheduled_hours: periodNumber('scheduled_hours_period'),
      guaranteed_hours: periodNumber('guaranteed_hours_period'),
      actual_worked_hours: periodNumber('actual_worked_hours_period', 'actual_worked_hours'),
      regular_worked_hours: periodNumber('regular_worked_hours_period'),
      overtime_worked_hours: periodNumber('overtime_worked_hours_period', 'overtime_worked_hours'),
      paid_pto_hours: periodNumber('paid_pto_hours_period'),
      paid_sick_hours: periodNumber('paid_sick_hours_period'),
      paid_holiday_hours: periodNumber('paid_holiday_hours_period'),
      family_cancellation_hours: periodNumber('family_cancellation_hours_period'),
      unpaid_time_off_hours: periodNumber('unpaid_time_off_hours_period'),
      guarantee_adjustment_hours: periodNumber('guarantee_adjustment_hours_period'),
      payable_regular_hours: periodNumber('payable_regular_hours_period'),
      payable_overtime_hours: periodNumber('payable_overtime_hours_period'),
      hourly_rate: optionalNumber(row, 'hourly_rate'),
      overtime_rate: optionalNumber(row, 'overtime_rate'),
      gross_pay_due: periodNumber('gross_pay_due'),
      reimbursements: periodNumber('reimbursements'),
      manual_adjustments: periodNumber('manual_adjustments'),
    }
  })
}
