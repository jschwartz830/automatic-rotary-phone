import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { hoursBetween } from '../lib/calc'
import { isValidCalendarDate } from '../lib/dates'
import { Card, Button, Field, inputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import { StatusChip } from '../components/StatusChip'
import type { TimeEntry } from '../lib/types'

export function Time() {
  const { user } = useAuth()
  const { household, isNanny, isParentOrCoAdmin, caregiverProfile } = useHousehold()
  const { caregivers } = useCaregivers(household?.id)
  const [caregiverId, setCaregiverId] = useState<string | null>(null)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [breakMinutes, setBreakMinutes] = useState('0')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNanny && caregiverProfile) {
      setCaregiverId(caregiverProfile.id)
    } else if (!caregiverId && caregivers.length > 0) {
      setCaregiverId(caregivers[0].id)
    }
  }, [caregivers, isNanny, caregiverProfile, caregiverId])

  async function loadEntries(forCaregiverId: string) {
    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .eq('caregiver_id', forCaregiverId)
      .order('date', { ascending: false })
      .limit(30)
    setEntries((data ?? []) as TimeEntry[])
  }

  useEffect(() => {
    if (caregiverId) loadEntries(caregiverId)
  }, [caregiverId])

  async function handleAddEntry(e: FormEvent) {
    e.preventDefault()
    if (!caregiverId || !household) return
    if (!isValidCalendarDate(date)) {
      setError('That date does not exist. Please pick a valid date.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const paidHours = hoursBetween(startTime, endTime, Number(breakMinutes) || 0)
      const { data: entry, error: insertError } = await supabase
        .from('time_entries')
        .insert({
          caregiver_id: caregiverId,
          date,
          manual_start_time: startTime,
          manual_end_time: endTime,
          break_minutes: Number(breakMinutes) || 0,
          paid_hours: paidHours,
          method: 'manual',
          status: 'submitted',
          nanny_note: isNanny ? note || null : null,
          parent_note: !isNanny ? note || null : null,
          created_by: user?.id ?? null,
        })
        .select()
        .single()
      if (insertError) throw insertError

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'time_entry',
        entityId: entry.id,
        action: 'create',
        after: { date, startTime, endTime, paidHours },
      })

      setShowForm(false)
      setNote('')
      await loadEntries(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not add time entry.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function approveEntry(entryId: string) {
    await supabase.from('time_entries').update({ status: 'approved' }).eq('id', entryId)
    if (caregiverId) await loadEntries(caregiverId)
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Time</h1>
        <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add time'}
        </Button>
      </div>

      {isParentOrCoAdmin && <CaregiverSelect caregivers={caregivers} value={caregiverId} onChange={setCaregiverId} />}

      {showForm && (
        <Card title="Manual time entry">
          <form onSubmit={handleAddEntry} className="space-y-3">
            <Field label="Date">
              <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <div className="flex gap-3">
              <Field label="Start">
                <input type="time" className={inputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </Field>
              <Field label="End">
                <input type="time" className={inputClass} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </Field>
            </div>
            <Field label="Unpaid break (minutes)">
              <input
                type="number"
                min="0"
                className={inputClass}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
              />
            </Field>
            <Field label="Note (optional)">
              <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <p className="text-xs text-gray-500">
              {hoursBetween(startTime, endTime, Number(breakMinutes) || 0).toFixed(2)} paid hours
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save entry'}
            </Button>
          </form>
        </Card>
      )}

      {entries.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">No time entries yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{entry.date}</p>
                  <p className="text-xs text-gray-500">
                    {entry.manual_start_time ?? '—'}–{entry.manual_end_time ?? '—'} ·{' '}
                    {entry.paid_hours?.toFixed(2) ?? '0.00'} hrs
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip status={entry.status} />
                  {isParentOrCoAdmin && entry.status === 'submitted' && (
                    <button className="text-xs text-blue-600 underline" onClick={() => approveEntry(entry.id)}>
                      Approve
                    </button>
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
