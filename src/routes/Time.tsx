import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { usePreferences } from '../context/PreferencesContext'
import { useSelectedCaregiver } from '../context/SelectedCaregiverContext'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { hoursBetween, round2 } from '../lib/calc'
import { formatDay, formatDayRange, formatHours, isValidCalendarDate, todayIso, toIsoDate } from '../lib/dates'
import { addDays, parseISO, startOfWeek, subDays } from 'date-fns'
import { generateShiftsForRange, shiftHours, type GeneratedShiftOccurrence } from '../lib/schedule'
import { computeReminders } from '../lib/reminders'
import { validateTimeEntry, type ActingRole } from '../lib/timeValidation'
import { formatDateTime, formatEntryTimeRange, formatTimeCompact } from '../lib/time'
import { Card, Button, Field, inputClass, dateInputClass, timeInputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import { StatusChip } from '../components/StatusChip'
import { SwipeRow } from '../components/SwipeRow'
import { Modal } from '../components/Modal'
import type {
  LeaveRequest,
  PaymentRecord,
  ReminderSetting,
  ScheduleException,
  ScheduleShift,
  ScheduleTemplate,
  TimeEntry,
  TimeEntryMethod,
} from '../lib/types'

function WarningList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null
  return (
    <ul className="space-y-1 rounded-md bg-amber-50 p-2 dark:bg-amber-950/40">
      {warnings.map((w, i) => (
        <li key={i} className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <span aria-hidden>⚠</span>
          <span>{w}</span>
        </li>
      ))}
    </ul>
  )
}

// How far back "Not logged yet" looks for scheduled-but-unlogged shifts.
const RECENT_WINDOW_DAYS = 14

const DEFAULT_START_TIME = '09:00'
const DEFAULT_END_TIME = '17:00'

export function Time() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { timeFormat } = usePreferences()
  const { household, isNanny, isParentOrCoAdmin, caregiverProfile } = useHousehold()
  const { caregivers, selectedCaregiverId: caregiverId } = useSelectedCaregiver()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [paidPeriods, setPaidPeriods] = useState<{ start: string; end: string }[]>([])
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([])
  const [shiftsByTemplate, setShiftsByTemplate] = useState<Record<string, ScheduleShift[]>>({})
  const [reminderSettings, setReminderSettings] = useState<ReminderSetting[]>([])
  const [showForm, setShowForm] = useState(false)
  const todayStr = todayIso()
  const recentWindowStart = toIsoDate(subDays(new Date(), RECENT_WINDOW_DAYS - 1))
  const [date, setDate] = useState(todayIso)
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME)
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME)
  const [breakMinutes, setBreakMinutes] = useState('0')
  const [note, setNote] = useState('')
  // Tracks which scheduled shift (if any) the pre-fill below came from, so a
  // saved entry can record spec 15.8's optional schedule_shift_id link -- it
  // stays linked even if the nanny/parent tweaks the pre-filled times, since
  // it identifies "this is the shift scheduled for this date," not "the
  // times match exactly."
  const [scheduledShiftId, setScheduledShiftId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clockNote, setClockNote] = useState('')
  const [clockSubmitting, setClockSubmitting] = useState(false)

  // Detail-sheet state: tapping a row opens it with the entry's values loaded
  // into the edit form.
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editBreak, setEditBreak] = useState('0')
  const [editNote, setEditNote] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [showArchive, setShowArchive] = useState(false)
  const [bulkApproving, setBulkApproving] = useState(false)
  const [quickLogging, setQuickLogging] = useState<string | null>(null)
  // Leave and cancel-type schedule changes for the recent window, so the
  // "Not logged yet" list doesn't nag about days that weren't meant to be worked.
  const [recentLeave, setRecentLeave] = useState<LeaveRequest[]>([])
  const [recentExceptions, setRecentExceptions] = useState<ScheduleException[]>([])


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
      setScheduledShiftId(scheduled.id)
    } else {
      setStartTime(DEFAULT_START_TIME)
      setEndTime(DEFAULT_END_TIME)
      setBreakMinutes('0')
      setScheduledShiftId(null)
    }
  }, [date, templates, shiftsByTemplate])

  // Calendar's "Log time" quick action links here with ?date=YYYY-MM-DD:
  // open the manual-entry form on that date (the schedule pre-fill above then
  // fills in that day's shift times).
  useEffect(() => {
    const linkedDate = searchParams.get('date')
    if (!linkedDate || !isValidCalendarDate(linkedDate)) return
    setDate(linkedDate)
    setShowForm(true)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  async function loadEntries(forCaregiverId: string) {
    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .eq('caregiver_id', forCaregiverId)
      .order('date', { ascending: false })
    setEntries((data ?? []) as TimeEntry[])
  }

  // Spec 13.4 Validation "Parent attempts to edit a paid/locked period" --
  // only the date ranges of payment_records rows money has actually moved
  // for (paid/partially_paid) are needed, not the full row.
  async function loadPaidPeriods(forCaregiverId: string) {
    const { data } = await supabase
      .from('payment_records')
      .select('period_start, period_end, status')
      .eq('caregiver_id', forCaregiverId)
      .in('status', ['paid', 'partially_paid'])
      .is('deleted_at', null)
    setPaidPeriods(
      ((data ?? []) as Pick<PaymentRecord, 'period_start' | 'period_end' | 'status'>[]).map((p) => ({
        start: p.period_start,
        end: p.period_end,
      }))
    )
  }

  async function loadRecentOff(forCaregiverId: string) {
    const [leaveRes, exceptionsRes] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('*')
        .eq('caregiver_id', forCaregiverId)
        .in('status', ['approved', 'requested'])
        .is('archived_at', null)
        .gte('end_date', recentWindowStart),
      supabase
        .from('schedule_exceptions')
        .select('*')
        .eq('caregiver_id', forCaregiverId)
        .eq('status', 'approved')
        .in('exception_type', ['removed_shift', 'family_cancellation', 'holiday', 'weather_emergency'])
        .gte('date', recentWindowStart),
    ])
    setRecentLeave((leaveRes.data ?? []) as LeaveRequest[])
    setRecentExceptions((exceptionsRes.data ?? []) as ScheduleException[])
  }

  useEffect(() => {
    if (caregiverId) {
      loadEntries(caregiverId)
      loadPaidPeriods(caregiverId)
      loadRecentOff(caregiverId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caregiverId])

  // Loaded so the "Overdue" clock-out chip below can respect a household's
  // own per-type reminder toggle (More.tsx), the same gate Home.tsx's Today
  // card already applies to the identical missing_clock_out signal.
  useEffect(() => {
    let cancelled = false
    async function loadReminderSettings() {
      if (!household || !user) {
        setReminderSettings([])
        return
      }
      const { data } = await supabase
        .from('reminders')
        .select('*')
        .eq('household_id', household.id)
        .eq('recipient_user_id', user.id)
      if (!cancelled) setReminderSettings((data ?? []) as ReminderSetting[])
    }
    loadReminderSettings()
    return () => {
      cancelled = true
    }
  }, [household, user])

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
          schedule_shift_id: scheduledShiftId,
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

  async function approveEntry(entry: TimeEntry) {
    setError(null)
    const { error: approveError } = await supabase
      .from('time_entries')
      .update({ status: 'approved', updated_by: user?.id ?? null })
      .eq('id', entry.id)
    if (approveError) {
      setError(errorMessage(approveError, 'Could not approve entry.'))
      return
    }
    if (household) {
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'time_entry',
        entityId: entry.id,
        action: 'approve',
        before: { status: entry.status },
        after: { status: 'approved' },
      })
    }
    if (caregiverId) await loadEntries(caregiverId)
  }

  async function approveEntries(toApprove: TimeEntry[]) {
    if (toApprove.length === 0) return
    setBulkApproving(true)
    setError(null)
    const { error: approveError } = await supabase
      .from('time_entries')
      .update({ status: 'approved', updated_by: user?.id ?? null })
      .in('id', toApprove.map((e) => e.id))
    if (approveError) {
      setError(errorMessage(approveError, 'Could not approve entries.'))
    } else if (household) {
      await Promise.all(
        toApprove.map((entry) =>
          logAuditEvent({
            householdId: household.id,
            actorUserId: user?.id ?? '',
            entityType: 'time_entry',
            entityId: entry.id,
            action: 'approve',
            before: { status: entry.status },
            after: { status: 'approved' },
          })
        )
      )
    }
    if (caregiverId) await loadEntries(caregiverId)
    setBulkApproving(false)
  }

  // One-tap "worked as scheduled" for a shift in the recent window that has
  // no entry yet. Same insert as the manual form with the scheduled times.
  async function quickLog(occ: GeneratedShiftOccurrence) {
    if (!caregiverId || !household) return
    const key = `${occ.date}-${occ.shift.id}`
    setQuickLogging(key)
    setError(null)
    try {
      const start = occ.shift.start_time.slice(0, 5)
      const end = occ.shift.end_time.slice(0, 5)
      const paidHours = hoursBetween(start, end, occ.shift.break_minutes)
      const { data: entry, error: insertError } = await supabase
        .from('time_entries')
        .insert({
          caregiver_id: caregiverId,
          date: occ.date,
          schedule_shift_id: occ.shift.id,
          manual_start_time: start,
          manual_end_time: end,
          break_minutes: occ.shift.break_minutes,
          paid_hours: paidHours,
          method: 'manual',
          status: 'submitted',
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
        after: { date: occ.date, startTime: start, endTime: end, paidHours, source: 'log_as_scheduled' },
      })
      await loadEntries(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not log shift.'))
    } finally {
      setQuickLogging(null)
    }
  }

  // Per spec 13.4, only the nanny clocks in/out; parents use manual entry.
  const activeClockEntry = entries.find((e) => e.method === 'clock' && e.clock_in_at && !e.clock_out_at) ?? null

  // Spec 14.3 Time Screen "Show: ... Missing time warnings" -- reuses the
  // exact same schedule-aware grace-period logic Home.tsx's Today card
  // already runs (computeReminders' missing_clock_out rule) so an overdue
  // open clock session shows the same warning here, on the screen a nanny
  // would actually come to in order to fix it, not just on Home.
  const activeClockChip: 'clocked_in' | 'missing_clock_out' = useMemo(() => {
    if (!activeClockEntry) return 'clocked_in'
    const occurrences = generateShiftsForRange(templates, shiftsByTemplate, activeClockEntry.date, activeClockEntry.date)
    const disabledTypes = new Set(reminderSettings.filter((s) => !s.enabled).map((s) => s.type))
    const isOverdue = computeReminders({
      today: new Date(),
      timeEntries: [activeClockEntry],
      timesheets: [],
      leaveRequests: [],
      paymentRecords: [],
      scheduleOccurrences: occurrences,
      disabledTypes,
    }).some((c) => c.type === 'missing_clock_out')
    return isOverdue ? 'missing_clock_out' : 'clocked_in'
  }, [activeClockEntry, templates, shiftsByTemplate, reminderSettings])

  async function handleClockIn() {
    if (!caregiverId || !household) return
    setClockSubmitting(true)
    setError(null)
    try {
      const todayStr = todayIso()
      const todaysShift = generateShiftsForRange(templates, shiftsByTemplate, todayStr, todayStr)[0]?.shift
      const { data: entry, error: insertError } = await supabase
        .from('time_entries')
        .insert({
          caregiver_id: caregiverId,
          date: todayStr,
          schedule_shift_id: todaysShift?.id ?? null,
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

  function openDetail(entry: TimeEntry) {
    setDetailEntryId(entry.id)
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

  function closeDetail() {
    setDetailEntryId(null)
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

      setDetailEntryId(null)
      if (caregiverId) await loadEntries(caregiverId)
    } catch (err) {
      setEditError(errorMessage(err, 'Could not save changes.'))
    } finally {
      setEditSaving(false)
    }
  }

  async function handleArchive(entry: TimeEntry) {
    if (!household) return
    setError(null)
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
    if (detailEntryId === entry.id) closeDetail()
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
    if (detailEntryId === entry.id) closeDetail()
    if (caregiverId) await loadEntries(caregiverId)
  }

  const activeEntries = entries.filter((e) => !e.deleted_at)
  const archivedEntries = entries.filter((e) => e.deleted_at)

  // Scheduled shifts from the last two weeks with nothing logged for that day
  // (and no leave or cancellation covering it), newest first. Today's shift
  // only counts once it has ended.
  const unloggedShifts = (() => {
    const now = new Date()
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const loggedDates = new Set(activeEntries.map((e) => e.date))
    return generateShiftsForRange(templates, shiftsByTemplate, recentWindowStart, todayStr)
      .filter((occ) => !loggedDates.has(occ.date))
      .filter((occ) => occ.date < todayStr || occ.shift.end_time.slice(0, 5) <= nowTime)
      .filter((occ) => !recentLeave.some((l) => l.start_date <= occ.date && (l.end_date ?? l.start_date) >= occ.date))
      .filter(
        (occ) =>
          !recentExceptions.some(
            (ex) =>
              ex.date === occ.date &&
              (!ex.original_schedule_shift_id || ex.original_schedule_shift_id === occ.shift.id)
          )
      )
      .filter((occ) => !paidPeriods.some((p) => p.start <= occ.date && p.end >= occ.date))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)
  })()

  // An in-progress clock entry has no end time to edit yet, and a locked
  // entry belongs to a closed pay period; everything else is editable by a
  // parent, or by the nanny while it's still theirs to change.
  function canModify(entry: TimeEntry) {
    return (
      entry.id !== activeClockEntry?.id &&
      !entry.deleted_at &&
      entry.status !== 'locked' &&
      (isParentOrCoAdmin || (isNanny && (entry.status === 'draft' || entry.status === 'submitted')))
    )
  }

  function canApprove(entry: TimeEntry) {
    return isParentOrCoAdmin && entry.status === 'submitted' && !entry.deleted_at && entry.id !== activeClockEntry?.id
  }

  // Shared validation context (spec 13.4). Warnings are advisory — they don't
  // block saving, matching the spec's "warn when" wording.
  const selectedCaregiver =
    caregivers.find((c) => c.id === caregiverId) ?? (isNanny ? caregiverProfile : null)
  const weekStartsOn: 0 | 1 = household?.week_start_day === 'monday' ? 1 : 0
  const actingRole: ActingRole = isNanny ? 'nanny' : 'parent'
  const overtimeThresholdHours = selectedCaregiver?.overtime_threshold_hours ?? 0

  function scheduledHoursFor(dateStr: string): number | null {
    if (!isValidCalendarDate(dateStr)) return null
    const occ = generateShiftsForRange(templates, shiftsByTemplate, dateStr, dateStr)
    if (occ.length === 0) return null
    return occ.reduce((sum, o) => sum + shiftHours(o.shift), 0)
  }

  const addWarnings = useMemo(() => {
    if (!showForm || !isValidCalendarDate(date)) return []
    return validateTimeEntry(
      { date, startTime, endTime, breakMinutes: Number(breakMinutes) || 0, status: 'submitted' },
      {
        role: actingRole,
        existingEntries: entries,
        scheduledHoursForDate: scheduledHoursFor(date),
        overtimeThresholdHours,
        weekStartsOn,
        paidPeriodRanges: paidPeriods,
      }
    )
    // scheduledHoursFor closes over templates/shiftsByTemplate, included below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, date, startTime, endTime, breakMinutes, entries, actingRole, overtimeThresholdHours, weekStartsOn, templates, shiftsByTemplate, paidPeriods])

  const entriesByWeek = (() => {
    const groups: { weekStart: string; weekEnd: string; entries: TimeEntry[]; totalHours: number; approvable: TimeEntry[] }[] = []
    for (const entry of activeEntries) {
      const ws = startOfWeek(parseISO(entry.date), { weekStartsOn })
      const key = toIsoDate(ws)
      let group = groups.find((g) => g.weekStart === key)
      if (!group) {
        group = { weekStart: key, weekEnd: toIsoDate(addDays(ws, 6)), entries: [], totalHours: 0, approvable: [] }
        groups.push(group)
      }
      group.entries.push(entry)
      group.totalHours += entry.paid_hours ?? 0
      if (canApprove(entry)) group.approvable.push(entry)
    }
    return groups
  })()

  const detailEntry = entries.find((e) => e.id === detailEntryId) ?? null
  const editingEntry = detailEntry
  const editWarnings = useMemo(() => {
    if (!editingEntry || !isValidCalendarDate(editDate)) return []
    return validateTimeEntry(
      {
        date: editDate,
        startTime: editStart,
        endTime: editEnd,
        breakMinutes: Number(editBreak) || 0,
        status: editingEntry.status,
        entryId: editingEntry.id,
      },
      {
        role: actingRole,
        existingEntries: entries,
        scheduledHoursForDate: scheduledHoursFor(editDate),
        overtimeThresholdHours,
        weekStartsOn,
        paidPeriodRanges: paidPeriods,
      }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEntry, editDate, editStart, editEnd, editBreak, entries, actingRole, overtimeThresholdHours, weekStartsOn, templates, shiftsByTemplate, paidPeriods])

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">Time</h1>
        <Button variant="secondary" onClick={() => { setError(null); setShowForm(true) }}>
          + Log time
        </Button>
      </div>

      {isParentOrCoAdmin && (
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-900">
          <button
            type="button"
            className="flex-1 rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
          >
            Time
          </button>
          <button
            type="button"
            onClick={() => navigate('/pto')}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400"
          >
            PTO
          </button>
        </div>
      )}

      {isNanny && (
        <Card title="Clock in / clock out">
          {activeClockEntry ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Clocked in since{' '}
                  {formatDateTime(activeClockEntry.clock_in_at!, timeFormat)}
                </p>
                {activeClockChip === 'missing_clock_out' && <StatusChip status="missing_clock_out" label="Overdue" />}
              </div>
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

      {isParentOrCoAdmin && <CaregiverSelect />}

      {showForm && (
        <Modal title="Log time" onClose={() => setShowForm(false)}>
          <form onSubmit={handleAddEntry} className="space-y-3">
            <Field label="Date">
              <input type="date" className={dateInputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <div className="flex gap-3">
              <Field label="Start">
                <input type="time" className={timeInputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </Field>
              <Field label="End">
                <input type="time" className={timeInputClass} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
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
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatHours(hoursBetween(startTime, endTime, Number(breakMinutes) || 0))} paid
            </p>
            <WarningList warnings={addWarnings} />
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save entry'}
            </Button>
          </form>
        </Modal>
      )}

      {unloggedShifts.length > 0 && (
        <Card
          title="Not logged yet"
          action={<span className="text-[11px] text-gray-400 dark:text-gray-500">Tap a day to adjust times</span>}
        >
          <div className="-my-1 divide-y divide-gray-100 dark:divide-gray-700">
            {unloggedShifts.map((occ) => (
              <div key={`${occ.date}-${occ.shift.id}`} className="flex items-center justify-between gap-2 py-1.5">
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => { setDate(occ.date); setError(null); setShowForm(true) }}
                >
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    <span className="font-medium">{formatDay(occ.date)}</span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {' · '}
                      {formatTimeCompact(occ.shift.start_time, timeFormat)}–{formatTimeCompact(occ.shift.end_time, timeFormat)} ·{' '}
                      {formatHours(shiftHours(occ.shift))}
                    </span>
                  </p>
                </button>
                <Button
                  variant="secondary"
                  className="shrink-0 px-4! py-1.5!"
                  disabled={quickLogging !== null}
                  onClick={() => quickLog(occ)}
                >
                  {quickLogging === `${occ.date}-${occ.shift.id}` ? 'Logging…' : 'Log'}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeEntries.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400">No time entries yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="px-1 text-[11px] text-gray-400 dark:text-gray-500">
            Tap an entry for details. Swipe left to archive{isParentOrCoAdmin ? ', swipe right to approve' : ''}.
          </p>
          {entriesByWeek.map((week) => (
          <div key={week.weekStart} className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1 pt-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                {formatDayRange(week.weekStart, week.weekEnd)}
                <span className="ml-1.5 font-normal">· {formatHours(week.totalHours)}</span>
              </p>
              {week.approvable.length > 0 && (
                <button
                  type="button"
                  className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 active:bg-green-100 disabled:opacity-50 dark:bg-green-500/15 dark:text-green-300"
                  disabled={bulkApproving}
                  onClick={() => approveEntries(week.approvable)}
                >
                  ✓ Approve {week.approvable.length === 1 ? '' : `all ${week.approvable.length}`}
                </button>
              )}
            </div>
          {week.entries.map((entry) => {
            const isActiveClock = entry.id === activeClockEntry?.id
            const { start: displayStart, end: displayEnd } = formatEntryTimeRange(entry, timeFormat)
            // Spec 14.3 Time Screen "Show: ... Scheduled vs actual" -- reuses
            // the same schedule lookup the add/edit form already uses for
            // pre-fill and validation warnings, just applied per saved row.
            const scheduledForDay = scheduledHoursFor(entry.date)

            return (
              <SwipeRow
                key={entry.id}
                className="rounded-2xl"
                contentClassName=""
                openLabel={`Open time entry for ${entry.date}`}
                onOpen={() => openDetail(entry)}
                leadingAction={
                  canApprove(entry)
                    ? { label: 'Approve', tone: 'approve', onAction: () => approveEntry(entry) }
                    : null
                }
                trailingActions={
                  canModify(entry)
                    ? [{ label: 'Archive', tone: 'archive', onAction: () => handleArchive(entry) }]
                    : []
                }
              >
                <Card>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDay(entry.date)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {displayStart}–{displayEnd} · {formatHours(entry.paid_hours)}
                        {scheduledForDay !== null && (
                          <span className="text-gray-400 dark:text-gray-500">
                            {' '}
                            (scheduled {formatHours(scheduledForDay)})
                          </span>
                        )}
                      </p>
                      {entry.nanny_note && (
                        <p className="text-xs text-gray-400 mt-0.5 dark:text-gray-500">
                          {isNanny ? '' : 'Nanny: '}
                          {entry.nanny_note}
                        </p>
                      )}
                      {entry.parent_note && (
                        <p className="text-xs text-gray-400 mt-0.5 dark:text-gray-500">
                          {isNanny ? 'Parent: ' : ''}
                          {entry.parent_note}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusChip status={isActiveClock ? activeClockChip : entry.status} />
                      {canApprove(entry) && (
                        <button
                          className="text-xs text-green-600 underline dark:text-green-400"
                          onClick={(e) => {
                            e.stopPropagation()
                            approveEntry(entry)
                          }}
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              </SwipeRow>
            )
          })}
          </div>
          ))}
        </div>
      )}
      {error && !showForm && <p className="text-sm text-red-600 px-1 dark:text-red-400">{error}</p>}

      {isParentOrCoAdmin && archivedEntries.length > 0 && (
        <div>
          <button
            className="flex w-full items-center justify-between px-1 py-2 text-sm font-medium text-gray-500 dark:text-gray-400"
            onClick={() => setShowArchive((s) => !s)}
          >
            <span>Archived ({archivedEntries.length})</span>
            <span className="text-xs">{showArchive ? '▲' : '▼'}</span>
          </button>
          {showArchive && (
            <div className="space-y-2">
              {archivedEntries.map((entry) => {
                const { start: displayStart, end: displayEnd } = formatEntryTimeRange(entry, timeFormat)
                return (
                  <SwipeRow
                    key={entry.id}
                    className="rounded-2xl"
                    contentClassName=""
                    openLabel={`Open archived time entry for ${entry.date}`}
                    onOpen={() => openDetail(entry)}
                    leadingAction={{ label: 'Restore', tone: 'restore', onAction: () => handleRestore(entry) }}
                  >
                    <Card>
                      <div className="flex items-start justify-between gap-2 opacity-60">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDay(entry.date)}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {displayStart}–{displayEnd} · {formatHours(entry.paid_hours)}
                          </p>
                        </div>
                        <button
                          className="shrink-0 text-xs text-blue-600 underline dark:text-blue-400"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRestore(entry)
                          }}
                        >
                          Restore
                        </button>
                      </div>
                    </Card>
                  </SwipeRow>
                )
              })}
            </div>
          )}
        </div>
      )}

      {detailEntry && (
        <Modal title="Time entry" onClose={closeDetail}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusChip status={detailEntry.id === activeClockEntry?.id ? activeClockChip : detailEntry.status} />
              {detailEntry.deleted_at && (
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  Archived {detailEntry.deleted_at.slice(0, 10)}
                </span>
              )}
            </div>
            {detailEntry.clock_in_at && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Original clock: {formatDateTime(detailEntry.clock_in_at, timeFormat)}
                {detailEntry.clock_out_at && ` – ${formatDateTime(detailEntry.clock_out_at, timeFormat)}`}
              </p>
            )}

            {(isNanny ? detailEntry.parent_note : detailEntry.nanny_note) && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isNanny ? 'Parent note: ' : 'Nanny note: '}
                {isNanny ? detailEntry.parent_note : detailEntry.nanny_note}
              </p>
            )}

            {canModify(detailEntry) ? (
              <div className="space-y-3">
                <Field label="Date">
                  <input
                    type="date"
                    className={dateInputClass}
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                </Field>
                <div className="flex gap-3">
                  <Field label="Start">
                    <input
                      type="time"
                      className={timeInputClass}
                      value={editStart}
                      onChange={(e) => setEditStart(e.target.value)}
                    />
                  </Field>
                  <Field label="End">
                    <input
                      type="time"
                      className={timeInputClass}
                      value={editEnd}
                      onChange={(e) => setEditEnd(e.target.value)}
                    />
                  </Field>
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
                <Field label="Your note (optional)">
                  <input className={inputClass} value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                </Field>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatHours(hoursBetween(editStart, editEnd, Number(editBreak) || 0))} paid
                </p>
                <WarningList warnings={editWarnings} />
                {editError && <p className="text-sm text-red-600 dark:text-red-400">{editError}</p>}
                <Button className="w-full" onClick={() => handleSaveEdit(detailEntry)} disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDay(detailEntry.date)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatEntryTimeRange(detailEntry, timeFormat).start}–
                  {formatEntryTimeRange(detailEntry, timeFormat).end} ·{' '}
                  {formatHours(detailEntry.paid_hours)}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {detailEntry.deleted_at
                    ? 'Restore this entry to edit it.'
                    : detailEntry.status === 'locked'
                      ? 'This entry is in a locked pay period and can no longer be edited.'
                      : 'This entry is still clocked in — clock out to edit it.'}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
              {canApprove(detailEntry) && (
                <Button className="flex-1" onClick={() => approveEntry(detailEntry)}>
                  Approve
                </Button>
              )}
              {detailEntry.deleted_at
                ? isParentOrCoAdmin && (
                    <Button variant="secondary" className="flex-1" onClick={() => handleRestore(detailEntry)}>
                      Restore
                    </Button>
                  )
                : canModify(detailEntry) && (
                    <Button variant="danger" className="flex-1" onClick={() => handleArchive(detailEntry)}>
                      Archive
                    </Button>
                  )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
