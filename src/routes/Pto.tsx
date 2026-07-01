import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { isValidCalendarDate } from '../lib/dates'
import { useLeavePolicies } from '../lib/useLeavePolicies'
import { computeLeaveBalance, type LeaveBalancePolicy } from '../lib/leave'
import { Card, Button, Field, inputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import { StatusChip } from '../components/StatusChip'
import type { LeaveRequest, LeaveType } from '../lib/types'

const LEAVE_TYPES: LeaveType[] = ['pto', 'sick', 'unpaid', 'holiday', 'other_paid']
const BALANCE_TYPES: LeaveType[] = ['pto', 'sick']

export function Pto() {
  const { user } = useAuth()
  const { household, isNanny, isParentOrCoAdmin, caregiverProfile } = useHousehold()
  const { caregivers } = useCaregivers(household?.id)
  const [caregiverId, setCaregiverId] = useState<string | null>(null)
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [showForm, setShowForm] = useState(false)
  const [leaveType, setLeaveType] = useState<LeaveType>('pto')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [hours, setHours] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { policies, refresh: refreshPolicies } = useLeavePolicies(caregiverId)
  const [allowanceDrafts, setAllowanceDrafts] = useState<Record<string, string>>({})
  const [savingPolicy, setSavingPolicy] = useState<LeaveType | null>(null)

  useEffect(() => {
    if (isNanny && caregiverProfile) {
      setCaregiverId(caregiverProfile.id)
    } else if (!caregiverId && caregivers.length > 0) {
      setCaregiverId(caregivers[0].id)
    }
  }, [caregivers, isNanny, caregiverProfile, caregiverId])

  useEffect(() => {
    const drafts: Record<string, string> = {}
    for (const type of BALANCE_TYPES) {
      const policy = policies.find((p) => p.leave_type === type)
      drafts[type] = policy?.annual_allowance_hours?.toString() ?? ''
    }
    setAllowanceDrafts(drafts)
  }, [policies])

  async function loadRequests(forCaregiverId: string) {
    const { data } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('caregiver_id', forCaregiverId)
      .order('start_date', { ascending: false })
    setRequests((data ?? []) as LeaveRequest[])
  }

  useEffect(() => {
    if (caregiverId) loadRequests(caregiverId)
  }, [caregiverId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!caregiverId || !household) return
    if (!isValidCalendarDate(startDate) || (endDate && !isValidCalendarDate(endDate))) {
      setError('That date does not exist. Please pick a valid date.')
      return
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

  async function saveAllowance(type: LeaveType) {
    if (!caregiverId || !household) return
    setSavingPolicy(type)
    try {
      const draft = allowanceDrafts[type] ?? ''
      const newHours = draft ? Number(draft) : null
      const existingPolicy = policies.find((p) => p.leave_type === type)
      const { data: upsertedRows, error: upsertError } = await supabase
        .from('leave_policies')
        .upsert(
          {
            caregiver_id: caregiverId,
            leave_type: type,
            accrual_method: 'front_loaded_annual',
            annual_allowance_hours: newHours,
          },
          { onConflict: 'caregiver_id,leave_type' }
        )
        .select()
      if (upsertError) throw upsertError

      // Write an opening_balance ledger event when the policy is first created,
      // or a manual_adjustment when the allowance changes.
      if (newHours != null) {
        const policyId = (upsertedRows?.[0] as { id?: string } | null)?.id ?? existingPolicy?.id
        if (policyId) {
          const isNew = !existingPolicy
          const { data: ledgerRows } = await supabase
            .from('leave_ledger')
            .select('hours_delta')
            .eq('caregiver_id', caregiverId)
            .eq('leave_policy_id', policyId)
          const currentBalance = (ledgerRows ?? []).reduce((sum: number, r: { hours_delta: number }) => sum + r.hours_delta, 0)
          const delta = isNew ? newHours : newHours - (existingPolicy?.annual_allowance_hours ?? 0)
          if (delta !== 0) {
            await supabase.from('leave_ledger').insert({
              caregiver_id: caregiverId,
              leave_policy_id: policyId,
              event_date: new Date().toISOString().slice(0, 10),
              event_type: isNew ? 'opening_balance' : 'manual_adjustment',
              hours_delta: delta,
              balance_after: currentBalance + delta,
              created_by: user?.id ?? null,
              notes: isNew ? `Initial ${type} allowance set to ${newHours} hrs` : `Allowance updated from ${existingPolicy?.annual_allowance_hours ?? 0} to ${newHours} hrs`,
            })
          }
        }
      }

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'leave_policy',
        entityId: caregiverId,
        action: 'update',
        after: { leaveType: type, annualAllowanceHours: draft },
      })

      await refreshPolicies()
    } catch (err) {
      setError(errorMessage(err, 'Could not save allowance.'))
    } finally {
      setSavingPolicy(null)
    }
  }

  async function reviewRequest(request: LeaveRequest, status: 'approved' | 'rejected') {
    await supabase
      .from('leave_requests')
      .update({ status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq('id', request.id)

    if (status === 'approved' && request.hours_requested) {
      // Write a leave_ledger event so the balance is event-sourced per spec 13.7.
      const policy = policies.find((p) => p.leave_type === request.leave_type)
      if (policy) {
        // Compute running balance from existing ledger
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
    }

    if (caregiverId) await loadRequests(caregiverId)
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">PTO &amp; Leave</h1>
        <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Request'}
        </Button>
      </div>

      {isParentOrCoAdmin && <CaregiverSelect caregivers={caregivers} value={caregiverId} onChange={setCaregiverId} />}

      {caregiverId && (
        <Card title="Balances">
          <div className="space-y-3">
            {BALANCE_TYPES.map((type) => {
              const policy: LeaveBalancePolicy = policies.find((p) => p.leave_type === type) ?? {
                leave_type: type,
                reset_month: null,
                reset_day: null,
                annual_allowance_hours: null,
              }
              const balance = computeLeaveBalance(policy, requests)
              return (
                <div key={type}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium capitalize text-gray-900">{type}</p>
                    <p className="text-xs text-gray-500">
                      {balance.allowanceHours != null
                        ? `${balance.usedHours.toFixed(2)} / ${balance.allowanceHours.toFixed(2)} hrs used`
                        : `${balance.usedHours.toFixed(2)} hrs used this year`}
                    </p>
                  </div>
                  {balance.allowanceHours != null && (
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-gray-900"
                        style={{
                          width: `${Math.min((balance.usedHours / balance.allowanceHours) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  )}
                  {isParentOrCoAdmin && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className={`${inputClass} flex-1`}
                        placeholder="Annual hours allowed"
                        value={allowanceDrafts[type] ?? ''}
                        onChange={(e) => setAllowanceDrafts((d) => ({ ...d, [type]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="text-xs text-blue-600 underline disabled:opacity-50"
                        disabled={savingPolicy === type}
                        onClick={() => saveAllowance(type)}
                      >
                        {savingPolicy === type ? 'Saving…' : 'Save'}
                      </button>
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
            <div className="flex gap-3">
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Saving…' : 'Submit'}
            </Button>
          </form>
        </Card>
      )}

      {requests.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">No leave requests yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <Card key={r.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold capitalize text-gray-900">{r.leave_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-500">
                    {r.start_date}
                    {r.end_date !== r.start_date ? ` – ${r.end_date}` : ''} · {r.hours_requested ?? '—'} hrs
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip status={r.status} />
                  {isParentOrCoAdmin && r.status === 'requested' && (
                    <>
                      <button className="text-xs text-green-600 underline" onClick={() => reviewRequest(r, 'approved')}>
                        Approve
                      </button>
                      <button className="text-xs text-red-600 underline" onClick={() => reviewRequest(r, 'rejected')}>
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
