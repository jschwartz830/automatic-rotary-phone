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
import { computeLeaveBalance, computeLeaveBalanceFromLedger, formatLeaveType, type LeaveBalancePolicy } from '../lib/leave'
import { downloadCsv } from '../lib/csv'
import { Card, Button, Field, inputClass, dateInputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import { StatusChip } from '../components/StatusChip'
import type { LeaveLedgerEntry, LeaveRequest, LeaveType } from '../lib/types'

const LEAVE_TYPES: LeaveType[] = ['pto', 'sick', 'unpaid', 'holiday', 'other_paid']
const BALANCE_TYPES: LeaveType[] = ['pto', 'sick']

export function PTO() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { household, isNanny, isParentOrCoAdmin, coadminAllowed, caregiverProfile } = useHousehold()
  const canExport = isParentOrCoAdmin && coadminAllowed('export_records')
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
  const [isRetroactive, setIsRetroactive] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const { policies } = useLeavePolicies(caregiverId)

  const activeCaregiver = isNanny ? caregiverProfile : caregivers.find((c) => c.id === caregiverId) ?? null
  // Spec 11/15.4: nanny_can_view_pto_balance only restricts the nanny's own
  // view -- a parent/co-admin always sees it regardless of the flag.
  const showPtoBalance = !isNanny || activeCaregiver?.nanny_can_view_pto_balance !== false

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
    setShowForm(false)
    cancelEdit()
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

  // Ledger rows are append-only (see leave_ledger RLS), so editing an
  // already-approved request's hours/type/date can't just mutate the
  // original 'used' row -- it reverses it and writes a fresh 'correction',
  // both event types the schema already reserves for exactly this.
  async function adjustLedgerForEdit(
    original: LeaveRequest,
    updated: { leave_type: LeaveType; start_date: string; hours_requested: number | null }
  ) {
    const { data: relatedRows } = await supabase
      .from('leave_ledger')
      .select('*')
      .eq('related_leave_request_id', original.id)
      .eq('event_type', 'used')
    const related = (relatedRows ?? []) as LeaveLedgerEntry[]

    for (const entry of related) {
      const { data: ledgerRows } = await supabase
        .from('leave_ledger')
        .select('hours_delta')
        .eq('caregiver_id', original.caregiver_id)
        .eq('leave_policy_id', entry.leave_policy_id)
      const currentBalance = (ledgerRows ?? []).reduce((sum: number, r: { hours_delta: number }) => sum + r.hours_delta, 0)
      await supabase.from('leave_ledger').insert({
        caregiver_id: original.caregiver_id,
        leave_policy_id: entry.leave_policy_id,
        event_date: format(new Date(), 'yyyy-MM-dd'),
        event_type: 'reversal',
        hours_delta: -entry.hours_delta,
        balance_after: currentBalance - entry.hours_delta,
        related_leave_request_id: original.id,
        created_by: user?.id ?? null,
        notes: 'Reversal for edited PTO entry',
      })
    }

    if (!updated.hours_requested) return
    const newPolicy = policies.find((p) => p.leave_type === updated.leave_type)
    if (!newPolicy) return
    const { data: ledgerRows } = await supabase
      .from('leave_ledger')
      .select('hours_delta')
      .eq('caregiver_id', original.caregiver_id)
      .eq('leave_policy_id', newPolicy.id)
    const currentBalance = (ledgerRows ?? []).reduce((sum: number, r: { hours_delta: number }) => sum + r.hours_delta, 0)
    await supabase.from('leave_ledger').insert({
      caregiver_id: original.caregiver_id,
      leave_policy_id: newPolicy.id,
      event_date: updated.start_date,
      event_type: 'correction',
      hours_delta: -updated.hours_requested,
      balance_after: currentBalance - updated.hours_requested,
      related_leave_request_id: original.id,
      created_by: user?.id ?? null,
      notes: 'Corrected PTO entry',
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
    // A retroactive entry is logging leave that was already taken, not
    // requesting new leave -- eligibility and available-balance are
    // forward-looking guards that shouldn't block correcting the record to
    // match reality (the balance is still allowed to go negative from it).
    if (!isRetroactive && policy?.waiting_period_days && activeCaregiver?.start_date) {
      const eligibleFrom = addDays(new Date(activeCaregiver.start_date), policy.waiting_period_days)
      if (new Date(startDate) < eligibleFrom) {
        setError(`Not eligible for ${formatLeaveType(leaveType)} until ${format(eligibleFrom, 'yyyy-MM-dd')} (waiting period).`)
        return
      }
    }
    if (!isRetroactive && policy && !policy.negative_balance_allowed && hours) {
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
          `Only ${Math.max(available, 0).toFixed(2)} hrs of ${formatLeaveType(leaveType)} available; negative balances aren't allowed for this leave type. Check "already taken" to record it anyway.`
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
        after: { leaveType, startDate, endDate, hours, retroactive: isRetroactive },
      })

      setShowForm(false)
      setHours('')
      setIsRetroactive(false)
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

  function startEdit(request: LeaveRequest) {
    setShowForm(false)
    setEditingId(request.id)
    setLeaveType(request.leave_type)
    setStartDate(request.start_date)
    setEndDate(request.end_date)
    setHours(request.hours_requested != null ? String(request.hours_requested) : '')
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setLeaveType('pto')
    setStartDate('')
    setEndDate('')
    setHours('')
    setError(null)
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault()
    const original = requests.find((r) => r.id === editingId)
    if (!editingId || !original || !caregiverId || !household) return
    if (!isValidCalendarDate(startDate) || (endDate && !isValidCalendarDate(endDate))) {
      setError('That date does not exist. Please pick a valid date.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const newHours = hours ? Number(hours) : null
      const { error: updateError } = await supabase
        .from('leave_requests')
        .update({
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate || startDate,
          hours_requested: newHours,
        })
        .eq('id', editingId)
      if (updateError) throw updateError

      if (original.status === 'approved') {
        await adjustLedgerForEdit(original, { leave_type: leaveType, start_date: startDate, hours_requested: newHours })
      }

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'leave_request',
        entityId: editingId,
        action: 'update',
        before: {
          leaveType: original.leave_type,
          startDate: original.start_date,
          endDate: original.end_date,
          hours: original.hours_requested,
        },
        after: { leaveType, startDate, endDate, hours: newHours },
      })

      cancelEdit()
      await loadRequests(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not save changes.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function archiveRequest(request: LeaveRequest) {
    if (!household) return
    setArchivingId(request.id)
    try {
      await supabase
        .from('leave_requests')
        .update({ archived_at: new Date().toISOString(), archived_by: user?.id ?? null })
        .eq('id', request.id)
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'leave_request',
        entityId: request.id,
        action: 'archive',
      })
      if (caregiverId) await loadRequests(caregiverId)
    } finally {
      setArchivingId(null)
    }
  }

  async function unarchiveRequest(request: LeaveRequest) {
    if (!household) return
    setArchivingId(request.id)
    try {
      await supabase
        .from('leave_requests')
        .update({ archived_at: null, archived_by: null })
        .eq('id', request.id)
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'leave_request',
        entityId: request.id,
        action: 'unarchive',
      })
      if (caregiverId) await loadRequests(caregiverId)
    } finally {
      setArchivingId(null)
    }
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
        <Button
          variant="secondary"
          onClick={() => {
            if (editingId) cancelEdit()
            setShowForm((s) => !s)
          }}
        >
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
            canExport &&
            ledgerEntries.length > 0 && (
              <button className="text-xs text-blue-600 underline dark:text-blue-400" onClick={exportLedger}>
                Export ledger CSV
              </button>
            )
          }
        >
          {!showPtoBalance ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Balance hidden by household settings.</p>
          ) : (
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
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatLeaveType(type)}</p>
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
          )}
        </Card>
      )}

      {(showForm || editingId) && (
        <Card title={editingId ? 'Edit leave' : isParentOrCoAdmin ? 'Record leave' : 'Request leave'}>
          <form onSubmit={editingId ? handleEditSubmit : handleSubmit} className="space-y-3">
            <Field label="Type">
              <select className={inputClass} value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {formatLeaveType(t)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="space-y-3">
              <Field label="Start date">
                <input
                  type="date"
                  className={dateInputClass}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </Field>
              <Field label="End date">
                <input type="date" className={dateInputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
            {!editingId && isParentOrCoAdmin && (
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={isRetroactive}
                  onChange={(e) => setIsRetroactive(e.target.checked)}
                />
                This was already taken (retroactive entry)
              </label>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex gap-2">
              {editingId && (
                <Button type="button" variant="secondary" className="flex-1" onClick={cancelEdit}>
                  Cancel
                </Button>
              )}
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Submit'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {requests.some((r) => r.archived_at) && (
        <label className="flex items-center justify-end gap-2 text-xs text-gray-500 dark:text-gray-400">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      )}

      {(() => {
        const visibleRequests = requests.filter((r) => showArchived || !r.archived_at)
        if (visibleRequests.length === 0) {
          return (
            <Card>
              <p className="text-sm text-gray-500 dark:text-gray-400">No leave requests yet.</p>
            </Card>
          )
        }
        return (
          <div className="space-y-2">
            {visibleRequests.map((r) => (
              <Card key={r.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatLeaveType(r.leave_type)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {r.start_date}
                      {r.end_date !== r.start_date ? ` – ${r.end_date}` : ''} · {r.hours_requested ?? '—'} hrs
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip status={r.status} />
                    {r.archived_at && <span className="text-[11px] text-gray-400 dark:text-gray-500">Archived</span>}
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
                    {isParentOrCoAdmin && r.status === 'approved' && !r.archived_at && (
                      <>
                        <button className="text-xs text-blue-600 underline dark:text-blue-400" onClick={() => startEdit(r)}>
                          Edit
                        </button>
                        <button
                          className="text-xs text-gray-500 underline disabled:opacity-50 dark:text-gray-400"
                          disabled={archivingId === r.id}
                          onClick={() => archiveRequest(r)}
                        >
                          Archive
                        </button>
                      </>
                    )}
                    {isParentOrCoAdmin && r.archived_at && (
                      <button
                        className="text-xs text-gray-500 underline disabled:opacity-50 dark:text-gray-400"
                        disabled={archivingId === r.id}
                        onClick={() => unarchiveRequest(r)}
                      >
                        Unarchive
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
