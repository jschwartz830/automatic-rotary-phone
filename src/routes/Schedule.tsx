import { useEffect, useState, type FormEvent } from 'react'
import { addDays, format, startOfWeek } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { generateShiftsForRange, shiftHours } from '../lib/schedule'
import { Card, Button, Field, inputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import { StatusChip } from '../components/StatusChip'
import type { LeaveRequest, ScheduleShift, ScheduleTemplate } from '../lib/types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toIsoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function Schedule() {
  const { user } = useAuth()
  const { household, isParentOrCoAdmin, isNanny, caregiverProfile } = useHousehold()
  const { caregivers } = useCaregivers(household?.id)
  const [caregiverId, setCaregiverId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([])
  const [shifts, setShifts] = useState<Record<string, ScheduleShift[]>>({})
  const [leaveForWeek, setLeaveForWeek] = useState<LeaveRequest[]>([])
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [dayOfWeek, setDayOfWeek] = useState('1')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [breakMinutes, setBreakMinutes] = useState('0')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    if (caregiverId) {
      loadSchedule(caregiverId)
      loadLeave(caregiverId, weekStart)
    }
  }, [caregiverId])

  useEffect(() => {
    if (caregiverId) loadLeave(caregiverId, weekStart)
  }, [weekStart, caregiverId])

  async function handleAddShift(e: FormEvent) {
    e.preventDefault()
    if (!caregiverId || !household) return
    setSubmitting(true)
    setError(null)
    try {
      let template = templates[0]
      if (!template) {
        const { data: newTemplate, error: templateError } = await supabase
          .from('schedule_templates')
          .insert({
            caregiver_id: caregiverId,
            name: 'Standard week',
            recurrence_type: 'weekly',
            recurrence_rule: {},
            effective_start_date: new Date().toISOString().slice(0, 10),
            created_by: user?.id ?? null,
          })
          .select()
          .single()
        if (templateError) throw templateError
        template = newTemplate as ScheduleTemplate
        setTemplates([template])
      }

      const { error: shiftError } = await supabase.from('schedule_shifts').insert({
        schedule_template_id: template.id,
        day_of_week: Number(dayOfWeek),
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
        after: { day_of_week: dayOfWeek, startTime, endTime },
      })

      setShowForm(false)
      await loadSchedule(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not add shift.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteShift(shiftId: string) {
    if (!caregiverId) return
    await supabase.from('schedule_shifts').delete().eq('id', shiftId)
    await loadSchedule(caregiverId)
  }

  const weekEnd = addDays(weekStart, 6)
  const weekOccurrences = generateShiftsForRange(templates, shifts, toIsoDate(weekStart), toIsoDate(weekEnd))
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const todayStr = toIsoDate(new Date())

  const allShifts = templates.flatMap((t) =>
    (shifts[t.id] ?? []).map((s) => ({ ...s, templateName: t.name }))
  )
  const sortedShifts = [...allShifts].sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0))

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Schedule</h1>
        {isParentOrCoAdmin && (
          <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ Add shift'}
          </Button>
        )}
      </div>

      {isParentOrCoAdmin && <CaregiverSelect caregivers={caregivers} value={caregiverId} onChange={setCaregiverId} />}

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          className="rounded-lg px-3 py-2 text-gray-500 active:bg-gray-100"
          onClick={() => { setWeekStart((w) => addDays(w, -7)); setSelectedDay(null) }}
        >
          ←
        </button>
        <p className="text-sm font-medium text-gray-700">
          {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
        </p>
        <button
          className="rounded-lg px-3 py-2 text-gray-500 active:bg-gray-100"
          onClick={() => { setWeekStart((w) => addDays(w, 7)); setSelectedDay(null) }}
        >
          →
        </button>
      </div>

      {/* Weekly grid */}
      <Card>
        <div className="divide-y divide-gray-100">
          {weekDays.map((day) => {
            const dayStr = toIsoDate(day)
            const dayOccs = weekOccurrences.filter((o) => o.date === dayStr)
            const dayLeave = leaveForWeek.filter(
              (l) => l.start_date <= dayStr && (l.end_date ?? l.start_date) >= dayStr
            )
            const totalHours = dayOccs.reduce((sum, o) => sum + shiftHours(o.shift), 0)
            const isSelected = selectedDay === dayStr
            const isToday = dayStr === todayStr

            return (
              <div key={dayStr}>
                <button
                  className="flex w-full items-start gap-3 py-3 text-left"
                  onClick={() => setSelectedDay(isSelected ? null : dayStr)}
                >
                  <div className={`flex w-10 shrink-0 flex-col items-center rounded-lg py-0.5 ${isToday ? 'bg-gray-900' : ''}`}>
                    <span className={`text-xs font-medium ${isToday ? 'text-gray-300' : 'text-gray-500'}`}>
                      {format(day, 'EEE')}
                    </span>
                    <span className={`text-base font-bold leading-tight ${isToday ? 'text-white' : 'text-gray-900'}`}>
                      {format(day, 'd')}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    {dayOccs.length === 0 && dayLeave.length === 0 ? (
                      <p className="text-sm text-gray-400">Off</p>
                    ) : (
                      <>
                        {dayOccs.map((occ) => (
                          <p key={occ.shift.id} className="text-sm text-gray-900">
                            {occ.shift.start_time}–{occ.shift.end_time}
                            <span className="ml-1 text-xs text-gray-500">· {shiftHours(occ.shift).toFixed(1)}h</span>
                          </p>
                        ))}
                        {dayLeave.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {dayLeave.map((l) => (
                              <span
                                key={l.id}
                                className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium capitalize text-blue-700"
                              >
                                {l.leave_type.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {totalHours > 0 && (
                    <span className="shrink-0 text-sm font-semibold text-gray-700">{totalHours.toFixed(1)}h</span>
                  )}
                </button>

                {isSelected && (dayOccs.length > 0 || dayLeave.length > 0) && (
                  <div className="mb-3 ml-[52px] space-y-2 rounded-xl bg-gray-50 p-3">
                    {dayOccs.map((occ) => (
                      <div key={occ.shift.id} className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {occ.shift.start_time} – {occ.shift.end_time}
                          </p>
                          <p className="text-xs text-gray-500">
                            {shiftHours(occ.shift).toFixed(2)} hrs
                            {occ.shift.break_minutes > 0 ? ` · ${occ.shift.break_minutes}m break` : ''}
                          </p>
                        </div>
                        {isParentOrCoAdmin && (
                          <button
                            className="shrink-0 text-xs text-red-600 underline"
                            onClick={(e) => { e.stopPropagation(); handleDeleteShift(occ.shift.id) }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    {dayLeave.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium capitalize text-gray-900">
                            {l.leave_type.replace(/_/g, ' ')}
                          </p>
                          {l.hours_requested != null && (
                            <p className="text-xs text-gray-500">{l.hours_requested} hrs</p>
                          )}
                        </div>
                        <StatusChip status={l.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {showForm && (
        <Card title="New recurring shift">
          <form onSubmit={handleAddShift} className="space-y-3">
            <Field label="Day of week">
              <select className={inputClass} value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex gap-3">
              <Field label="Start time">
                <input type="time" className={inputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </Field>
              <Field label="End time">
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save shift'}
            </Button>
          </form>
        </Card>
      )}

      {sortedShifts.length > 0 && (
        <Card title="Recurring schedule">
          <div className="space-y-2">
            {sortedShifts.map((shift) => (
              <div key={shift.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {DAYS[shift.day_of_week ?? 0]} · {shift.start_time}–{shift.end_time}
                  </p>
                  <p className="text-xs text-gray-500">{shiftHours(shift).toFixed(2)} hrs recurring</p>
                </div>
                {isParentOrCoAdmin && (
                  <button
                    className="text-xs text-red-600 underline"
                    onClick={() => handleDeleteShift(shift.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
