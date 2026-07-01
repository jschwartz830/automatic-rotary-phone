import { useEffect, useState, type FormEvent } from 'react'
import { addDays, format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { isValidCalendarDate } from '../lib/dates'
import { calculateTimesheet } from '../lib/calc'
import { downloadCsv } from '../lib/csv'
import { generateShiftsForRange, shiftHours } from '../lib/schedule'
import { Card, Button, Field, inputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import { StatusChip } from '../components/StatusChip'
import type { CaregiverProfile, LeaveRequest, PaymentRecord, ScheduleShift, ScheduleTemplate, TimeEntry, Timesheet } from '../lib/types'

function computeDueDate(periodEnd: string, caregiver: CaregiverProfile): string {
  if (caregiver.payday_rule === 'days_after_period_end' && caregiver.payday_days_after_period_end != null) {
    return format(addDays(new Date(periodEnd), caregiver.payday_days_after_period_end), 'yyyy-MM-dd')
  }
  if (caregiver.payday_rule === 'same_day_each_week' && caregiver.payday_day_of_week != null) {
    const end = new Date(periodEnd)
    const daysUntil = (caregiver.payday_day_of_week - end.getDay() + 7) % 7 || 7
    return format(addDays(end, daysUntil), 'yyyy-MM-dd')
  }
  return periodEnd
}

export function Pay() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { household, isNanny, isParentOrCoAdmin, caregiverProfile } = useHousehold()
  const { caregivers } = useCaregivers(household?.id)
  const [caregiverId, setCaregiverId] = useState<string | null>(null)
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [showForm, setShowForm] = useState(false)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showArchive, setShowArchive] = useState(false)
  const [pendingUnapproved, setPendingUnapproved] = useState<TimeEntry[]>([])
  // Payment correction state
  const [correctingPayment, setCorrectingPayment] = useState<PaymentRecord | null>(null)
  const [correctionAmount, setCorrectionAmount] = useState('')
  const [correctionNote, setCorrectionNote] = useState('')
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false)

  const activeCaregiver = isNanny ? caregiverProfile : caregivers.find((c) => c.id === caregiverId) ?? null
  const activeTimesheets = timesheets.filter((t) => !t.deleted_at)
  const trashedTimesheets = timesheets.filter((t) => t.deleted_at)
  const activePayments = payments.filter((p) => !p.deleted_at)

  useEffect(() => {
    if (isNanny && caregiverProfile) {
      setCaregiverId(caregiverProfile.id)
    } else if (!caregiverId && caregivers.length > 0) {
      setCaregiverId(caregivers[0].id)
    }
  }, [caregivers, isNanny, caregiverProfile, caregiverId])

  async function loadData(forCaregiverId: string) {
    const [tsRes, payRes] = await Promise.all([
      supabase
        .from('timesheets')
        .select('*')
        .eq('caregiver_id', forCaregiverId)
        .order('period_start', { ascending: false }),
      supabase
        .from('payment_records')
        .select('*')
        .eq('caregiver_id', forCaregiverId)
        .order('due_date', { ascending: false }),
    ])
    setTimesheets((tsRes.data ?? []) as Timesheet[])
    setPayments((payRes.data ?? []) as PaymentRecord[])
  }

  useEffect(() => {
    if (caregiverId) loadData(caregiverId)
  }, [caregiverId])

  async function computeGuaranteedHoursBase(caregiver: CaregiverProfile, start: string, end: string): Promise<number> {
    if (!caregiver.guaranteed_hours_enabled) return 0
    if (caregiver.guaranteed_hours_basis === 'linked_to_schedule') {
      // Sum shift hours from active recurring schedule where counts_toward_guaranteed_hours = true.
      const { data: templateRows } = await supabase
        .from('schedule_templates')
        .select('*')
        .eq('caregiver_id', caregiver.id)
        .eq('active', true)
      const templates = (templateRows ?? []) as ScheduleTemplate[]
      if (templates.length === 0) return 0
      const { data: shiftRows } = await supabase
        .from('schedule_shifts')
        .select('*')
        .in('schedule_template_id', templates.map((t) => t.id))
      const shiftsByTemplate: Record<string, ScheduleShift[]> = {}
      for (const shift of (shiftRows ?? []) as ScheduleShift[]) {
        shiftsByTemplate[shift.schedule_template_id] ??= []
        shiftsByTemplate[shift.schedule_template_id].push(shift)
      }
      const occurrences = generateShiftsForRange(templates, shiftsByTemplate, start, end)
      return occurrences
        .filter((o) => o.shift.counts_toward_guaranteed_hours)
        .reduce((sum, o) => sum + shiftHours(o.shift), 0)
    }
    return caregiver.fixed_weekly_guaranteed_hours ?? caregiver.fixed_pay_period_guaranteed_hours ?? 0
  }

  async function doGenerate(timeEntries: TimeEntry[]) {
    if (!caregiverId || !household || !activeCaregiver) return
    const actualWorkedHours = timeEntries
      .filter((t) => t.status === 'approved')
      .reduce((sum, t) => sum + (t.paid_hours ?? 0), 0)

    const { data: leaveRows } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('caregiver_id', caregiverId)
      .eq('status', 'approved')
      .gte('start_date', periodStart)
      .lte('end_date', periodEnd)
    const leaveRequests = (leaveRows ?? []) as LeaveRequest[]
    const sumLeave = (type: LeaveRequest['leave_type']) =>
      leaveRequests.filter((l) => l.leave_type === type).reduce((sum, l) => sum + (l.hours_requested ?? 0), 0)

    const guaranteedHoursBase = await computeGuaranteedHoursBase(activeCaregiver, periodStart, periodEnd)

    const result = calculateTimesheet({
      actualWorkedHours,
      paidPtoHours: sumLeave('pto'),
      paidSickHours: sumLeave('sick'),
      paidHolidayHours: sumLeave('holiday'),
      familyCancellationHours: 0,
      unpaidTimeOffHours: sumLeave('unpaid'),
      guaranteedHoursBase,
      unpaidTimeOffReducesGuarantee: activeCaregiver.unpaid_time_off_reduces_guarantee,
      overtimeThresholdHours: activeCaregiver.overtime_threshold_hours,
      overtimeMultiplier: activeCaregiver.overtime_multiplier,
      hourlyRate: activeCaregiver.default_hourly_rate ?? 0,
      reimbursements: 0,
      manualAdjustments: 0,
    })

    const { data: timesheet, error: tsError } = await supabase
      .from('timesheets')
      .insert({
        caregiver_id: caregiverId,
        period_start: periodStart,
        period_end: periodEnd,
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user?.id ?? null,
        guaranteed_hours: result.guaranteedHours,
        actual_worked_hours: actualWorkedHours,
        regular_worked_hours: result.regularWorkedHours,
        overtime_worked_hours: result.overtimeWorkedHours,
        paid_pto_hours: sumLeave('pto'),
        paid_sick_hours: sumLeave('sick'),
        paid_holiday_hours: sumLeave('holiday'),
        unpaid_time_off_hours: sumLeave('unpaid'),
        guarantee_adjustment_hours: result.guaranteeAdjustmentHours,
        payable_regular_hours: result.payableRegularHours,
        payable_overtime_hours: result.payableOvertimeHours,
        hourly_rate: activeCaregiver.default_hourly_rate,
        overtime_rate: result.overtimeRate,
        gross_pay_due: result.grossPayDue,
      })
      .select()
      .single()
    if (tsError) throw tsError

    await logAuditEvent({
      householdId: household.id,
      actorUserId: user?.id ?? '',
      entityType: 'timesheet',
      entityId: timesheet.id,
      action: 'create',
      after: { periodStart, periodEnd, grossPayDue: result.grossPayDue },
    })

    const dueDate = computeDueDate(periodEnd, activeCaregiver)

    const { error: payError } = await supabase.from('payment_records').insert({
      caregiver_id: caregiverId,
      timesheet_id: timesheet.id,
      period_start: periodStart,
      period_end: periodEnd,
      due_date: dueDate,
      status: 'due',
      actual_worked_hours: actualWorkedHours,
      regular_worked_hours: result.regularWorkedHours,
      overtime_worked_hours: result.overtimeWorkedHours,
      guaranteed_hours: result.guaranteedHours,
      guarantee_adjustment_hours: result.guaranteeAdjustmentHours,
      payable_regular_hours: result.payableRegularHours,
      payable_overtime_hours: result.payableOvertimeHours,
      paid_pto_hours: sumLeave('pto'),
      paid_sick_hours: sumLeave('sick'),
      paid_holiday_hours: sumLeave('holiday'),
      hourly_rate: activeCaregiver.default_hourly_rate,
      overtime_rate: result.overtimeRate,
      gross_pay_due: result.grossPayDue,
    })
    if (payError) throw payError

    setShowForm(false)
    setPendingUnapproved([])
    await loadData(caregiverId)
  }

  async function handleGenerateTimesheet(e: FormEvent) {
    e.preventDefault()
    if (!caregiverId || !household || !activeCaregiver) return
    if (!isValidCalendarDate(periodStart) || !isValidCalendarDate(periodEnd)) {
      setError('That date does not exist. Please pick a valid date.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { data: entries } = await supabase
        .from('time_entries')
        .select('*')
        .eq('caregiver_id', caregiverId)
        .is('deleted_at', null)
        .gte('date', periodStart)
        .lte('date', periodEnd)
      const timeEntries = (entries ?? []) as TimeEntry[]
      const unapproved = timeEntries.filter((t) => t.status !== 'approved')
      if (unapproved.length > 0) {
        setPendingUnapproved(unapproved)
        return
      }
      await doGenerate(timeEntries)
    } catch (err) {
      setError(errorMessage(err, 'Could not generate timesheet.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGenerateAnyway() {
    if (!caregiverId || !household || !activeCaregiver) return
    setSubmitting(true)
    setError(null)
    try {
      const { data: entries } = await supabase
        .from('time_entries')
        .select('*')
        .eq('caregiver_id', caregiverId)
        .is('deleted_at', null)
        .gte('date', periodStart)
        .lte('date', periodEnd)
      await doGenerate((entries ?? []) as TimeEntry[])
    } catch (err) {
      setError(errorMessage(err, 'Could not generate timesheet.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function markPaid(payment: PaymentRecord) {
    await supabase
      .from('payment_records')
      .update({
        status: 'paid',
        amount_paid: payment.gross_pay_due,
        paid_at: new Date().toISOString(),
        marked_paid_by: user?.id ?? null,
      })
      .eq('id', payment.id)
    if (household) {
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'payment_record',
        entityId: payment.id,
        action: 'mark_paid',
      })
    }
    if (caregiverId) await loadData(caregiverId)
  }

  async function archiveTimesheet(timesheet: Timesheet) {
    if (
      !window.confirm(
        `Archive the timesheet for ${timesheet.period_start} – ${timesheet.period_end}? Its payment record moves with it. You can restore it later from Archived.`
      )
    ) {
      return
    }
    setError(null)
    try {
      const deletedAt = new Date().toISOString()
      const { error: payDeleteError } = await supabase
        .from('payment_records')
        .update({ deleted_at: deletedAt })
        .eq('timesheet_id', timesheet.id)
      if (payDeleteError) throw payDeleteError

      const { error: tsDeleteError } = await supabase
        .from('timesheets')
        .update({ deleted_at: deletedAt })
        .eq('id', timesheet.id)
      if (tsDeleteError) throw tsDeleteError

      if (household) {
        await logAuditEvent({
          householdId: household.id,
          actorUserId: user?.id ?? '',
          entityType: 'timesheet',
          entityId: timesheet.id,
          action: 'archive',
        })
      }

      if (caregiverId) await loadData(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not archive timesheet.'))
    }
  }

  async function restoreTimesheet(timesheet: Timesheet) {
    setError(null)
    try {
      const { error: payRestoreError } = await supabase
        .from('payment_records')
        .update({ deleted_at: null })
        .eq('timesheet_id', timesheet.id)
      if (payRestoreError) throw payRestoreError

      const { error: tsRestoreError } = await supabase
        .from('timesheets')
        .update({ deleted_at: null })
        .eq('id', timesheet.id)
      if (tsRestoreError) throw tsRestoreError

      if (household) {
        await logAuditEvent({
          householdId: household.id,
          actorUserId: user?.id ?? '',
          entityType: 'timesheet',
          entityId: timesheet.id,
          action: 'restore',
        })
      }

      if (caregiverId) await loadData(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not restore timesheet.'))
    }
  }

  async function handleCorrectPayment(e: FormEvent) {
    e.preventDefault()
    if (!correctingPayment || !household) return
    if (!correctionNote.trim()) {
      setError('A note is required for payment corrections.')
      return
    }
    setCorrectionSubmitting(true)
    setError(null)
    try {
      const correctedAmount = Number(correctionAmount)
      const { error: markError } = await supabase
        .from('payment_records')
        .update({ status: 'corrected' })
        .eq('id', correctingPayment.id)
      if (markError) throw markError

      const { error: insertError } = await supabase.from('payment_records').insert({
        caregiver_id: correctingPayment.caregiver_id,
        timesheet_id: correctingPayment.timesheet_id,
        period_start: correctingPayment.period_start,
        period_end: correctingPayment.period_end,
        due_date: new Date().toISOString().slice(0, 10),
        status: 'due',
        actual_worked_hours: correctingPayment.actual_worked_hours,
        regular_worked_hours: correctingPayment.regular_worked_hours,
        overtime_worked_hours: correctingPayment.overtime_worked_hours,
        guaranteed_hours: correctingPayment.guaranteed_hours,
        guarantee_adjustment_hours: correctingPayment.guarantee_adjustment_hours,
        payable_regular_hours: correctingPayment.payable_regular_hours,
        payable_overtime_hours: correctingPayment.payable_overtime_hours,
        paid_pto_hours: correctingPayment.paid_pto_hours,
        paid_sick_hours: correctingPayment.paid_sick_hours,
        paid_holiday_hours: correctingPayment.paid_holiday_hours,
        hourly_rate: correctingPayment.hourly_rate,
        overtime_rate: correctingPayment.overtime_rate,
        gross_pay_due: correctedAmount,
        reimbursements: correctingPayment.reimbursements,
        manual_adjustments: correctingPayment.manual_adjustments,
        parent_note: `Correction of payment from ${correctingPayment.paid_at?.slice(0, 10) ?? correctingPayment.period_end}. Original: $${correctingPayment.gross_pay_due.toFixed(2)}. ${correctionNote}`,
      })
      if (insertError) throw insertError

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'payment_record',
        entityId: correctingPayment.id,
        action: 'correct',
        before: { gross_pay_due: correctingPayment.gross_pay_due, status: correctingPayment.status },
        after: { gross_pay_due: correctedAmount, note: correctionNote },
      })

      setCorrectingPayment(null)
      setCorrectionAmount('')
      setCorrectionNote('')
      if (caregiverId) await loadData(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not save correction.'))
    } finally {
      setCorrectionSubmitting(false)
    }
  }

  function exportTimesheets() {
    downloadCsv(
      'timesheets.csv',
      activeTimesheets.map((t) => ({
        period_start: t.period_start,
        period_end: t.period_end,
        status: t.status,
        actual_worked_hours: t.actual_worked_hours,
        overtime_worked_hours: t.overtime_worked_hours,
        gross_pay_due: t.gross_pay_due,
      }))
    )
  }

  function exportPayments() {
    downloadCsv(
      'payments.csv',
      activePayments.map((p) => ({
        period_start: p.period_start,
        period_end: p.period_end,
        due_date: p.due_date,
        status: p.status,
        gross_pay_due: p.gross_pay_due,
        amount_paid: p.amount_paid,
        paid_at: p.paid_at,
      }))
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Pay</h1>
        {isParentOrCoAdmin && (
          <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ Generate timesheet'}
          </Button>
        )}
      </div>

      {isParentOrCoAdmin && <CaregiverSelect caregivers={caregivers} value={caregiverId} onChange={setCaregiverId} />}

      {error && !showForm && <p className="text-sm text-red-600">{error}</p>}

      {showForm && (
        <Card title="Generate timesheet from time entries">
          <form onSubmit={handleGenerateTimesheet} className="space-y-3">
            <div className="flex gap-3">
              <Field label="Period start">
                <input
                  type="date"
                  className={inputClass}
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  required
                />
              </Field>
              <Field label="Period end">
                <input
                  type="date"
                  className={inputClass}
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  required
                />
              </Field>
            </div>
            {pendingUnapproved.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-sm font-medium text-amber-800">
                  {pendingUnapproved.length} unapproved {pendingUnapproved.length === 1 ? 'entry' : 'entries'} in this period
                </p>
                <ul className="space-y-0.5">
                  {pendingUnapproved.map((e) => (
                    <li key={e.id} className="text-xs text-amber-700">
                      {e.date} · {e.paid_hours?.toFixed(2) ?? '0.00'} hrs · {e.status}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-amber-700">These won't be included in the pay calculation.</p>
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => navigate('/time')}>
                    Review entries
                  </Button>
                  <Button type="button" className="flex-1" onClick={handleGenerateAnyway} disabled={submitting}>
                    {submitting ? 'Generating…' : 'Generate anyway'}
                  </Button>
                </div>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Calculating…' : 'Generate & approve'}
            </Button>
          </form>
        </Card>
      )}

      {correctingPayment && (
        <Card title="Correct payment">
          <form onSubmit={handleCorrectPayment} className="space-y-3">
            <p className="text-xs text-gray-500">
              Original: ${correctingPayment.gross_pay_due.toFixed(2)} for {correctingPayment.period_start} – {correctingPayment.period_end}.
              The original record will be marked corrected and a new payment record will be created.
            </p>
            <Field label="Corrected amount ($)">
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                value={correctionAmount}
                onChange={(e) => setCorrectionAmount(e.target.value)}
                required
              />
            </Field>
            <Field label="Reason for correction (required)">
              <input
                className={inputClass}
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
                required
              />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setCorrectingPayment(null)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={correctionSubmitting}>
                {correctionSubmitting ? 'Saving…' : 'Save correction'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Payments" action={isParentOrCoAdmin && activePayments.length > 0 && (
        <button className="text-xs text-blue-600 underline" onClick={exportPayments}>
          Export CSV
        </button>
      )}>
        {activePayments.length === 0 ? (
          <p className="text-sm text-gray-500">No payment records yet.</p>
        ) : (
          <div className="space-y-2">
            {activePayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {p.period_start} – {p.period_end}
                  </p>
                  <p className="text-xs text-gray-500">Due {p.due_date} · ${p.gross_pay_due.toFixed(2)}</p>
                  {p.parent_note && (
                    <p className="mt-0.5 text-xs text-gray-400">{p.parent_note}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusChip status={p.status} />
                  <div className="flex items-center gap-2">
                    {isParentOrCoAdmin && p.status !== 'paid' && p.status !== 'voided' && p.status !== 'corrected' && (
                      <button className="text-xs text-blue-600 underline" onClick={() => markPaid(p)}>
                        Mark paid
                      </button>
                    )}
                    {isParentOrCoAdmin && p.status === 'paid' && !correctingPayment && (
                      <button
                        className="text-xs text-amber-600 underline"
                        onClick={() => {
                          setCorrectingPayment(p)
                          setCorrectionAmount(p.gross_pay_due.toFixed(2))
                          setCorrectionNote('')
                        }}
                      >
                        Correct
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Timesheets" action={isParentOrCoAdmin && activeTimesheets.length > 0 && (
        <button className="text-xs text-blue-600 underline" onClick={exportTimesheets}>
          Export CSV
        </button>
      )}>
        {activeTimesheets.length === 0 ? (
          <p className="text-sm text-gray-500">No timesheets yet.</p>
        ) : (
          <div className="space-y-2">
            {activeTimesheets.map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {t.period_start} – {t.period_end}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t.actual_worked_hours.toFixed(2)} hrs worked · ${t.gross_pay_due.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip status={t.status} />
                  {isParentOrCoAdmin && t.status !== 'paid' && t.status !== 'locked' && (
                    <button className="text-xs text-red-600 underline" onClick={() => archiveTimesheet(t)}>
                      Archive
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {isParentOrCoAdmin && trashedTimesheets.length > 0 && (
        <Card>
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm font-medium text-gray-700"
            onClick={() => setShowArchive((s) => !s)}
          >
            <span>Archived ({trashedTimesheets.length})</span>
            <span className="text-gray-400">{showArchive ? '▲' : '▼'}</span>
          </button>
          {showArchive && (
            <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              {trashedTimesheets.map((t) => (
                <div key={t.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {t.period_start} – {t.period_end}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t.actual_worked_hours.toFixed(2)} hrs worked · ${t.gross_pay_due.toFixed(2)}
                    </p>
                  </div>
                  <button className="text-xs text-blue-600 underline" onClick={() => restoreTimesheet(t)}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
