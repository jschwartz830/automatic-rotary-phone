import { useEffect, useState, type FormEvent } from 'react'
import { addDays, format, startOfWeek } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { usePreferences } from '../context/PreferencesContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { exceptionHours, generateShiftsForRange, scheduleExceptionHoursDelta, shiftHours } from '../lib/schedule'
import { formatEntryTimeRange, formatTimeOfDay } from '../lib/time'
import { Card, Button, Field, inputClass, dateInputClass, timeInputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import { Modal } from '../components/Modal'
import { StatusChip } from '../components/StatusChip'
import type {
  ExceptionType,
  LeaveRequest,
  RecurrenceType,
  ScheduleException,
  ScheduleShift,
  ScheduleTemplate,
  TimeEntry,
} from '../lib/types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Leave-type exceptions (pto/sick/unpaid_time_off) are handled entirely
// through leave_requests/leave_ledger (see PTO.tsx) so balances stay in one
// place. These are the exception types this screen manages directly.
const EXCEPTION_TYPES: ExceptionType[] = [
  'added_shift',
  'removed_shift',
  'shortened_shift',
  'extended_shift',
  'family_cancellation',
  'holiday',
  'weather_emergency',
  'other',
]

const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  added_shift: 'Added shift',
  removed_shift: 'Removed shift',
  shortened_shift: 'Shortened shift',
  extended_shift: 'Extended shift',
  family_cancellation: 'Family cancellation',
  pto: 'PTO',
  sick: 'Sick',
  unpaid_time_off: 'Unpaid time off',
  holiday: 'Holiday',
  weather_emergency: 'Weather/emergency',
  other: 'Other',
}

// Exceptions that reference an existing occurrence (to shorten/extend/remove
// it) vs. ones that stand alone.
const EXCEPTION_TYPES_WITH_ORIGINAL_SHIFT: ExceptionType[] = ['removed_shift', 'shortened_shift', 'extended_shift']
const EXCEPTION_TYPES_WITH_TIME_RANGE: ExceptionType[] = ['added_shift', 'shortened_shift', 'extended_shift']

function toIsoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function Schedule() {
  const { user } = useAuth()
  const { household, isParentOrCoAdmin, isNanny, caregiverProfile } = useHousehold()
  const { caregivers } = useCaregivers(household?.id)
  const { timeFormat } = usePreferences()
  const [caregiverId, setCaregiverId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([])
  const [shifts, setShifts] = useState<Record<string, ScheduleShift[]>>({})
  const [leaveForWeek, setLeaveForWeek] = useState<LeaveRequest[]>([])
  const [actualEntriesForWeek, setActualEntriesForWeek] = useState<TimeEntry[]>([])
  const [exceptionsForWeek, setExceptionsForWeek] = useState<ScheduleException[]>([])
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [showAddShiftModal, setShowAddShiftModal] = useState(false)
  const [recurrenceChoice, setRecurrenceChoice] = useState<'weekly' | 'biweekly' | 'monthly' | 'once' | 'other'>('weekly')
  const [selectedDays, setSelectedDays] = useState<string[]>(['1'])
  const [biweeklyAnchorDate, setBiweeklyAnchorDate] = useState(() => toIsoDate(new Date()))
  const [monthlyMode, setMonthlyMode] = useState<'date' | 'weekday'>('date')
  const [monthlyDate, setMonthlyDate] = useState('1')
  const [monthlyWeekday, setMonthlyWeekday] = useState('1')
  const [monthlyWeekOrdinal, setMonthlyWeekOrdinal] = useState<
    'first' | 'second' | 'third' | 'fourth' | 'last'
  >('first')
  const [onceDate, setOnceDate] = useState(() => toIsoDate(new Date()))
  const [otherDayOfWeek, setOtherDayOfWeek] = useState('1')
  const [otherNote, setOtherNote] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [breakMinutes, setBreakMinutes] = useState('0')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Add-exception form state (parent/co-admin only)
  const [showExceptionForm, setShowExceptionForm] = useState(false)
  const [exceptionType, setExceptionType] = useState<ExceptionType>('added_shift')
  const [exceptionOriginalShiftId, setExceptionOriginalShiftId] = useState('')
  const [exceptionStart, setExceptionStart] = useState('09:00')
  const [exceptionEnd, setExceptionEnd] = useState('17:00')
  const [exceptionHoursOverride, setExceptionHoursOverride] = useState('')
  const [exceptionAffectsPay, setExceptionAffectsPay] = useState(true)
  const [exceptionCountsTowardGuaranteed, setExceptionCountsTowardGuaranteed] = useState(false)
  const [exceptionParentNote, setExceptionParentNote] = useState('')
  const [exceptionNannyNote, setExceptionNannyNote] = useState('')
  const [exceptionSubmitting, setExceptionSubmitting] = useState(false)
  const [exceptionError, setExceptionError] = useState<string | null>(null)

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
      setShifts(grouped)
    } else {
      setShifts({})
    }
  }

  async function loadLeave(forCaregiverId: string, ws: Date) {
    const start = toIsoDate(ws)
    const end = toIsoDate(addDays(ws, 6))
    const { data } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('caregiver_id', forCaregiverId)
      .lte('start_date', end)
      .gte('end_date', start)
      .in('status', ['approved', 'requested'])
    setLeaveForWeek((data ?? []) as LeaveRequest[])
  }

  async function loadActual(forCaregiverId: string, ws: Date) {
    const start = toIsoDate(ws)
    const end = toIsoDate(addDays(ws, 6))
    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .eq('caregiver_id', forCaregiverId)
      .is('deleted_at', null)
      .gte('date', start)
      .lte('date', end)
    setActualEntriesForWeek((data ?? []) as TimeEntry[])
  }

  async function loadExceptions(forCaregiverId: string, ws: Date) {
    const start = toIsoDate(ws)
    const end = toIsoDate(addDays(ws, 6))
    const { data } = await supabase
      .from('schedule_exceptions')
      .select('*')
      .eq('caregiver_id', forCaregiverId)
      .gte('date', start)
      .lte('date', end)
      .in('exception_type', EXCEPTION_TYPES)
      .neq('status', 'canceled')
      .neq('status', 'rejected')
    setExceptionsForWeek((data ?? []) as ScheduleException[])
  }

  useEffect(() => {
    if (caregiverId) {
      loadSchedule(caregiverId)
      loadLeave(caregiverId, weekStart)
      loadActual(caregiverId, weekStart)
      loadExceptions(caregiverId, weekStart)
    }
  }, [caregiverId])

  useEffect(() => {
    if (caregiverId) {
      loadLeave(caregiverId, weekStart)
      loadActual(caregiverId, weekStart)
      loadExceptions(caregiverId, weekStart)
    }
  }, [weekStart, caregiverId])

  function resetShiftForm() {
    setRecurrenceChoice('weekly')
    setSelectedDays(['1'])
    setBiweeklyAnchorDate(toIsoDate(new Date()))
    setMonthlyMode('date')
    setMonthlyDate('1')
    setMonthlyWeekday('1')
    setMonthlyWeekOrdinal('first')
    setOnceDate(toIsoDate(new Date()))
    setOtherDayOfWeek('1')
    setOtherNote('')
    setStartTime('09:00')
    setEndTime('17:00')
    setBreakMinutes('0')
    setError(null)
  }

  async function findOrCreateTemplate(
    recurrenceType: RecurrenceType,
    name: string,
    effectiveStartDate?: string
  ): Promise<ScheduleTemplate> {
    const existing = templates.find((t) => t.recurrence_type === recurrenceType)
    if (existing) return existing
    const { data: newTemplate, error: templateError } = await supabase
      .from('schedule_templates')
      .insert({
        caregiver_id: caregiverId,
        name,
        recurrence_type: recurrenceType,
        recurrence_rule: {},
        effective_start_date: effectiveStartDate ?? new Date().toISOString().slice(0, 10),
        created_by: user?.id ?? null,
      })
      .select()
      .single()
    if (templateError) throw templateError
    const template = newTemplate as ScheduleTemplate
    setTemplates((prev) => [...prev, template])
    return template
  }

  async function handleAddShift(e: FormEvent) {
    e.preventDefault()
    if (!caregiverId || !household) return
    setSubmitting(true)
    setError(null)
    try {
      if (recurrenceChoice === 'once') {
        if (!user) throw new Error('Not signed in.')
        const { error: insertError, data: inserted } = await supabase
          .from('schedule_exceptions')
          .insert({
            caregiver_id: caregiverId,
            date: onceDate,
            exception_type: 'added_shift',
            start_time: startTime,
            end_time: endTime,
            status: 'approved',
            created_by: user.id,
            approved_by: user.id,
          })
          .select()
          .single()
        if (insertError) throw insertError

        await logAuditEvent({
          householdId: household.id,
          actorUserId: user.id,
          entityType: 'schedule_exception',
          entityId: inserted.id,
          action: 'create',
          after: { date: onceDate, exception_type: 'added_shift', startTime, endTime },
        })
        await loadExceptions(caregiverId, weekStart)
      } else if (recurrenceChoice === 'weekly') {
        if (selectedDays.length === 0) throw new Error('Choose at least one day of the week.')
        const template = await findOrCreateTemplate('weekly', 'Weekly schedule')
        for (const day of selectedDays) {
          const { error: shiftError } = await supabase.from('schedule_shifts').insert({
            schedule_template_id: template.id,
            day_of_week: Number(day),
            start_time: startTime,
            end_time: endTime,
            break_minutes: Number(breakMinutes) || 0,
          })
          if (shiftError) throw shiftError
        }
        await logAuditEvent({
          householdId: household.id,
          actorUserId: user?.id ?? '',
          entityType: 'schedule_shift',
          entityId: template.id,
          action: 'create',
          after: { days: selectedDays, startTime, endTime },
        })
        await loadSchedule(caregiverId)
      } else if (recurrenceChoice === 'biweekly') {
        if (selectedDays.length === 0) throw new Error('Choose at least one day of the week.')
        const template = await findOrCreateTemplate('biweekly', 'Biweekly schedule', biweeklyAnchorDate)
        for (const day of selectedDays) {
          const { error: shiftError } = await supabase.from('schedule_shifts').insert({
            schedule_template_id: template.id,
            day_of_week: Number(day),
            start_time: startTime,
            end_time: endTime,
            break_minutes: Number(breakMinutes) || 0,
          })
          if (shiftError) throw shiftError
        }
        await logAuditEvent({
          householdId: household.id,
          actorUserId: user?.id ?? '',
          entityType: 'schedule_shift',
          entityId: template.id,
          action: 'create',
          after: { days: selectedDays, startTime, endTime, biweeklyAnchorDate },
        })
        await loadSchedule(caregiverId)
      } else if (recurrenceChoice === 'monthly') {
        const recurrenceType: RecurrenceType = monthlyMode === 'date' ? 'monthly_by_date' : 'monthly_by_weekday'
        const template = await findOrCreateTemplate(recurrenceType, 'Monthly schedule')
        const { error: shiftError } = await supabase.from('schedule_shifts').insert({
          schedule_template_id: template.id,
          day_of_week: monthlyMode === 'weekday' ? Number(monthlyWeekday) : null,
          monthly_day: monthlyMode === 'date' ? Number(monthlyDate) : null,
          monthly_week: monthlyMode === 'weekday' ? monthlyWeekOrdinal : null,
          start_time: startTime,
          end_time: endTime,
          break_minutes: Number(breakMinutes) || 0,
        })
        if (shiftError) throw shiftError
        await logAuditEvent({
          householdId: household.id,
          actorUserId: user?.id ?? '',
          entityType: 'schedule_shift',
          entityId: template.id,
          action: 'create',
          after: { recurrenceType, monthlyDate, monthlyWeekday, monthlyWeekOrdinal, startTime, endTime },
        })
        await loadSchedule(caregiverId)
      } else {
        const template = await findOrCreateTemplate('custom', 'Custom schedule')
        const { error: shiftError } = await supabase.from('schedule_shifts').insert({
          schedule_template_id: template.id,
          day_of_week: Number(otherDayOfWeek),
          start_time: startTime,
          end_time: endTime,
          break_minutes: Number(breakMinutes) || 0,
          notes: otherNote || null,
        })
        if (shiftError) throw shiftError
        await logAuditEvent({
          householdId: household.id,
          actorUserId: user?.id ?? '',
          entityType: 'schedule_shift',
          entityId: template.id,
          action: 'create',
          after: { day_of_week: otherDayOfWeek, startTime, endTime, notes: otherNote },
        })
        await loadSchedule(caregiverId)
      }

      setShowAddShiftModal(false)
      resetShiftForm()
    } catch (err) {
      setError(errorMessage(err, 'Could not add shift.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteShift(shift: ScheduleShift) {
    if (!caregiverId) return
    await supabase.from('schedule_shifts').delete().eq('id', shift.id)
    if (household) {
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'schedule_shift',
        entityId: shift.id,
        action: 'delete',
        before: {
          day_of_week: shift.day_of_week,
          start_time: shift.start_time,
          end_time: shift.end_time,
        },
      })
    }
    await loadSchedule(caregiverId)
  }

  function resetExceptionForm() {
    setExceptionType('added_shift')
    setExceptionOriginalShiftId('')
    setExceptionStart('09:00')
    setExceptionEnd('17:00')
    setExceptionHoursOverride('')
    setExceptionAffectsPay(true)
    setExceptionCountsTowardGuaranteed(false)
    setExceptionParentNote('')
    setExceptionNannyNote('')
    setExceptionError(null)
  }

  async function handleAddException(e: FormEvent, forDay: string) {
    e.preventDefault()
    if (!caregiverId || !household || !user) return
    setExceptionSubmitting(true)
    setExceptionError(null)
    try {
      const needsOriginal = EXCEPTION_TYPES_WITH_ORIGINAL_SHIFT.includes(exceptionType)
      const needsTimeRange = EXCEPTION_TYPES_WITH_TIME_RANGE.includes(exceptionType)
      const { error: insertError, data: inserted } = await supabase
        .from('schedule_exceptions')
        .insert({
          caregiver_id: caregiverId,
          date: forDay,
          exception_type: exceptionType,
          original_schedule_shift_id: needsOriginal && exceptionOriginalShiftId ? exceptionOriginalShiftId : null,
          start_time: needsTimeRange ? exceptionStart : null,
          end_time: needsTimeRange ? exceptionEnd : null,
          paid_hours: exceptionHoursOverride !== '' ? Number(exceptionHoursOverride) : null,
          affects_pay: exceptionAffectsPay,
          counts_toward_guaranteed_hours: exceptionCountsTowardGuaranteed,
          status: 'approved',
          parent_note: exceptionParentNote || null,
          nanny_visible_note: exceptionNannyNote || null,
          created_by: user.id,
          approved_by: user.id,
        })
        .select()
        .single()
      if (insertError) throw insertError

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user.id,
        entityType: 'schedule_exception',
        entityId: inserted.id,
        action: 'create',
        after: { date: forDay, exception_type: exceptionType },
      })

      setShowExceptionForm(false)
      resetExceptionForm()
      await loadExceptions(caregiverId, weekStart)
    } catch (err) {
      setExceptionError(errorMessage(err, 'Could not save exception.'))
    } finally {
      setExceptionSubmitting(false)
    }
  }

  async function handleDeleteException(exception: ScheduleException) {
    if (!caregiverId || !household || !user) return
    const { error: deleteError } = await supabase.from('schedule_exceptions').delete().eq('id', exception.id)
    if (deleteError) {
      setError(errorMessage(deleteError, 'Could not remove exception.'))
      return
    }
    await logAuditEvent({
      householdId: household.id,
      actorUserId: user.id,
      entityType: 'schedule_exception',
      entityId: exception.id,
      action: 'delete',
      before: { date: exception.date, exception_type: exception.exception_type },
    })
    await loadExceptions(caregiverId, weekStart)
  }

  const weekEnd = addDays(weekStart, 6)
  const weekOccurrences = generateShiftsForRange(templates, shifts, toIsoDate(weekStart), toIsoDate(weekEnd))
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const todayStr = toIsoDate(new Date())

  const allShifts = templates.flatMap((t) =>
    (shifts[t.id] ?? []).map((s) => ({ ...s, templateName: t.name, recurrenceType: t.recurrence_type }))
  )
  const sortedShifts = [...allShifts].sort(
    (a, b) => (a.day_of_week ?? a.monthly_day ?? 0) - (b.day_of_week ?? b.monthly_day ?? 0)
  )
  const shiftsById: Record<string, ScheduleShift> = Object.fromEntries(allShifts.map((s) => [s.id, s]))

  function describeShiftRecurrence(shift: ScheduleShift & { recurrenceType: RecurrenceType }): string {
    switch (shift.recurrenceType) {
      case 'weekly':
        return DAYS[shift.day_of_week ?? 0]
      case 'biweekly':
        return `${DAYS[shift.day_of_week ?? 0]} · biweekly`
      case 'monthly_by_date':
        return `Day ${shift.monthly_day} of month`
      case 'monthly_by_weekday': {
        const ordinal = shift.monthly_week ?? 'first'
        return `${ordinal.charAt(0).toUpperCase()}${ordinal.slice(1)} ${DAYS[shift.day_of_week ?? 0]} of month`
      }
      case 'custom':
      default:
        return `${DAYS[shift.day_of_week ?? 0]} · custom`
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">Schedule</h1>
        {isParentOrCoAdmin && (
          <Button variant="secondary" onClick={() => { resetShiftForm(); setShowAddShiftModal(true) }}>
            + Add shift
          </Button>
        )}
      </div>

      {isParentOrCoAdmin && <CaregiverSelect caregivers={caregivers} value={caregiverId} onChange={setCaregiverId} />}

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          className="rounded-lg px-3 py-2 text-gray-500 active:bg-gray-100 dark:text-gray-400 dark:active:bg-gray-800"
          onClick={() => { setWeekStart((w) => addDays(w, -7)); setSelectedDay(null) }}
        >
          ←
        </button>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
        </p>
        <button
          className="rounded-lg px-3 py-2 text-gray-500 active:bg-gray-100 dark:text-gray-400 dark:active:bg-gray-800"
          onClick={() => { setWeekStart((w) => addDays(w, 7)); setSelectedDay(null) }}
        >
          →
        </button>
      </div>

      {/* Weekly grid */}
      <Card>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {weekDays.map((day) => {
            const dayStr = toIsoDate(day)
            const dayOccs = weekOccurrences.filter((o) => o.date === dayStr)
            const dayLeave = leaveForWeek.filter(
              (l) => l.start_date <= dayStr && (l.end_date ?? l.start_date) >= dayStr
            )
            const dayActualEntries = actualEntriesForWeek.filter((e) => e.date === dayStr)
            const dayExceptions = exceptionsForWeek.filter((ex) => ex.date === dayStr)
            const removedShiftIds = new Set(
              dayExceptions
                .filter((ex) => ex.exception_type === 'removed_shift' && ex.original_schedule_shift_id)
                .map((ex) => ex.original_schedule_shift_id)
            )
            const actualHours = dayActualEntries.reduce((sum, e) => sum + (e.paid_hours ?? 0), 0)
            const baseHours = dayOccs.reduce((sum, o) => sum + shiftHours(o.shift), 0)
            const totalHours = Math.max(baseHours + scheduleExceptionHoursDelta(dayExceptions, shiftsById), 0)
            const isSelected = selectedDay === dayStr
            const isToday = dayStr === todayStr

            return (
              <div key={dayStr}>
                <button
                  className="flex w-full items-start gap-3 py-3 text-left"
                  onClick={() => {
                    setSelectedDay(isSelected ? null : dayStr)
                    setShowExceptionForm(false)
                    resetExceptionForm()
                  }}
                >
                  <div
                    className={`flex w-10 shrink-0 flex-col items-center rounded-lg py-0.5 ${isToday ? 'bg-gray-900 dark:bg-gray-100' : ''}`}
                  >
                    <span className={`text-xs font-medium ${isToday ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>
                      {format(day, 'EEE')}
                    </span>
                    <span
                      className={`text-base font-bold leading-tight ${isToday ? 'text-white dark:text-gray-900' : 'text-gray-900 dark:text-gray-100'}`}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    {dayOccs.length === 0 && dayLeave.length === 0 && dayExceptions.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500">Off</p>
                    ) : (
                      <>
                        {dayOccs.map((occ) => (
                          <p
                            key={occ.shift.id}
                            className={
                              removedShiftIds.has(occ.shift.id)
                                ? 'text-sm text-gray-400 line-through dark:text-gray-600'
                                : 'text-sm text-gray-900 dark:text-gray-100'
                            }
                          >
                            {formatTimeOfDay(occ.shift.start_time, timeFormat)}–{formatTimeOfDay(occ.shift.end_time, timeFormat)}
                            <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">· {shiftHours(occ.shift).toFixed(1)}h</span>
                          </p>
                        ))}
                        {(dayLeave.length > 0 || dayExceptions.length > 0) && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {dayLeave.map((l) => (
                              <span
                                key={l.id}
                                className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium capitalize text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                              >
                                {l.leave_type.replace(/_/g, ' ')}
                              </span>
                            ))}
                            {dayExceptions.map((ex) => (
                              <span
                                key={ex.id}
                                className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
                              >
                                {EXCEPTION_LABELS[ex.exception_type]}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    {actualHours > 0 && (
                      <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        Worked {actualHours.toFixed(1)}h
                        {dayActualEntries.length === 1 &&
                          (() => {
                            const { start, end } = formatEntryTimeRange(dayActualEntries[0], timeFormat)
                            return (
                              <span className="ml-1 font-normal text-emerald-600/80 dark:text-emerald-400/80">
                                ({start}–{end})
                              </span>
                            )
                          })()}
                      </p>
                    )}
                  </div>
                  {totalHours > 0 && (
                    <span className="shrink-0 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {actualHours > 0 ? (
                        <>
                          <span className={actualHours > totalHours ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                            {actualHours.toFixed(1)}h
                          </span>
                          {' / '}
                          {totalHours.toFixed(1)}h
                        </>
                      ) : (
                        `${totalHours.toFixed(1)}h`
                      )}
                    </span>
                  )}
                </button>

                {isSelected && (dayOccs.length > 0 || dayLeave.length > 0 || dayActualEntries.length > 0 || dayExceptions.length > 0 || isParentOrCoAdmin) && (
                  <div className="mb-3 ml-[52px] space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
                    {dayOccs.map((occ) => (
                      <div key={occ.shift.id} className="flex items-start justify-between gap-2">
                        <div>
                          <p
                            className={
                              removedShiftIds.has(occ.shift.id)
                                ? 'text-sm font-medium text-gray-400 line-through dark:text-gray-600'
                                : 'text-sm font-medium text-gray-900 dark:text-gray-100'
                            }
                          >
                            {formatTimeOfDay(occ.shift.start_time, timeFormat)} – {formatTimeOfDay(occ.shift.end_time, timeFormat)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {shiftHours(occ.shift).toFixed(2)} hrs
                            {occ.shift.break_minutes > 0 ? ` · ${occ.shift.break_minutes}m break` : ''}
                            {removedShiftIds.has(occ.shift.id) ? ' · removed this day' : ''}
                          </p>
                        </div>
                        {isParentOrCoAdmin && (
                          <button
                            className="shrink-0 text-xs text-red-600 underline dark:text-red-400"
                            onClick={(e) => { e.stopPropagation(); handleDeleteShift(occ.shift) }}
                          >
                            Remove recurring
                          </button>
                        )}
                      </div>
                    ))}
                    {dayLeave.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium capitalize text-gray-900 dark:text-gray-100">
                            {l.leave_type.replace(/_/g, ' ')}
                          </p>
                          {l.hours_requested != null && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{l.hours_requested} hrs</p>
                          )}
                        </div>
                        <StatusChip status={l.status} />
                      </div>
                    ))}
                    {dayExceptions.map((ex) => (
                      <div key={ex.id} className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-purple-700 dark:text-purple-400">
                            {EXCEPTION_LABELS[ex.exception_type]}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {exceptionHours(ex, shiftsById).toFixed(2)} hrs
                            {ex.affects_pay ? '' : ' · unpaid'}
                            {ex.counts_toward_guaranteed_hours ? ' · counts toward guarantee' : ''}
                          </p>
                          {(isNanny ? ex.nanny_visible_note : ex.parent_note) && (
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              {isNanny ? ex.nanny_visible_note : ex.parent_note}
                            </p>
                          )}
                        </div>
                        {isParentOrCoAdmin && (
                          <button
                            className="shrink-0 text-xs text-red-600 underline dark:text-red-400"
                            onClick={(e) => { e.stopPropagation(); handleDeleteException(ex) }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    {dayActualEntries.map((entry) => {
                      const { start, end } = formatEntryTimeRange(entry, timeFormat)
                      return (
                        <div key={entry.id} className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                              Worked {start} – {end}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {(entry.paid_hours ?? 0).toFixed(2)} hrs · {entry.status.replace(/_/g, ' ')}
                            </p>
                          </div>
                        </div>
                      )
                    })}

                    {isParentOrCoAdmin && (
                      <div onClick={(e) => e.stopPropagation()}>
                        {showExceptionForm ? (
                          <form onSubmit={(e) => handleAddException(e, dayStr)} className="space-y-2 border-t border-gray-200 pt-2 dark:border-gray-700">
                            <Field label="Type">
                              <select
                                className={inputClass}
                                value={exceptionType}
                                onChange={(e) => setExceptionType(e.target.value as ExceptionType)}
                              >
                                {EXCEPTION_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {EXCEPTION_LABELS[t]}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            {EXCEPTION_TYPES_WITH_ORIGINAL_SHIFT.includes(exceptionType) && dayOccs.length > 0 && (
                              <Field label="Original shift">
                                <select
                                  className={inputClass}
                                  value={exceptionOriginalShiftId}
                                  onChange={(e) => setExceptionOriginalShiftId(e.target.value)}
                                >
                                  <option value="">None</option>
                                  {dayOccs.map((occ) => (
                                    <option key={occ.shift.id} value={occ.shift.id}>
                                      {formatTimeOfDay(occ.shift.start_time, timeFormat)}–{formatTimeOfDay(occ.shift.end_time, timeFormat)}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            )}
                            {EXCEPTION_TYPES_WITH_TIME_RANGE.includes(exceptionType) && (
                              <div className="space-y-2">
                                <Field label="New start">
                                  <input type="time" className={timeInputClass} value={exceptionStart} onChange={(e) => setExceptionStart(e.target.value)} />
                                </Field>
                                <Field label="New end">
                                  <input type="time" className={timeInputClass} value={exceptionEnd} onChange={(e) => setExceptionEnd(e.target.value)} />
                                </Field>
                              </div>
                            )}
                            <Field label="Hours (leave blank to auto-calculate)">
                              <input
                                type="number"
                                step="0.25"
                                min="0"
                                className={inputClass}
                                value={exceptionHoursOverride}
                                onChange={(e) => setExceptionHoursOverride(e.target.value)}
                                placeholder="auto"
                              />
                            </Field>
                            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                              <input type="checkbox" checked={exceptionAffectsPay} onChange={(e) => setExceptionAffectsPay(e.target.checked)} />
                              Affects pay
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                              <input
                                type="checkbox"
                                checked={exceptionCountsTowardGuaranteed}
                                onChange={(e) => setExceptionCountsTowardGuaranteed(e.target.checked)}
                              />
                              Counts toward guaranteed hours
                            </label>
                            <Field label="Private note (parent only)">
                              <input className={inputClass} value={exceptionParentNote} onChange={(e) => setExceptionParentNote(e.target.value)} />
                            </Field>
                            <Field label="Note visible to nanny">
                              <input className={inputClass} value={exceptionNannyNote} onChange={(e) => setExceptionNannyNote(e.target.value)} />
                            </Field>
                            {exceptionError && <p className="text-sm text-red-600 dark:text-red-400">{exceptionError}</p>}
                            <div className="flex gap-2 pt-1">
                              <Button
                                type="button"
                                variant="secondary"
                                className="flex-1"
                                onClick={() => { setShowExceptionForm(false); resetExceptionForm() }}
                              >
                                Cancel
                              </Button>
                              <Button type="submit" className="flex-1" disabled={exceptionSubmitting}>
                                {exceptionSubmitting ? 'Saving…' : 'Save exception'}
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <button
                            className="mt-1 w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400"
                            onClick={() => { resetExceptionForm(); setShowExceptionForm(true) }}
                          >
                            + Add schedule exception
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {sortedShifts.length > 0 && (
        <Card title="Recurring schedule">
          <div className="space-y-2">
            {sortedShifts.map((shift) => (
              <div key={shift.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {describeShiftRecurrence(shift)} · {formatTimeOfDay(shift.start_time, timeFormat)}–{formatTimeOfDay(shift.end_time, timeFormat)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {shiftHours(shift).toFixed(2)} hrs recurring
                    {shift.notes ? ` · ${shift.notes}` : ''}
                  </p>
                </div>
                {isParentOrCoAdmin && (
                  <button
                    className="text-xs text-red-600 underline dark:text-red-400"
                    onClick={() => handleDeleteShift(shift)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {showAddShiftModal && (
        <Modal title="Add shift" onClose={() => setShowAddShiftModal(false)}>
          <form onSubmit={handleAddShift} className="space-y-3">
            <Field label="Repeats">
              <select
                className={inputClass}
                value={recurrenceChoice}
                onChange={(e) => setRecurrenceChoice(e.target.value as typeof recurrenceChoice)}
              >
                <option value="weekly">Weekly (choose day or days)</option>
                <option value="biweekly">Every other week (choose day or days)</option>
                <option value="monthly">Monthly</option>
                <option value="once">One time (doesn't repeat)</option>
                <option value="other">Other / custom</option>
              </select>
            </Field>

            {(recurrenceChoice === 'weekly' || recurrenceChoice === 'biweekly') && (
              <Field label="Days of week">
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d, i) => {
                    const val = String(i)
                    const checked = selectedDays.includes(val)
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setSelectedDays((prev) =>
                            checked ? prev.filter((x) => x !== val) : [...prev, val].sort()
                          )
                        }
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                          checked
                            ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {d[0]}
                      </button>
                    )
                  })}
                </div>
              </Field>
            )}

            {recurrenceChoice === 'biweekly' && (
              <Field label="First on-week starts">
                <input
                  type="date"
                  className={dateInputClass}
                  value={biweeklyAnchorDate}
                  onChange={(e) => setBiweeklyAnchorDate(e.target.value)}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  The week containing this date is a scheduled week; the following week is off, alternating from there.
                </p>
              </Field>
            )}

            {recurrenceChoice === 'monthly' && (
              <>
                <Field label="Monthly pattern">
                  <select
                    className={inputClass}
                    value={monthlyMode}
                    onChange={(e) => setMonthlyMode(e.target.value as 'date' | 'weekday')}
                  >
                    <option value="date">On a specific day of the month</option>
                    <option value="weekday">On a specific weekday (e.g. 2nd Tuesday)</option>
                  </select>
                </Field>
                {monthlyMode === 'date' ? (
                  <Field label="Day of month">
                    <input
                      type="number"
                      min="1"
                      max="31"
                      className={inputClass}
                      value={monthlyDate}
                      onChange={(e) => setMonthlyDate(e.target.value)}
                    />
                  </Field>
                ) : (
                  <div className="space-y-3">
                    <Field label="Week">
                      <select
                        className={inputClass}
                        value={monthlyWeekOrdinal}
                        onChange={(e) => setMonthlyWeekOrdinal(e.target.value as typeof monthlyWeekOrdinal)}
                      >
                        <option value="first">First</option>
                        <option value="second">Second</option>
                        <option value="third">Third</option>
                        <option value="fourth">Fourth</option>
                        <option value="last">Last</option>
                      </select>
                    </Field>
                    <Field label="Day">
                      <select className={inputClass} value={monthlyWeekday} onChange={(e) => setMonthlyWeekday(e.target.value)}>
                        {DAYS.map((d, i) => (
                          <option key={d} value={i}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
              </>
            )}

            {recurrenceChoice === 'once' && (
              <Field label="Date">
                <input type="date" className={dateInputClass} value={onceDate} onChange={(e) => setOnceDate(e.target.value)} />
              </Field>
            )}

            {recurrenceChoice === 'other' && (
              <>
                <Field label="Day of week">
                  <select className={inputClass} value={otherDayOfWeek} onChange={(e) => setOtherDayOfWeek(e.target.value)}>
                    {DAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Note (optional)">
                  <input
                    className={inputClass}
                    value={otherNote}
                    onChange={(e) => setOtherNote(e.target.value)}
                    placeholder="e.g. every other Friday"
                  />
                </Field>
              </>
            )}

            <Field label="Start time">
              <input type="time" className={timeInputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field label="End time">
              <input type="time" className={timeInputClass} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </Field>
            <Field label="Unpaid break (minutes)">
              <input
                type="number"
                min="0"
                className={inputClass}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
              />
            </Field>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowAddShiftModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? 'Saving…' : 'Save shift'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
