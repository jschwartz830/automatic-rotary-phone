import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { addDays, format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { isValidCalendarDate } from '../lib/dates'
import { calculateTimesheet, round2 } from '../lib/calc'
import { downloadCsv } from '../lib/csv'
import { buildDailyPayExportRows } from '../lib/payExport'
import { parseTimesheetImport } from '../lib/timesheetImport'
import { catchUpPayPeriod, computeCurrentPayPeriod } from '../lib/payPeriod'
import {
  generateShiftsForRange,
  scheduleExceptionHoursDelta,
  shiftHours,
  sumExceptionHoursByType,
} from '../lib/schedule'
import { Card, Button, Field, inputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import { StatusChip } from '../components/StatusChip'
import type {
  CaregiverProfile,
  LeaveLedgerEntry,
  LeavePolicy,
  LeaveRequest,
  PaymentRecord,
  ScheduleException,
  ScheduleShift,
  ScheduleTemplate,
  TimeEntry,
  Timesheet,
} from '../lib/types'

function timesheetErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
    return 'A timesheet for this exact date range already exists (it may be in Archived below). Adjust the dates instead of regenerating the same period.'
  }
  return errorMessage(err, fallback)
}

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
  // Mark paid (full or partial) state
  const [markingPaidPayment, setMarkingPaidPayment] = useState<PaymentRecord | null>(null)
  const [markPaidAmount, setMarkPaidAmount] = useState('')
  const [markPaidSubmitting, setMarkPaidSubmitting] = useState(false)
  // Void payment state
  const [voidingPayment, setVoidingPayment] = useState<PaymentRecord | null>(null)
  const [voidNote, setVoidNote] = useState('')
  const [voidSubmitting, setVoidSubmitting] = useState(false)
  // Nanny timesheet submission state
  const [showNannyForm, setShowNannyForm] = useState(false)
  const [nannyPeriodStart, setNannyPeriodStart] = useState('')
  const [nannyPeriodEnd, setNannyPeriodEnd] = useState('')
  const [nannySubmitting, setNannySubmitting] = useState(false)
  // Annual summary export state
  const [annualSummaryYear, setAnnualSummaryYear] = useState(() => String(new Date().getFullYear()))
  const [annualSummaryExporting, setAnnualSummaryExporting] = useState(false)
  const [detailExporting, setDetailExporting] = useState<'timesheets' | 'payments' | null>(null)
  const [importingTimesheets, setImportingTimesheets] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const timesheetImportInput = useRef<HTMLInputElement>(null)

  const activeCaregiver = isNanny ? caregiverProfile : caregivers.find((c) => c.id === caregiverId) ?? null
  const activeTimesheets = timesheets.filter((t) => !t.deleted_at)
  const trashedTimesheets = timesheets.filter((t) => t.deleted_at)
  const activePayments = payments.filter((p) => !p.deleted_at)
  // Includes archived timesheets too -- the unique (caregiver, period_start,
  // period_end) constraint still blocks regenerating an archived period, so
  // catch-up must resume after it, not before.
  const lastPeriodEnd = timesheets.reduce<string | null>(
    (latest, t) => (!latest || t.period_end > latest ? t.period_end : latest),
    null
  )

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

  // Default both date-range forms to the pay period tied to the next
  // payday, so opening either form starts from a sensible range instead of
  // blank inputs.
  useEffect(() => {
    if (!activeCaregiver) return
    const { start, end } = computeCurrentPayPeriod(activeCaregiver)
    setPeriodStart(start)
    setPeriodEnd(end)
    setNannyPeriodStart(start)
    setNannyPeriodEnd(end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caregiverId])

  function applyCatchUpPeriod() {
    if (!activeCaregiver) return
    const { start, end } = catchUpPayPeriod(activeCaregiver, lastPeriodEnd)
    setPeriodStart(start)
    setPeriodEnd(end)
  }

  function applyCatchUpNannyPeriod() {
    if (!activeCaregiver) return
    const { start, end } = catchUpPayPeriod(activeCaregiver, lastPeriodEnd)
    setNannyPeriodStart(start)
    setNannyPeriodEnd(end)
  }

  // Loads schedule templates/shifts/exceptions for a period once so guaranteed
  // hours, scheduled hours, and family cancellation hours can all be derived
  // from the same schedule-exceptions snapshot (spec 13.3, 16.2, 16.3).
  async function loadScheduleContext(caregiverId: string, start: string, end: string) {
    const { data: templateRows } = await supabase
      .from('schedule_templates')
      .select('*')
      .eq('caregiver_id', caregiverId)
      .eq('active', true)
    const templates = (templateRows ?? []) as ScheduleTemplate[]
    const shiftsByTemplate: Record<string, ScheduleShift[]> = {}
    if (templates.length > 0) {
      const { data: shiftRows } = await supabase
        .from('schedule_shifts')
        .select('*')
        .in('schedule_template_id', templates.map((t) => t.id))
      for (const shift of (shiftRows ?? []) as ScheduleShift[]) {
        shiftsByTemplate[shift.schedule_template_id] ??= []
        shiftsByTemplate[shift.schedule_template_id].push(shift)
      }
    }
    const shiftsById: Record<string, ScheduleShift> = Object.fromEntries(
      Object.values(shiftsByTemplate).flat().map((s) => [s.id, s])
    )
    const occurrences = generateShiftsForRange(templates, shiftsByTemplate, start, end)

    const { data: exceptionRows } = await supabase
      .from('schedule_exceptions')
      .select('*')
      .eq('caregiver_id', caregiverId)
      .eq('status', 'approved')
      .gte('date', start)
      .lte('date', end)
    const exceptions = (exceptionRows ?? []) as ScheduleException[]

    return { occurrences, exceptions, shiftsById }
  }

  function computeGuaranteedHoursBase(
    caregiver: CaregiverProfile,
    occurrences: ReturnType<typeof generateShiftsForRange>,
    exceptions: ScheduleException[],
    shiftsById: Record<string, ScheduleShift>
  ): number {
    if (!caregiver.guaranteed_hours_enabled) return 0
    if (caregiver.guaranteed_hours_basis === 'linked_to_schedule') {
      // Sum shift hours from active recurring schedule where
      // counts_toward_guaranteed_hours = true, then apply the net effect of
      // any one-off exceptions explicitly marked as counting toward the
      // guarantee (spec 13.6 "Schedule-Linked Guarantee").
      const base = occurrences
        .filter((o) => o.shift.counts_toward_guaranteed_hours)
        .reduce((sum, o) => sum + shiftHours(o.shift), 0)
      const exceptionDelta = scheduleExceptionHoursDelta(exceptions, shiftsById, { onlyGuaranteed: true })
      return Math.max(base + exceptionDelta, 0)
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

    const { occurrences, exceptions, shiftsById } = await loadScheduleContext(caregiverId, periodStart, periodEnd)
    const scheduledHours = Math.max(
      occurrences.reduce((sum, o) => sum + shiftHours(o.shift), 0) +
        scheduleExceptionHoursDelta(exceptions, shiftsById),
      0
    )
    const guaranteedHoursBase = computeGuaranteedHoursBase(activeCaregiver, occurrences, exceptions, shiftsById)
    // Family cancellation hours (spec 13.3, 13.6) now come from approved
    // schedule exceptions instead of manual entry -- see SPEC_CHANGE_LOG.md.
    // weather_emergency exceptions are folded into the same bucket: both
    // represent "caregiver didn't work, but is paid because of the
    // guarantee" -- there's no separate payable-hours column for weather
    // days, and inventing one for a single exception type wasn't worth a
    // migration. `other` exceptions are intentionally excluded -- too broad
    // a catch-all to assume it should always be guarantee-protected pay.
    const cancellationHours = activeCaregiver.family_cancellation_counts_toward_guarantee
      ? sumExceptionHoursByType(exceptions, shiftsById, 'family_cancellation', { requireAffectsPay: true }) +
        sumExceptionHoursByType(exceptions, shiftsById, 'weather_emergency', { requireAffectsPay: true })
      : 0

    const result = calculateTimesheet({
      actualWorkedHours,
      paidPtoHours: sumLeave('pto'),
      paidSickHours: sumLeave('sick'),
      paidHolidayHours: sumLeave('holiday'),
      familyCancellationHours: cancellationHours,
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
        scheduled_hours: scheduledHours,
        guaranteed_hours: result.guaranteedHours,
        actual_worked_hours: actualWorkedHours,
        regular_worked_hours: result.regularWorkedHours,
        overtime_worked_hours: result.overtimeWorkedHours,
        paid_pto_hours: sumLeave('pto'),
        paid_sick_hours: sumLeave('sick'),
        paid_holiday_hours: sumLeave('holiday'),
        family_cancellation_hours: cancellationHours,
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
      family_cancellation_hours: cancellationHours,
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
      setError(timesheetErrorMessage(err, 'Could not generate timesheet.'))
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
      setError(timesheetErrorMessage(err, 'Could not generate timesheet.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMarkPaid(e: FormEvent) {
    e.preventDefault()
    if (!markingPaidPayment || !household) return
    const amount = Number(markPaidAmount)
    if (!(amount > 0)) {
      setError('Enter an amount paid greater than 0.')
      return
    }
    setMarkPaidSubmitting(true)
    setError(null)
    try {
      const status = amount < markingPaidPayment.gross_pay_due ? 'partially_paid' : 'paid'
      const { error: updateError } = await supabase
        .from('payment_records')
        .update({
          status,
          amount_paid: amount,
          paid_at: new Date().toISOString(),
          marked_paid_by: user?.id ?? null,
        })
        .eq('id', markingPaidPayment.id)
      if (updateError) throw updateError
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'payment_record',
        entityId: markingPaidPayment.id,
        action: status === 'partially_paid' ? 'mark_partially_paid' : 'mark_paid',
        after: { amount_paid: amount, gross_pay_due: markingPaidPayment.gross_pay_due },
      })
      setMarkingPaidPayment(null)
      setMarkPaidAmount('')
      if (caregiverId) await loadData(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not mark payment paid.'))
    } finally {
      setMarkPaidSubmitting(false)
    }
  }

  async function handleVoidPayment(e: FormEvent) {
    e.preventDefault()
    if (!voidingPayment || !household) return
    if (!voidNote.trim()) {
      setError('A note is required to void a payment.')
      return
    }
    setVoidSubmitting(true)
    setError(null)
    try {
      const { error: voidError } = await supabase
        .from('payment_records')
        .update({
          status: 'voided',
          parent_note: voidNote,
        })
        .eq('id', voidingPayment.id)
      if (voidError) throw voidError
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'payment_record',
        entityId: voidingPayment.id,
        action: 'void',
        before: { status: voidingPayment.status },
        after: { status: 'voided', note: voidNote },
      })
      setVoidingPayment(null)
      setVoidNote('')
      if (caregiverId) await loadData(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not void payment.'))
    } finally {
      setVoidSubmitting(false)
    }
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

  async function handleSubmitTimesheet(e: FormEvent) {
    e.preventDefault()
    if (!caregiverId || !household) return
    if (!isValidCalendarDate(nannyPeriodStart) || !isValidCalendarDate(nannyPeriodEnd)) {
      setError('Please enter valid dates.')
      return
    }
    setNannySubmitting(true)
    setError(null)
    try {
      const { data: entries } = await supabase
        .from('time_entries')
        .select('*')
        .eq('caregiver_id', caregiverId)
        .is('deleted_at', null)
        .gte('date', nannyPeriodStart)
        .lte('date', nannyPeriodEnd)
        .eq('status', 'approved')
      const timeEntries = (entries ?? []) as TimeEntry[]
      const actualWorkedHours = timeEntries.reduce((sum, t) => sum + (t.paid_hours ?? 0), 0)

      const { data: timesheet, error: tsError } = await supabase
        .from('timesheets')
        .insert({
          caregiver_id: caregiverId,
          period_start: nannyPeriodStart,
          period_end: nannyPeriodEnd,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          submitted_by: user?.id ?? null,
          actual_worked_hours: actualWorkedHours,
          scheduled_hours: 0,
          guaranteed_hours: 0,
          regular_worked_hours: actualWorkedHours,
          overtime_worked_hours: 0,
          paid_pto_hours: 0,
          paid_sick_hours: 0,
          paid_holiday_hours: 0,
          family_cancellation_hours: 0,
          unpaid_time_off_hours: 0,
          guarantee_adjustment_hours: 0,
          payable_regular_hours: actualWorkedHours,
          payable_overtime_hours: 0,
          gross_pay_due: 0,
        })
        .select()
        .single()
      if (tsError) throw tsError

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'timesheet',
        entityId: timesheet.id,
        action: 'submit',
        after: { periodStart: nannyPeriodStart, periodEnd: nannyPeriodEnd, actualWorkedHours },
      })

      setShowNannyForm(false)
      setNannyPeriodStart('')
      setNannyPeriodEnd('')
      await loadData(caregiverId)
    } catch (err) {
      setError(timesheetErrorMessage(err, 'Could not submit timesheet.'))
    } finally {
      setNannySubmitting(false)
    }
  }

  async function exportDetailedRecords(
    type: 'timesheets' | 'payments',
    recordsToExport = type === 'timesheets' ? activeTimesheets : activePayments,
    filename = `${type}-daily-detail.csv`
  ) {
    if (!caregiverId) return
    const records = recordsToExport
    if (records.length === 0) return
    setDetailExporting(type)
    setError(null)
    try {
      const periodStart = records.reduce((earliest, record) => record.period_start < earliest ? record.period_start : earliest, records[0].period_start)
      const periodEnd = records.reduce((latest, record) => record.period_end > latest ? record.period_end : latest, records[0].period_end)
      const [entriesResult, leaveResult] = await Promise.all([
        supabase.from('time_entries').select('*').eq('caregiver_id', caregiverId).is('deleted_at', null).gte('date', periodStart).lte('date', periodEnd),
        supabase.from('leave_requests').select('*').eq('caregiver_id', caregiverId).eq('status', 'approved').lte('start_date', periodEnd).gte('end_date', periodStart),
      ])
      if (entriesResult.error) throw entriesResult.error
      if (leaveResult.error) throw leaveResult.error
      const rows = buildDailyPayExportRows(
        records,
        (entriesResult.data ?? []) as TimeEntry[],
        (leaveResult.data ?? []) as LeaveRequest[],
        type === 'timesheets' ? 'timesheet' : 'payment'
      )
      downloadCsv(filename, rows)
    } catch (err) {
      setError(errorMessage(err, `Could not export ${type}.`))
    } finally {
      setDetailExporting(null)
    }
  }

  async function importTimesheets(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !caregiverId || !household) return
    setImportingTimesheets(true)
    setError(null)
    setImportMessage(null)
    try {
      const imported = parseTimesheetImport(await file.text())
      const existingPeriods = new Set(timesheets.map((timesheet) => `${timesheet.period_start}|${timesheet.period_end}`))
      const duplicate = imported.find((timesheet) => existingPeriods.has(`${timesheet.period_start}|${timesheet.period_end}`))
      if (duplicate) {
        throw new Error(`A timesheet already exists for ${duplicate.period_start}–${duplicate.period_end}. No timesheets were imported.`)
      }
      const approvedStatuses = ['approved', 'payment_due', 'paid', 'locked']
      const submittedStatuses = ['submitted', 'needs_correction']
      const rows = imported.map((timesheet) => ({
        ...timesheet,
        caregiver_id: caregiverId,
        submitted_at: submittedStatuses.includes(timesheet.status) ? new Date().toISOString() : null,
        submitted_by: submittedStatuses.includes(timesheet.status) ? user?.id ?? null : null,
        approved_at: approvedStatuses.includes(timesheet.status) ? new Date().toISOString() : null,
        approved_by: approvedStatuses.includes(timesheet.status) ? user?.id ?? null : null,
      }))
      const { data: insertedTimesheets, error: insertError } = await supabase.from('timesheets').insert(rows).select('id')
      if (insertError) throw insertError
      if (insertedTimesheets?.[0]) {
        await logAuditEvent({
          householdId: household.id,
          actorUserId: user?.id ?? '',
          entityType: 'timesheet',
          entityId: insertedTimesheets[0].id,
          action: 'import',
          after: { count: rows.length, periods: rows.map((row) => `${row.period_start}–${row.period_end}`) },
        })
      }
      setImportMessage(`Imported ${rows.length} timesheet${rows.length === 1 ? '' : 's'}. Payment records are not created by an import.`)
      await loadData(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not import timesheets.'))
    } finally {
      setImportingTimesheets(false)
    }
  }

  // Spec 13.11 "Annual Summary" export. Scopes timesheets/payments by the
  // calendar year of their period_start (a period spanning a year boundary
  // lands in the year it started, same as everywhere else the app buckets by
  // period). PTO/sick balance at year-end comes straight from the leave
  // ledger as of Dec 31 of the selected year, not the live "today" balance.
  async function exportAnnualSummary() {
    if (!caregiverId || !activeCaregiver) return
    setAnnualSummaryExporting(true)
    setError(null)
    try {
      const year = annualSummaryYear
      const yearTimesheets = activeTimesheets.filter((t) => t.period_start.slice(0, 4) === year)
      const yearPayments = activePayments.filter((p) => p.period_start.slice(0, 4) === year)
      const sum = (values: number[]) => round2(values.reduce((a, b) => a + b, 0))

      const paymentDates = yearPayments
        .filter((p) => p.paid_at)
        .map((p) => (p.paid_at as string).slice(0, 10))
        .sort()
        .join('; ')

      const [{ data: policyRows }, { data: ledgerRows }] = await Promise.all([
        supabase.from('leave_policies').select('*').eq('caregiver_id', caregiverId).in('leave_type', ['pto', 'sick']),
        supabase.from('leave_ledger').select('*').eq('caregiver_id', caregiverId).lte('event_date', `${year}-12-31`),
      ])
      const policies = (policyRows ?? []) as LeavePolicy[]
      const ledger = (ledgerRows ?? []) as LeaveLedgerEntry[]
      const balanceAtYearEnd = (leaveType: 'pto' | 'sick'): number | null => {
        const policy = policies.find((p) => p.leave_type === leaveType)
        if (!policy) return null
        return sum(ledger.filter((e) => e.leave_policy_id === policy.id).map((e) => e.hours_delta))
      }

      downloadCsv(`annual-summary-${year}-${activeCaregiver.name}.csv`, [
        {
          year,
          caregiver: activeCaregiver.name,
          total_actual_hours_worked: sum(yearTimesheets.map((t) => t.actual_worked_hours)),
          regular_worked_hours: sum(yearTimesheets.map((t) => t.regular_worked_hours)),
          overtime_worked_hours: sum(yearTimesheets.map((t) => t.overtime_worked_hours)),
          pto_hours_paid: sum(yearTimesheets.map((t) => t.paid_pto_hours)),
          sick_hours_paid: sum(yearTimesheets.map((t) => t.paid_sick_hours)),
          holiday_hours_paid: sum(yearTimesheets.map((t) => t.paid_holiday_hours)),
          family_cancellation_hours: sum(yearTimesheets.map((t) => t.family_cancellation_hours)),
          guaranteed_hours: sum(yearTimesheets.map((t) => t.guaranteed_hours)),
          guarantee_adjustment_hours: sum(yearTimesheets.map((t) => t.guarantee_adjustment_hours)),
          gross_pay_due: sum(yearPayments.map((p) => p.gross_pay_due)),
          gross_amount_paid: sum(yearPayments.filter((p) => p.amount_paid != null).map((p) => p.amount_paid as number)),
          reimbursements: sum(yearPayments.map((p) => p.reimbursements)),
          manual_adjustments: sum(yearPayments.map((p) => p.manual_adjustments)),
          payment_dates: paymentDates,
          pto_balance_year_end: balanceAtYearEnd('pto') ?? '',
          sick_balance_year_end: balanceAtYearEnd('sick') ?? '',
        },
      ])
    } catch (err) {
      setError(errorMessage(err, 'Could not export annual summary.'))
    } finally {
      setAnnualSummaryExporting(false)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">Pay</h1>
        {isParentOrCoAdmin && (
          <div className="flex gap-2">
            <input ref={timesheetImportInput} type="file" accept=".csv,text/csv" className="hidden" onChange={importTimesheets} />
            <Button variant="secondary" onClick={() => timesheetImportInput.current?.click()} disabled={importingTimesheets}>
              {importingTimesheets ? 'Importing…' : 'Import timesheets'}
            </Button>
            <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cancel' : '+ Generate timesheet'}
            </Button>
          </div>
        )}
        {isNanny && (
          <Button variant="secondary" onClick={() => setShowNannyForm((s) => !s)}>
            {showNannyForm ? 'Cancel' : 'Submit timesheet'}
          </Button>
        )}
      </div>

      {isParentOrCoAdmin && <CaregiverSelect caregivers={caregivers} value={caregiverId} onChange={setCaregiverId} />}

      {error && !showForm && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {importMessage && <p className="text-sm text-emerald-700 dark:text-emerald-300">{importMessage}</p>}

      {showForm && (
        <Card title="Generate timesheet from time entries">
          <form onSubmit={handleGenerateTimesheet} className="space-y-3">
            <div className="space-y-3">
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
            <button
              type="button"
              className="text-xs text-blue-600 underline dark:text-blue-400"
              onClick={applyCatchUpPeriod}
            >
              Catch up since last period{lastPeriodEnd ? ` (${lastPeriodEnd})` : ''}
            </button>
            {activeCaregiver?.family_cancellation_counts_toward_guarantee && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Family cancellation and weather/emergency hours are pulled automatically from approved schedule
                exceptions for this period. Add them from the{' '}
                <button type="button" className="text-blue-600 underline dark:text-blue-400" onClick={() => navigate('/calendar')}>
                  Calendar
                </button>{' '}
                before generating if any happened.
              </p>
            )}
            {pendingUnapproved.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  {pendingUnapproved.length} unapproved {pendingUnapproved.length === 1 ? 'entry' : 'entries'} in this period
                </p>
                <ul className="space-y-0.5">
                  {pendingUnapproved.map((e) => (
                    <li key={e.id} className="text-xs text-amber-700 dark:text-amber-400">
                      {e.date} · {e.paid_hours?.toFixed(2) ?? '0.00'} hrs · {e.status}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-amber-700 dark:text-amber-400">These won't be included in the pay calculation.</p>
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
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Calculating…' : 'Generate & approve'}
            </Button>
          </form>
        </Card>
      )}

      {isNanny && showNannyForm && (
        <Card title="Submit timesheet for review">
          <form onSubmit={handleSubmitTimesheet} className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Submit your approved time entries for this period so your employer can review and calculate pay.
            </p>
            <div className="space-y-3">
              <Field label="Period start">
                <input
                  type="date"
                  className={inputClass}
                  value={nannyPeriodStart}
                  onChange={(e) => setNannyPeriodStart(e.target.value)}
                  required
                />
              </Field>
              <Field label="Period end">
                <input
                  type="date"
                  className={inputClass}
                  value={nannyPeriodEnd}
                  onChange={(e) => setNannyPeriodEnd(e.target.value)}
                  required
                />
              </Field>
            </div>
            <button
              type="button"
              className="text-xs text-blue-600 underline dark:text-blue-400"
              onClick={applyCatchUpNannyPeriod}
            >
              Catch up since last period{lastPeriodEnd ? ` (${lastPeriodEnd})` : ''}
            </button>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={nannySubmitting}>
              {nannySubmitting ? 'Submitting…' : 'Submit for review'}
            </Button>
          </form>
        </Card>
      )}

      {markingPaidPayment && (
        <Card title="Mark payment paid">
          <form onSubmit={handleMarkPaid} className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Due ${markingPaidPayment.gross_pay_due.toFixed(2)} for {markingPaidPayment.period_start} –{' '}
              {markingPaidPayment.period_end}. Enter less than the full amount to record a partial payment.
            </p>
            <Field label="Amount paid ($)">
              <input
                type="number"
                step="0.01"
                min="0.01"
                className={inputClass}
                value={markPaidAmount}
                onChange={(e) => setMarkPaidAmount(e.target.value)}
                required
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setMarkingPaidPayment(null)}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={markPaidSubmitting}>
                {markPaidSubmitting ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {voidingPayment && (
        <Card title="Void payment">
          <form onSubmit={handleVoidPayment} className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ${voidingPayment.gross_pay_due.toFixed(2)} for {voidingPayment.period_start} – {voidingPayment.period_end}{' '}
              will be marked voided. It is kept for the record, not deleted.
            </p>
            <Field label="Reason for voiding (required)">
              <input
                className={inputClass}
                value={voidNote}
                onChange={(e) => setVoidNote(e.target.value)}
                required
              />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setVoidingPayment(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" className="flex-1" disabled={voidSubmitting}>
                {voidSubmitting ? 'Saving…' : 'Void payment'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {correctingPayment && (
        <Card title="Correct payment">
          <form onSubmit={handleCorrectPayment} className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
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

      {isParentOrCoAdmin && caregiverId && (
        <Card title="Annual summary">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="Year">
                <input
                  type="number"
                  className={inputClass}
                  value={annualSummaryYear}
                  onChange={(e) => setAnnualSummaryYear(e.target.value)}
                />
              </Field>
            </div>
            <Button
              variant="secondary"
              onClick={exportAnnualSummary}
              disabled={annualSummaryExporting || detailExporting !== null}
            >
              {annualSummaryExporting ? 'Exporting…' : 'Export totals CSV'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => exportDetailedRecords(
                'payments',
                activePayments.filter((payment) => payment.period_start.slice(0, 4) === annualSummaryYear),
                `annual-${annualSummaryYear}-daily-detail.csv`
              )}
              disabled={annualSummaryExporting || detailExporting !== null}
            >
              {detailExporting === 'payments' ? 'Exporting…' : 'Export daily detail'}
            </Button>
          </div>
        </Card>
      )}

      <Card title="Payments" action={isParentOrCoAdmin && activePayments.length > 0 && (
        <button className="text-xs text-blue-600 underline dark:text-blue-400" onClick={() => exportDetailedRecords('payments')} disabled={detailExporting !== null}>
          {detailExporting === 'payments' ? 'Exporting…' : 'Export daily CSV'}
        </button>
      )}>
        {activePayments.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No payment records yet.</p>
        ) : (
          <div className="space-y-2">
            {activePayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0 dark:border-gray-700">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {p.period_start} – {p.period_end}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Due {p.due_date} · ${p.gross_pay_due.toFixed(2)}</p>
                  {p.parent_note && (
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{p.parent_note}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusChip status={p.status} />
                  <div className="flex items-center gap-2">
                    {isParentOrCoAdmin &&
                      (p.status === 'due' || p.status === 'overdue' || p.status === 'upcoming' || p.status === 'partially_paid') && (
                        <button
                          className="text-xs text-blue-600 underline dark:text-blue-400"
                          onClick={() => {
                            setMarkingPaidPayment(p)
                            setMarkPaidAmount((p.gross_pay_due - (p.amount_paid ?? 0)).toFixed(2))
                          }}
                        >
                          Mark paid
                        </button>
                      )}
                    {isParentOrCoAdmin && p.status === 'paid' && (
                      <button
                        className="text-xs text-amber-600 underline dark:text-amber-400"
                        onClick={() => {
                          setCorrectingPayment(p)
                          setCorrectionAmount(p.gross_pay_due.toFixed(2))
                          setCorrectionNote('')
                        }}
                      >
                        Correct
                      </button>
                    )}
                    {isParentOrCoAdmin &&
                      (p.status === 'due' || p.status === 'overdue' || p.status === 'upcoming' || p.status === 'partially_paid') && (
                        <button
                          className="text-xs text-red-500 underline dark:text-red-400"
                          onClick={() => {
                            setVoidingPayment(p)
                            setVoidNote('')
                          }}
                        >
                          Void
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
        <button className="text-xs text-blue-600 underline dark:text-blue-400" onClick={() => exportDetailedRecords('timesheets')} disabled={detailExporting !== null}>
          {detailExporting === 'timesheets' ? 'Exporting…' : 'Export daily CSV'}
        </button>
      )}>
        {activeTimesheets.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No timesheets yet.</p>
        ) : (
          <div className="space-y-2">
            {activeTimesheets.map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0 dark:border-gray-700">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t.period_start} – {t.period_end}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t.actual_worked_hours.toFixed(2)} hrs worked · ${t.gross_pay_due.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip status={t.status} />
                  {isParentOrCoAdmin && t.status !== 'paid' && t.status !== 'locked' && (
                    <button className="text-xs text-red-600 underline dark:text-red-400" onClick={() => archiveTimesheet(t)}>
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
            className="flex w-full items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300"
            onClick={() => setShowArchive((s) => !s)}
          >
            <span>Archived ({trashedTimesheets.length})</span>
            <span className="text-gray-400 dark:text-gray-500">{showArchive ? '▲' : '▼'}</span>
          </button>
          {showArchive && (
            <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-gray-700">
              {trashedTimesheets.map((t) => (
                <div key={t.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0 dark:border-gray-700">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {t.period_start} – {t.period_end}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t.actual_worked_hours.toFixed(2)} hrs worked · ${t.gross_pay_due.toFixed(2)}
                    </p>
                  </div>
                  <button className="text-xs text-blue-600 underline dark:text-blue-400" onClick={() => restoreTimesheet(t)}>
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
