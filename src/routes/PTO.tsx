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
import { SwipeRow } from '../components/SwipeRow'
import { Modal } from '../components/Modal'
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
  const [detailId, setDetailId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const { policies } = useLeavePolicies(caregiverId)

  const activeCaregiver = isNanny ? caregiverProfile : caregivers.find((c) => c.id === caregiverId) ?? null
  // Spec 11/15.4: nanny_can_view_pto_balance only restricts the nanny's own
  // view -- a parent/co-admin always sees it regardless of the flag.
  const showPtoBalance = !isNanny || activeCaregiver?.nanny_can_view_pto_balance !== false
  // Archiving an approved request reverses its ledger hours (see
  // archiveRequest), so the request-based balance fallback has to drop
  // archived rows too or the two ways of computing a balance disagree.
  const unarchivedRequests = requests.filter((r) => !r.archived_at)

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
    closeDetail()
  }, [caregiverId])

  /** Current balance for one policy, read fresh so appended rows stack correctly. */
  async function policyBalance(forCaregiverId: string, leavePolicyId: string): Promise<number> {
    const { data } = await supabase
      .from('leave_ledger')
      .select('hours_delta')
      .eq('caregiver_id', forCaregiverId)
      .eq('leave_policy_id', leavePolicyId)
    return (data ?? []).reduce((sum: number, r: { hours_delta: number }) => sum + r.hours_delta, 0)
  }

  // Spec 13.7: every leave event that hits 'approved' must produce a
  // leave_ledger row -- the balance display switches entirely to ledger-based
  // math as soon as one exists for a policy (see Balances render below), so a
  // request approved without a matching ledger entry silently vanishes from
  // the total.
  async function applyUsedLedger(
    request: { caregiver_id: string; id: string },
    leave: { leave_type: LeaveType; start_date: string; hours_requested: number | null },
    eventType: 'used' | 'correction',
    notes: string | null = null
  ) {
    if (!leave.hours_requested) return
    const policy = policies.find((p) => p.leave_type === leave.leave_type)
    if (!policy) return
    const currentBalance = await policyBalance(request.caregiver_id, policy.id)
    await supabase.from('leave_ledger').insert({
      caregiver_id: request.caregiver_id,
      leave_policy_id: policy.id,
      event_date: leave.start_date,
      event_type: eventType,
      hours_delta: -leave.hours_requested,
      balance_after: currentBalance - leave.hours_requested,
      related_leave_request_id: request.id,
      created_by: user?.id ?? null,
      notes,
    })
  }

  // Ledger rows are append-only (see leave_ledger RLS), so undoing a request's
  // effect on the balance -- because it was edited, archived, or restored --
  // can't mutate the original 'used' row. Instead we net out everything the
  // request has already contributed per policy and post a single balancing
  // 'reversal'. Netting (rather than reversing each 'used' row) is what makes
  // this safe to call repeatedly: a request edited twice, or edited and then
  // archived, ends up at exactly zero either way.
  async function zeroOutLedgerForRequest(request: LeaveRequest, notes: string) {
    const { data } = await supabase
      .from('leave_ledger')
      .select('*')
      .eq('related_leave_request_id', request.id)
    const rows = (data ?? []) as LeaveLedgerEntry[]

    const netByPolicy = new Map<string, number>()
    for (const row of rows) {
      netByPolicy.set(row.leave_policy_id, (netByPolicy.get(row.leave_policy_id) ?? 0) + row.hours_delta)
    }

    for (const [leavePolicyId, net] of netByPolicy) {
      if (Math.abs(net) < 0.005) continue
      const currentBalance = await policyBalance(request.caregiver_id, leavePolicyId)
      await supabase.from('leave_ledger').insert({
        caregiver_id: request.caregiver_id,
        leave_policy_id: leavePolicyId,
        event_date: format(new Date(), 'yyyy-MM-dd'),
        event_type: 'reversal',
        hours_delta: -net,
        balance_after: currentBalance - net,
        related_leave_request_id: request.id,
        created_by: user?.id ?? null,
        notes,
      })
    }
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
          : computeLeaveBalance(balancePolicy, unarchivedRequests)
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
        await applyUsedLedger(request, request, 'used')
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
    setError(null)
    try {
      const { error: updateError } = await supabase
        .from('leave_requests')
        .update({ status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
        .eq('id', request.id)
      if (updateError) throw updateError

      if (status === 'approved') {
        await applyUsedLedger(request, request, 'used')
      } else {
        // A request that was approved and is now rejected must give its hours
        // back; a no-op for one that was never approved.
        await zeroOutLedgerForRequest(request, 'Reversal for rejected leave')
      }

      await logAuditEvent({
        householdId: household?.id ?? '',
        actorUserId: user?.id ?? '',
        entityType: 'leave_request',
        entityId: request.id,
        action: status === 'approved' ? 'approve' : 'reject',
        before: { status: request.status },
        after: { status },
      })

      if (caregiverId) await loadRequests(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not update request.'))
    }
  }

  function openDetail(request: LeaveRequest) {
    setShowForm(false)
    setDetailId(request.id)
    setLeaveType(request.leave_type)
    setStartDate(request.start_date)
    setEndDate(request.end_date)
    setHours(request.hours_requested != null ? String(request.hours_requested) : '')
    setError(null)
  }

  function closeDetail() {
    setDetailId(null)
    setLeaveType('pto')
    setStartDate('')
    setEndDate('')
    setHours('')
    setError(null)
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault()
    const original = requests.find((r) => r.id === detailId)
    if (!detailId || !original || !caregiverId || !household) return
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
        .eq('id', detailId)
      if (updateError) throw updateError

      // An archived request contributes nothing to the balance, so editing one
      // must not re-apply its hours -- only a live approved request gets its
      // ledger effect rewritten.
      if (original.status === 'approved' && !original.archived_at) {
        await zeroOutLedgerForRequest(original, 'Reversal for edited PTO entry')
        await applyUsedLedger(
          original,
          { leave_type: leaveType, start_date: startDate, hours_requested: newHours },
          'correction',
          'Corrected PTO entry'
        )
      }

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'leave_request',
        entityId: detailId,
        action: 'update',
        before: {
          leaveType: original.leave_type,
          startDate: original.start_date,
          endDate: original.end_date,
          hours: original.hours_requested,
        },
        after: { leaveType, startDate, endDate, hours: newHours },
      })

      closeDetail()
      await loadRequests(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not save changes.'))
    } finally {
      setSubmitting(false)
    }
  }

  // Archiving is reversible and works from any status -- including 'approved',
  // which is the whole point: a parent who recorded leave that never happened
  // needs it gone. Archiving an approved request also hands its hours back
  // (and unarchiving takes them again), so the balance always matches what's
  // actually on the list.
  async function archiveRequest(request: LeaveRequest) {
    if (!household) return
    setArchivingId(request.id)
    setError(null)
    try {
      const { error: archiveError } = await supabase
        .from('leave_requests')
        .update({ archived_at: new Date().toISOString(), archived_by: user?.id ?? null })
        .eq('id', request.id)
      if (archiveError) throw archiveError

      if (request.status === 'approved') {
        await zeroOutLedgerForRequest(request, 'Reversal for archived PTO entry')
      }

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'leave_request',
        entityId: request.id,
        action: 'archive',
        before: { status: request.status, hours: request.hours_requested },
      })
      if (detailId === request.id) closeDetail()
      if (caregiverId) await loadRequests(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not archive entry.'))
    } finally {
      setArchivingId(null)
    }
  }

  async function unarchiveRequest(request: LeaveRequest) {
    if (!household) return
    setArchivingId(request.id)
    setError(null)
    try {
      const { error: unarchiveError } = await supabase
        .from('leave_requests')
        .update({ archived_at: null, archived_by: null })
        .eq('id', request.id)
      if (unarchiveError) throw unarchiveError

      if (request.status === 'approved') {
        await applyUsedLedger(request, request, 'correction', 'Restored archived PTO entry')
      }

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'leave_request',
        entityId: request.id,
        action: 'unarchive',
      })
      if (caregiverId) await loadRequests(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not restore entry.'))
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

  function canEdit(request: LeaveRequest) {
    return isParentOrCoAdmin || (isNanny && request.status === 'requested' && !request.archived_at)
  }

  const detailRequest = requests.find((r) => r.id === detailId) ?? null

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">PTO &amp; Leave</h1>
        <Button
          variant="secondary"
          onClick={() => {
            if (detailId) closeDetail()
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
                : computeLeaveBalance(policy, unarchivedRequests)
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

      {showForm && (
        <Card title={isParentOrCoAdmin ? 'Record leave' : 'Request leave'}>
          <form onSubmit={handleSubmit} className="space-y-3">
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
            {isParentOrCoAdmin && (
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
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Saving…' : 'Submit'}
            </Button>
          </form>
        </Card>
      )}

      {error && !showForm && !detailId && <p className="px-1 text-sm text-red-600 dark:text-red-400">{error}</p>}

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
            <p className="px-1 text-[11px] text-gray-400 dark:text-gray-500">
              Tap an entry for details. Swipe left to archive
              {isParentOrCoAdmin ? ', swipe right to approve' : ''}.
            </p>
            {visibleRequests.map((r) => (
              <SwipeRow
                key={r.id}
                className="rounded-2xl"
                contentClassName=""
                openLabel={`Open ${formatLeaveType(r.leave_type)} leave for ${r.start_date}`}
                onOpen={() => openDetail(r)}
                leadingAction={
                  isParentOrCoAdmin && r.status === 'requested' && !r.archived_at
                    ? { label: 'Approve', tone: 'approve', onAction: () => reviewRequest(r, 'approved') }
                    : null
                }
                trailingActions={
                  isParentOrCoAdmin
                    ? [
                        r.archived_at
                          ? {
                              label: 'Restore',
                              tone: 'restore' as const,
                              onAction: () => unarchiveRequest(r),
                              disabled: archivingId === r.id,
                            }
                          : {
                              label: 'Archive',
                              tone: 'archive' as const,
                              onAction: () => archiveRequest(r),
                              disabled: archivingId === r.id,
                            },
                      ]
                    : []
                }
              >
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatLeaveType(r.leave_type)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {r.start_date}
                        {r.end_date !== r.start_date ? ` – ${r.end_date}` : ''} · {r.hours_requested ?? '—'} hrs
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {r.archived_at && <span className="text-[11px] text-gray-400 dark:text-gray-500">Archived</span>}
                      <StatusChip status={r.status} />
                      {isParentOrCoAdmin && r.status === 'requested' && !r.archived_at && (
                        <button
                          className="text-xs text-green-600 underline dark:text-green-400"
                          onClick={(e) => {
                            e.stopPropagation()
                            reviewRequest(r, 'approved')
                          }}
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              </SwipeRow>
            ))}
          </div>
        )
      })()}

      {detailRequest && (
        <Modal title="Leave details" onClose={closeDetail}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusChip status={detailRequest.status} />
              {detailRequest.archived_at && (
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  Archived {detailRequest.archived_at.slice(0, 10)}
                </span>
              )}
            </div>

            {canEdit(detailRequest) ? (
              <form onSubmit={handleEditSubmit} className="space-y-3">
                <Field label="Type">
                  <select className={inputClass} value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
                    {LEAVE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {formatLeaveType(t)}
                      </option>
                    ))}
                  </select>
                </Field>
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
                  {submitting ? 'Saving…' : 'Save changes'}
                </Button>
              </form>
            ) : (
              <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                <p>{formatLeaveType(detailRequest.leave_type)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {detailRequest.start_date}
                  {detailRequest.end_date !== detailRequest.start_date ? ` – ${detailRequest.end_date}` : ''} ·{' '}
                  {detailRequest.hours_requested ?? '—'} hrs
                </p>
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              </div>
            )}

            {isParentOrCoAdmin && (
              <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
                {detailRequest.status === 'requested' && !detailRequest.archived_at && (
                  <>
                    <Button className="flex-1" onClick={() => reviewRequest(detailRequest, 'approved')}>
                      Approve
                    </Button>
                    <Button variant="secondary" className="flex-1" onClick={() => reviewRequest(detailRequest, 'rejected')}>
                      Reject
                    </Button>
                  </>
                )}
                {detailRequest.archived_at ? (
                  <Button
                    variant="secondary"
                    className="flex-1"
                    disabled={archivingId === detailRequest.id}
                    onClick={() => unarchiveRequest(detailRequest)}
                  >
                    {archivingId === detailRequest.id ? 'Restoring…' : 'Restore'}
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    className="flex-1"
                    disabled={archivingId === detailRequest.id}
                    onClick={() => archiveRequest(detailRequest)}
                  >
                    {archivingId === detailRequest.id ? 'Archiving…' : 'Archive'}
                  </Button>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
