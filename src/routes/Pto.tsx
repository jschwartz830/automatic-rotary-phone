import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { Card, Button, Field, inputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import { StatusChip } from '../components/StatusChip'
import type { LeaveRequest, LeaveType } from '../lib/types'

const LEAVE_TYPES: LeaveType[] = ['pto', 'sick', 'unpaid', 'holiday', 'other_paid']

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

  useEffect(() => {
    if (isNanny && caregiverProfile) {
      setCaregiverId(caregiverProfile.id)
    } else if (!caregiverId && caregivers.length > 0) {
      setCaregiverId(caregivers[0].id)
    }
  }, [caregivers, isNanny, caregiverProfile, caregiverId])

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
      setError(err instanceof Error ? err.message : 'Could not submit request.')
    } finally {
      setSubmitting(false)
    }
  }

  async function reviewRequest(request: LeaveRequest, status: 'approved' | 'rejected') {
    await supabase
      .from('leave_requests')
      .update({ status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq('id', request.id)
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
