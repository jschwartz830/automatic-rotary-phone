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
import type { ScheduleShift, ScheduleTemplate, TimeEntry, TimeEntryMethod } from '../lib/types'

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

  // Edit state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editBreak, setEditBreak] = useState('0')
  const [editNote, setEditNote] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [showArchive, setShowArchive] = useState(false)

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

  function startEdit(entry: TimeEntry) {
    setEditingEntryId(entry.id)
    setEditDate(entry.date)
    // Prefer stored manual times; fall back to clock times for clock entries.
    setEditStart(
      entry.manual_start_time?.slice(0, 5) ??
        (entry.clock_in_at
          ? new Date(entry.clock_in_at).toTimeString().slice(0, 5)
          : DEFAULT_START_TIME)
    )
    setEditEnd(
      entry.manual_end_time?.slice(0, 5) ??
        (entry.clock_out_at
          ? new Date(entry.clock_out_at).toTimeString().slice(0, 5)
          : DEFAULT_END_TIME)
    )
    setEditBreak(String(entry.break_minutes))
    setEditNote(isNanny ? (entry.nanny_note ?? '') : (entry.parent_note ?? ''))
    setEditError(null)
    setShowForm(false)
  }

  function cancelEdit() {
    setEditingEntryId(null)
    setEditError(null)
  }

  async function handleSaveEdit(entry: TimeEntry) {
    if (!household) return
    if (!isValidCalendarDate(editDate)) {
      setEditError('Invalid date. Please pick a valid date.')
      return
    }
    setEditSaving(true)
    setEditError(null)
    try {
      const paidHours = hoursBetween(editStart, editEnd, Number(editBreak) || 0)
      const methodUpdate: Partial<{ method: TimeEntryMethod }> =
        isParentOrCoAdmin && entry.method === 'clock' ? { method: 'parent_adjustment' } : {}
      const updates = {
        date: editDate,
        manual_start_time: editStart,
        manual_end_time: editEnd,
        break_minutes: Number(editBreak) || 0,
        paid_hours: paidHours,
        updated_by: user?.id ?? null,
        ...(isNanny ? { nanny_note: editNote || null } : { parent_note: editNote || null }),
        ...methodUpdate,
      }
      const { error: updateError } = await supabase
        .from('time_entries')
        .update(updates)
        .eq('id', entry.id)
      if (updateError) throw updateError

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'time_entry',
        entityId: entry.id,
        action: 'update',
        before: {
          date: entry.date,
          manual_start_time: entry.manual_start_time,
          manual_end_time: entry.manual_end_time,
          break_minutes: entry.break_minutes,
          paid_hours: entry.paid_hours,
        },
        after: { date: editDate, manual_start_time: editStart, manual_end_time: editEnd, break_minutes: Number(editBreak) || 0, paid_hours: paidHours },
      })

      setEditingEntryId(null)
      if (caregiverId) await loadEntries(caregiverId)
    } catch (err) {
      setEditError(errorMessage(err, 'Could not save changes.'))
    } finally {
      setEditSaving(false)
    }
  }

  async function handleArchive(entry: TimeEntry) {
    if (!household) return
    const { error: archiveError } = await supabase
      .from('time_entries')
      .update({ deleted_at: new Date().toISOString(), updated_by: user?.id ?? null })
      .eq('id', entry.id)
    if (archiveError) {
      setError(errorMessage(archiveError, 'Could not archive entry.'))
      return
    }
    await logAuditEvent({
      householdId: household.id,
      actorUserId: user?.id ?? '',
      entityType: 'time_entry',
      entityId: entry.id,
      action: 'archive',
      before: { date: entry.date, status: entry.status, paid_hours: entry.paid_hours },
    })
    if (caregiverId) await loadEntries(caregiverId)
  }

  async function handleRestore(entry: TimeEntry) {
    if (!household) return
    const { error: restoreError } = await supabase
      .from('time_entries')
      .update({ deleted_at: null, updated_by: user?.id ?? null })
      .eq('id', entry.id)
    if (restoreError) {
      setError(errorMessage(restoreError, 'Could not restore entry.'))
      return
    }
    await logAuditEvent({
      householdId: household.id,
      actorUserId: user?.id ?? '',
      entityType: 'time_entry',
      entityId: entry.id,
      action: 'restore',
      before: { date: entry.date, status: entry.status, paid_hours: entry.paid_hours },
    })
    if (caregiverId) await loadEntries(caregiverId)
  }

  const activeEntries = entries.filter((e) => !e.deleted_at)
  const archivedEntries = entries.filter((e) => e.deleted_at)

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
              <div className="min-w-0 flex-1">
                <Field label="Start">
                  <input type="time" className={inputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </Field>
              </div>
              <div className="min-w-0 flex-1">
                <Field label="End">
                  <input type="time" className={inputClass} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </Field>
              </div>
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

      {activeEntries.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">No time entries yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {activeEntries.map((entry) => {
            const isActiveClock = entry.id === activeClockEntry?.id
            const isEditing = entry.id === editingEntryId
            const displayStart =
              entry.manual_start_time ??
              (entry.clock_in_at ? new Date(entry.clock_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—')
            const displayEnd =
              entry.manual_end_time ??
              (entry.clock_out_at ? new Date(entry.clock_out_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—')
            const canEdit =
              !isActiveClock &&
              entry.status !== 'locked' &&
              (isParentOrCoAdmin || (isNanny && (entry.status === 'draft' || entry.status === 'submitted')))
            const canArchive =
              !isActiveClock &&
              entry.status !== 'locked' &&
              (isParentOrCoAdmin || (isNanny && (entry.status === 'draft' || entry.status === 'submitted')))

            return (
              <Card key={entry.id}>
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900">Edit entry</p>
                      <button className="text-xs text-gray-500 underline" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                    {entry.clock_in_at && (
                      <p className="text-xs text-gray-400">
                        Original clock: {new Date(entry.clock_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {entry.clock_out_at && ` – ${new Date(entry.clock_out_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                      </p>
                    )}
                    <Field label="Date">
                      <input
                        type="date"
                        className={inputClass}
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                      />
                    </Field>
                    <div className="flex gap-3">
                      <div className="min-w-0 flex-1">
                        <Field label="Start">
                          <input
                            type="time"
                            className={inputClass}
                            value={editStart}
                            onChange={(e) => setEditStart(e.target.value)}
                          />
                        </Field>
                      </div>
                      <div className="min-w-0 flex-1">
                        <Field label="End">
                          <input
                            type="time"
                            className={inputClass}
                            value={editEnd}
                            onChange={(e) => setEditEnd(e.target.value)}
                          />
                        </Field>
                      </div>
                    </div>
                    <Field label="Unpaid break (minutes)">
                      <input
                        type="number"
                        min="0"
                        className={inputClass}
                        value={editBreak}
                        onChange={(e) => setEditBreak(e.target.value)}
                      />
                    </Field>
                    <Field label="Note (optional)">
                      <input
                        className={inputClass}
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                      />
                    </Field>
                    <p className="text-xs text-gray-500">
                      {hoursBetween(editStart, editEnd, Number(editBreak) || 0).toFixed(2)} paid hours
                    </p>
                    {editError && <p className="text-sm text-red-600">{editError}</p>}
                    <Button className="w-full" onClick={() => handleSaveEdit(entry)} disabled={editSaving}>
                      {editSaving ? 'Saving…' : 'Save changes'}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{entry.date}</p>
                      <p className="text-xs text-gray-500">
                        {displayStart}–{displayEnd} · {entry.paid_hours?.toFixed(2) ?? '0.00'} hrs
                      </p>
                      {(isNanny ? entry.nanny_note : entry.parent_note) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {isNanny ? entry.nanny_note : entry.parent_note}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusChip status={isActiveClock ? 'clocked_in' : entry.status} />
                      <div className="flex items-center gap-2">
                        {isParentOrCoAdmin && entry.status === 'submitted' && (
                          <button className="text-xs text-blue-600 underline" onClick={() => approveEntry(entry.id)}>
                            Approve
                          </button>
                        )}
                        {canEdit && (
                          <button className="text-xs text-gray-600 underline" onClick={() => startEdit(entry)}>
                            Edit
                          </button>
                        )}
                        {canArchive && (
                          <button className="text-xs text-red-500 underline" onClick={() => handleArchive(entry)}>
                            Archive
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
      {error && !showForm && <p className="text-sm text-red-600 px-1">{error}</p>}

      {isParentOrCoAdmin && archivedEntries.length > 0 && (
        <div>
          <button
            className="flex w-full items-center justify-between px-1 py-2 text-sm font-medium text-gray-500"
            onClick={() => setShowArchive((s) => !s)}
          >
            <span>Archived ({archivedEntries.length})</span>
            <span className="text-xs">{showArchive ? '▲' : '▼'}</span>
          </button>
          {showArchive && (
            <div className="space-y-2">
              {archivedEntries.map((entry) => {
                const displayStart =
                  entry.manual_start_time ??
                  (entry.clock_in_at ? new Date(entry.clock_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—')
                const displayEnd =
                  entry.manual_end_time ??
                  (entry.clock_out_at ? new Date(entry.clock_out_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—')
                return (
                  <Card key={entry.id}>
                    <div className="flex items-start justify-between gap-2 opacity-60">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{entry.date}</p>
                        <p className="text-xs text-gray-500">
                          {displayStart}–{displayEnd} · {entry.paid_hours?.toFixed(2) ?? '0.00'} hrs
                        </p>
                      </div>
                      <button
                        className="shrink-0 text-xs text-blue-600 underline"
                        onClick={() => handleRestore(entry)}
                      >
                        Restore
                      </button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
