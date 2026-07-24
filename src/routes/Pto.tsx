import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { isValidCalendarDate } from '../lib/dates'
import { useLeavePolicies } from '../lib/useLeavePolicies'
import { computeLeaveBalance, computeLeaveBalanceFromLedger, type LeaveBalancePolicy } from '../lib/leave'
import { downloadCsv } from '../lib/csv'
import { Card, Button, Field, inputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import { StatusChip } from '../components/StatusChip'
import type { LeaveLedgerEntry, LeaveRequest, LeaveType } from '../lib/types'

const LEAVE_TYPES: LeaveType[] = ['pto', 'sick', 'unpaid', 'holiday', 'other_paid']
const BALANCE_TYPES: LeaveType[] = ['pto', 'sick']

export function Pto() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { household, isNanny, isParentOrCoAdmin, caregiverProfile } = useHousehold()
  const { caregivers } = useCaregivers(household?.id)
  const [caregiverId, setCaregiverId] = useState<string | null>(null)
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<LeaveLedgerEntry[]>([])
  const [showForm, setShowForm] = useState(false)
  const [leaveType, setLeaveType] = useState<LeaveType>('pto')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [hours, setHours] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { policies } = useLeavePolicies(caregiverId)

  const activeCaregiver = isNanny ? caregiverProfile : caregivers.find((c) => c.id === caregiverId) ?? null

  useEffect(() => {
    if (isNanny && caregiverProfile) {
      setCaregiverId(caregiverProfile.id)
    } else if (!caregiverId && caregivers.length > 0) {
      setCaregiverId(caregivers[0].id)
    }
  }, [caregivers, isNanny, caregiverProfile, caregiverId])

  async function loadRequests(forCaregiverId: string) {
    const [requestsRes, ledgerRes] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('*')
        .eq('caregiver_id', forCaregiverId)
        .order('start_date', { ascending: false }),
      supabase
        .from('leave_ledger')
        .select('*')
        .eq('caregiver_id', forCaregiverId)
        .order('event_date', { ascending: true }),
    ])
    setRequests((requestsRes.data ?? []) as LeaveRequest[])
    setLedgerEntries((ledgerRes.data ?? []) as LeaveLedgerEntry[])
  }

  useEffect(() => {
    if (caregiverId) loadRequests(caregiverId)
  }, [caregiverId])

  // Spec 13.7: every leave event that hits 'approved' must produce a
  // leave_ledger row -- the balance display switches entirely to ledger-based
  // math as soon as one exists for a policy (see Balances render below), so a
  // request approved without a matching ledger entry silently vanishes from
  // the total.
  async function writeUsedLedgerEntry(request: {
    caregiver_id: string
    leave_type: LeaveType
    start_date: string
    hours_requested: number | null
    id: string
  }) {
    if (!request.hours_requested) return
    const policy = policies.find((p) => p.leave_type === request.leave_type)
    if (!policy) return
    const { data: ledgerRows } = await supabase
      .from('leave_ledger')
      .select('hours_delta')
      .eq('caregiver_id', request.caregiver_id)
      .eq('leave_policy_id', policy.id)
    const currentBalance = (ledgerRows ?? []).reduce((sum: number, r: { hours_delta: number }) => sum + r.hours_delta, 0)
    await supabase.from('leave_ledger').insert({
      caregiver_id: request.caregiver_id,
      leave_policy_id: policy.id,
      event_date: request.start_date,
      event_type: 'used',
      hours_delta: -request.hours_requested,
      balance_after: currentBalance - request.hours_requested,
      related_leave_request_id: request.id,
      created_by: user?.id ?? null,
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!caregiverId || !household) return
    if (!isValidCalendarDate(startDate) || (endDate && !isValidCalendarDate(endDate))) {
      setError('That date does not exist. Please pick a valid date.')
      return
    }

    const policy = policies.find((p) => p.leave_type === leaveType)
    if (policy?.waiting_period_days && activeCaregiver?.start_date) {
      const eligibleFrom = addDays(new Date(activeCaregiver.start_date), policy.waiting_period_days)
      if (new Date(startDate) < eligibleFrom) {
        setError(`Not eligible for ${leaveType.replace(/_/g, ' ')} until ${format(eligibleFrom, 'yyyy-MM-dd')} (waiting period).`)
        return
      }
    }
    if (policy && !policy.negative_balance_allowed && hours) {
      const policyLedger = ledgerEntries.filter((e) => e.leave_policy_id === policy.id)
      const balancePolicy: LeaveBalancePolicy = {
        leave_type: leaveType,
        reset_month: policy.reset_month,
        reset_day: policy.reset_day,
        annual_allowance_hours: policy.annual_allowance_hours,
      }
      const balance =
        policyLedger.length > 0
          ? computeLeaveBalanceFromLedger(balancePolicy, policyLedger)
          : computeLeaveBalance(balancePolicy, requests)
      const available = balance.allowanceHours != null ? balance.allowanceHours - balance.usedHours : Infinity
      if (Number(hours) > available) {
        setError(
          `Only ${Math.max(available, 0).toFixed(2)} hrs of ${leaveType.replace(/_/g, ' ')} available; negative balances aren't allowed for this leave type.`
        )
        return
      }
    }

    setSubmitting(true)
    setError(null)
    try {
      const { data: request, error: insertError } = await supabase
        .from('leave_requests')
        .insert({
          caregiver_id: caregiverId,
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate || startDate,
          hours_requested: hours ? Number(hours) : null,
          status: isParentOrCoAdmin ? 'approved' : 'requested',
          requested_by: user?.id ?? null,
          reviewed_by: isParentOrCoAdmin ? user?.id ?? null : null,
          reviewed_at: isParentOrCoAdmin ? new Date().toISOString() : null,
        })
        .select()
        .single()
      if (insertError) throw insertError

      if (request.status === 'approved') {
        await writeUsedLedgerEntry(request)
      }

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'leave_request',
        entityId: request.id,
        action: 'create',
        after: { leaveType, startDate, endDate, hours },
      })

      setShowForm(false)
      setHours('')
      await loadRequests(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not submit request.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function reviewRequest(request: LeaveRequest, status: 'approved' | 'rejected') {
    await supabase
      .from('leave_requests')
      .update({ status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq('id', request.id)

    if (status === 'approved') {
      await writeUsedLedgerEntry(request)
    }

    if (caregiverId) await loadRequests(caregiverId)
  }

  // Spec 13.11: PTO ledger CSV export, Parent Admin / Co-Admin only.
  function exportLedger() {
    const policyById = Object.fromEntries(policies.map((p) => [p.id, p]))
    downloadCsv(
      `pto-ledger-${activeCaregiver?.name ?? caregiverId}.csv`,
      ledgerEntries.map((e) => ({
        event_date: e.event_date,
        leave_type: policyById[e.leave_policy_id]?.leave_type ?? '',
        event_type: e.event_type,
        hours_delta: e.hours_delta,
        balance_after: e.balance_after,
        notes: e.notes ?? '',
      }))
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">PTO &amp; Leave</h1>
        <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Request'}
        </Button>
      </div>

      {isParentOrCoAdmin && (
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-900">
          <button
            type="button"
            onClick={() => navigate('/time')}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400"
          >
            Time
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
          >
            PTO
          </button>
        </div>
      )}

      {isParentOrCoAdmin && <CaregiverSelect caregivers={caregivers} value={caregiverId} onChange={setCaregiverId} />}

      {caregiverId && (
        <Card
          title="Balances"
          action={
            isParentOrCoAdmin &&
            ledgerEntries.length > 0 && (
              <button className="text-xs text-blue-600 underline dark:text-blue-400" onClick={exportLedger}>
                Export ledger CSV
              </button>
            )
          }
        >
          <div className="space-y-3">
            {BALANCE_TYPES.map((type) => {
              const policy: LeaveBalancePolicy = policies.find((p) => p.leave_type === type) ?? {
                leave_type: type,
                reset_month: null,
                reset_day: null,
                annual_allowance_hours: null,
              }
              const policyLedger = ledgerEntries.filter((e) => e.leave_policy_id === (policies.find((p) => p.leave_type === type)?.id))
              const balance = policyLedger.length > 0
                ? computeLeaveBalanceFromLedger(policy, policyLedger)
                : computeLeaveBalance(policy, requests)
              return (
                <div key={type}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium capitalize text-gray-900 dark:text-gray-100">{type}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {balance.allowanceHours != null
                        ? `${balance.usedHours.toFixed(2)} / ${balance.allowanceHours.toFixed(2)} hrs used`
                        : `${balance.usedHours.toFixed(2)} hrs used this year`}
                    </p>
                  </div>
                  {balance.allowanceHours != null && (
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                      <div
                        className="h-full rounded-full bg-gray-900 dark:bg-gray-100"
                        style={{
                          width: `${Math.min((balance.usedHours / balance.allowanceHours) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {showForm && (
        <Card title={isParentOrCoAdmin ? 'Record leave' : 'Request leave'}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="Type">
              <select className={inputClass} value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <div className="space-y-3">
              <Field label="Start date">
                <input
                  type="date"
                  className={inputClass}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </Field>
              <Field label="End date">
                <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Hours">
              <input
                type="number"
                step="0.25"
                min="0"
                className={inputClass}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </Field>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Saving…' : 'Submit'}
            </Button>
          </form>
        </Card>
      )}

      {requests.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400">No leave requests yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <Card key={r.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold capitalize text-gray-900 dark:text-gray-100">{r.leave_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {r.start_date}
                    {r.end_date !== r.start_date ? ` – ${r.end_date}` : ''} · {r.hours_requested ?? '—'} hrs
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip status={r.status} />
                  {isParentOrCoAdmin && r.status === 'requested' && (
                    <>
                      <button className="text-xs text-green-600 underline dark:text-green-400" onClick={() => reviewRequest(r, 'approved')}>
                        Approve
                      </button>
                      <button className="text-xs text-red-600 underline dark:text-red-400" onClick={() => reviewRequest(r, 'rejected')}>
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
