import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { shiftHours } from '../lib/schedule'
import { Card, Button, Field, inputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import type { ScheduleShift, ScheduleTemplate } from '../lib/types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function Schedule() {
  const { user } = useAuth()
  const { household, isParentOrCoAdmin, isNanny, caregiverProfile } = useHousehold()
  const { caregivers } = useCaregivers(household?.id)
  const [caregiverId, setCaregiverId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([])
  const [shifts, setShifts] = useState<Record<string, ScheduleShift[]>>({})
  const [showForm, setShowForm] = useState(false)
  const [name] = useState('Standard week')
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

  useEffect(() => {
    if (caregiverId) loadSchedule(caregiverId)
  }, [caregiverId])

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
            name,
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

  const allShifts = templates.flatMap((t) =>
    (shifts[t.id] ?? []).map((s) => ({ ...s, templateName: t.name }))
  )
  const sorted = [...allShifts].sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0))

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

      {sorted.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">No recurring shifts yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((shift) => (
            <Card key={shift.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {DAYS[shift.day_of_week ?? 0]} · {shift.start_time}–{shift.end_time}
                  </p>
                  <p className="text-xs text-gray-500">{shiftHours(shift).toFixed(2)} hrs</p>
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
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
