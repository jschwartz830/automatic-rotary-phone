import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { hoursBetween, round2 } from '../lib/calc'
import { isValidCalendarDate } from '../lib/dates'
import { generateShiftsForRange } from '../lib/schedule'
import { Card, Button, Field, inputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import { StatusChip } from '../components/StatusChip'
import type { ScheduleShift, ScheduleTemplate, TimeEntry } from '../lib/types'

const DEFAULT_START_TIME = '09:00'
const DEFAULT_END_TIME = '17:00'

export function Time() {
  const { user } = useAuth()
  const { household, isNanny, isParentOrCoAdmin, caregiverProfile } = useHousehold()
  const { caregivers } = useCaregivers(household?.id)
  const [caregiverId, setCaregiverId] = useState<string | null>(null)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([])
  const [shiftsByTemplate, setShiftsByTemplate] = useState<Record<string, ScheduleShift[]>>({})
  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME)
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME)
  const [breakMinutes, setBreakMinutes] = useState('0')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clockNote, setClockNote] = useState('')
  const [clockSubmitting, setClockSubmitting] = useState(false)

  useEffect(() => {
    if (isNanny && caregiverProfile) {
      setCaregiverId(caregiverProfile.id)
    } else if (!caregiverId && caregivers.length > 0) {
      setCaregiverId(caregivers[0].id)
    }
  }, [caregivers, isNanny, caregiverProfile, caregiverId])

  async function loadSchedule(forCaregiverId: string) {
    const { data: templateRows } = await supabase
      .from('schedule_templates')
      .select('*')
      .eq('caregiver_id', forCaregiverId)
      .eq('active', true)
      .order('created_at')
    const ts = (templateRows ?? []) as ScheduleTemplate[]
    setTemplates(ts)

    if (ts.length > 0) {
      const { data: shiftRows } = await supabase
        .from('schedule_shifts')
        .select('*')
        .in('schedule_template_id', ts.map((t) => t.id))
      const grouped: Record<string, ScheduleShift[]> = {}
      for (const shift of (shiftRows ?? []) as ScheduleShift[]) {
        grouped[shift.schedule_template_id] ??= []
        grouped[shift.schedule_template_id].push(shift)
      }
      setShiftsByTemplate(grouped)
    } else {
      setShiftsByTemplate({})
    }
  }

  useEffect(() => {
    if (caregiverId) loadSchedule(caregiverId)
  }, [caregiverId])

  // Pre-fill the manual entry form with the caregiver's scheduled shift for
  // the selected date, so the common case (logging the shift as worked) only
  // needs a date pick rather than retyping hours. Falls back to a sane
  // default when nothing is scheduled that day.
  useEffect(() => {
    if (!isValidCalendarDate(date)) return
    const occurrences = generateShiftsForRange(templates, shiftsByTemplate, date, date)
    const scheduled = occurrences[0]?.shift
    if (scheduled) {
      setStartTime(scheduled.start_time.slice(0, 5))
      setEndTime(scheduled.end_time.slice(0, 5))
      setBreakMinutes(String(scheduled.break_minutes))
    } else {
      setStartTime(DEFAULT_START_TIME)
      setEndTime(DEFAULT_END_TIME)
      setBreakMinutes('0')
    }
  }, [date, templates, shiftsByTemplate])

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

  // Per spec 13.4, only the nanny clocks in/out; parents use manual entry.
  const activeClockEntry = entries.find((e) => e.method === 'clock' && e.clock_in_at && !e.clock_out_at) ?? null

  async function handleClockIn() {
    if (!caregiverId || !household) return
    setClockSubmitting(true)
    setError(null)
    try {
      const { data: entry, error: insertError } = await supabase
        .from('time_entries')
        .insert({
          caregiver_id: caregiverId,
          date: new Date().toISOString().slice(0, 10),
          clock_in_at: new Date().toISOString(),
          method: 'clock',
          status: 'draft',
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
        action: 'clock_in',
        after: { clock_in_at: entry.clock_in_at },
      })

      await loadEntries(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not clock in.'))
    } finally {
      setClockSubmitting(false)
    }
  }

  async function handleClockOut() {
    if (!caregiverId || !household || !activeClockEntry) return
    setClockSubmitting(true)
    setError(null)
    try {
      const clockOutAt = new Date().toISOString()
      const paidHours = round2(
        (new Date(clockOutAt).getTime() - new Date(activeClockEntry.clock_in_at!).getTime()) / 3_600_000
      )
      const { error: updateError } = await supabase
        .from('time_entries')
        .update({
          clock_out_at: clockOutAt,
          paid_hours: Math.max(paidHours, 0),
          status: 'submitted',
          nanny_note: clockNote || null,
          updated_by: user?.id ?? null,
        })
        .eq('id', activeClockEntry.id)
      if (updateError) throw updateError

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'time_entry',
        entityId: activeClockEntry.id,
        action: 'clock_out',
        before: { clock_in_at: activeClockEntry.clock_in_at },
        after: { clock_out_at: clockOutAt, paidHours },
      })

      setClockNote('')
      await loadEntries(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not clock out.'))
    } finally {
      setClockSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Time</h1>
        <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add time'}
        </Button>
      </div>

      {isNanny && (
        <Card title="Clock in / clock out">
          {activeClockEntry ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Clocked in since{' '}
                {new Date(activeClockEntry.clock_in_at!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </p>
              <Field label="Note (optional)">
                <input className={inputClass} value={clockNote} onChange={(e) => setClockNote(e.target.value)} />
              </Field>
              <Button className="w-full" variant="danger" onClick={handleClockOut} disabled={clockSubmitting}>
                {clockSubmitting ? 'Clocking out…' : 'Clock Out'}
              </Button>
            </div>
          ) : (
            <Button className="w-full" onClick={handleClockIn} disabled={clockSubmitting}>
              {clockSubmitting ? 'Clocking in…' : 'Clock In'}
            </Button>
          )}
        </Card>
      )}

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
          {entries.map((entry) => {
            const isActiveClock = entry.id === activeClockEntry?.id
            const displayStart =
              entry.manual_start_time ??
              (entry.clock_in_at ? new Date(entry.clock_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—')
            const displayEnd =
              entry.manual_end_time ??
              (entry.clock_out_at ? new Date(entry.clock_out_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—')
            return (
              <Card key={entry.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{entry.date}</p>
                    <p className="text-xs text-gray-500">
                      {displayStart}–{displayEnd} · {entry.paid_hours?.toFixed(2) ?? '0.00'} hrs
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip status={isActiveClock ? 'clocked_in' : entry.status} />
                    {isParentOrCoAdmin && entry.status === 'submitted' && (
                      <button className="text-xs text-blue-600 underline" onClick={() => approveEntry(entry.id)}>
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
