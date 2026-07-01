import type { LeaveLedgerEntry, LeavePolicy, LeaveRequest } from './types'

export type LeaveBalancePolicy = Pick<LeavePolicy, 'leave_type' | 'reset_month' | 'reset_day' | 'annual_allowance_hours'>

export interface LeaveBalance {
  allowanceHours: number | null
  usedHours: number
  remainingHours: number | null
  periodStart: string
  periodEnd: string
}

/** Start of the current policy year as of `today`, given a policy's reset month/day (defaults to Jan 1). */
function policyYearStart(policy: LeaveBalancePolicy, today: Date): Date {
  const resetMonth = (policy.reset_month ?? 1) - 1
  const resetDay = policy.reset_day ?? 1
  let start = new Date(today.getFullYear(), resetMonth, resetDay)
  if (start > today) start = new Date(today.getFullYear() - 1, resetMonth, resetDay)
  return start
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Balance computed from the leave_ledger event log (spec §13.7).
 * `balance` = sum of all hours_delta rows for this policy.
 * `usedHours` = sum of negative deltas (used events) in the current policy year.
 */
export function computeLeaveBalanceFromLedger(
  policy: LeaveBalancePolicy,
  ledgerEntries: LeaveLedgerEntry[],
  today: Date = new Date()
): LeaveBalance {
  const start = policyYearStart(policy, today)
  const end = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate())
  const periodStart = toIsoDate(start)
  const periodEnd = toIsoDate(new Date(end.getTime() - 1))

  const currentBalance = ledgerEntries.reduce((sum, e) => sum + e.hours_delta, 0)
  const usedInPeriod = ledgerEntries
    .filter((e) => e.event_date >= periodStart && e.event_date <= periodEnd && e.hours_delta < 0)
    .reduce((sum, e) => sum + Math.abs(e.hours_delta), 0)

  const allowanceHours = policy.annual_allowance_hours
  return {
    allowanceHours,
    usedHours: usedInPeriod,
    remainingHours: allowanceHours == null ? currentBalance : Math.max(currentBalance, 0),
    periodStart,
    periodEnd,
  }
}

/**
 * Fallback: balance for a front-loaded-annual leave policy computed from
 * leave_requests directly. Used when no ledger entries exist yet (e.g. policy
 * created before migration 0010 ran).
 */
export function computeLeaveBalance(
  policy: LeaveBalancePolicy,
  leaveRequests: LeaveRequest[],
  today: Date = new Date()
): LeaveBalance {
  const start = policyYearStart(policy, today)
  const end = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate())
  const periodStart = toIsoDate(start)
  const periodEnd = toIsoDate(new Date(end.getTime() - 1))

  const usedHours = leaveRequests
    .filter((r) => r.leave_type === policy.leave_type)
    .filter((r) => r.status === 'approved' || r.status === 'used')
    .filter((r) => r.start_date >= periodStart && r.start_date <= periodEnd)
    .reduce((sum, r) => sum + (r.hours_requested ?? 0), 0)

  const allowanceHours = policy.annual_allowance_hours
  return {
    allowanceHours,
    usedHours,
    remainingHours: allowanceHours == null ? null : Math.max(allowanceHours - usedHours, 0),
    periodStart,
    periodEnd,
  }
}
