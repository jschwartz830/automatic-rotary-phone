import { toIsoDate } from './dates'
import type { LeaveLedgerEntry, LeavePolicy, LeaveRequest, LeaveType } from './types'

export type LeaveBalancePolicy = Pick<LeavePolicy, 'leave_type' | 'reset_month' | 'reset_day' | 'annual_allowance_hours'>

// 'pto' renders as the acronym everywhere it's shown to a user; the rest are
// title-cased. Centralized so the PTO screen, caregiver settings, and
// anywhere else a leave type is displayed can't drift back out of sync.
const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  pto: 'PTO',
  sick: 'Sick',
  unpaid: 'Unpaid',
  holiday: 'Holiday',
  other_paid: 'Other Paid',
}
export function formatLeaveType(type: LeaveType): string {
  return LEAVE_TYPE_LABELS[type] ?? type
}

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


/**
 * Balance computed from the leave_ledger event log (spec §13.7).
 * `balance` = sum of all hours_delta rows for this policy.
 * `usedHours` = net hours used in the current policy year (see below).
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
  const inPeriod = (date: string) => date >= periodStart && date <= periodEnd

  // Rows tied to a leave request are netted per request: editing or archiving
  // one appends a positive 'reversal' (see PTO.tsx zeroOutLedgerForRequest),
  // and counting only the negative rows would leave the original hours
  // "used" forever -- and add them again each time the entry is switched
  // back to this type. A request's net usage is dated by its latest
  // used/correction row, i.e. the leave's current start date.
  const byRequest = new Map<string, LeaveLedgerEntry[]>()
  let usedInPeriod = 0
  for (const e of ledgerEntries) {
    if (e.related_leave_request_id) {
      const rows = byRequest.get(e.related_leave_request_id) ?? []
      rows.push(e)
      byRequest.set(e.related_leave_request_id, rows)
    } else if (e.hours_delta < 0 && inPeriod(e.event_date)) {
      usedInPeriod += Math.abs(e.hours_delta)
    }
  }
  for (const rows of byRequest.values()) {
    const net = rows.reduce((sum, e) => sum + e.hours_delta, 0)
    if (net >= -0.005) continue
    const latest = rows
      .filter((e) => e.event_type === 'used' || e.event_type === 'correction')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .at(-1)
    if (inPeriod((latest ?? rows[0]).event_date)) usedInPeriod += -net
  }

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
    // An archived request has had its ledger hours handed back (see
    // PTO.tsx archiveRequest), so it must not count against the balance here
    // either -- callers that pass unfiltered leaveRequests would otherwise
    // disagree with the ledger-based balance above.
    .filter((r) => !r.archived_at)
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
