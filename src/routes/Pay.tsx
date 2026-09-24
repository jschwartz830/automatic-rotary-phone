import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useSelectedCaregiver } from '../context/SelectedCaregiverContext'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { formatDay, formatDayRange, formatHours, formatMoney, isValidCalendarDate, todayIso } from '../lib/dates'
import { calculateTimesheet, round2 } from '../lib/calc'
import { downloadCsv, downloadJson } from '../lib/csv'
import { buildDailyPayExportRows, buildTimesheetDailyBreakdown, type DailyBreakdown } from '../lib/payExport'
import { parseTimesheetImport } from '../lib/timesheetImport'
import { catchUpPayPeriod, computeCurrentPayPeriod, formatPaymentMethod, paymentDisplayStatus } from '../lib/payPeriod'
import {
  computeGuaranteedHoursBase,
  generateShiftsForRange,
  scheduleExceptionHoursDelta,
  shiftHours,
  sumExceptionHoursByType,
} from '../lib/schedule'
import { Card, Button, Field, inputClass, dateInputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import { StatusChip } from '../components/StatusChip'
import { SwipeRow } from '../components/SwipeRow'
import { Modal } from '../components/Modal'
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

// Spec 13.6 "Timesheet Display for Guaranteed Hours" / 13.8 "Payment Record
// Fields" -- shows the full worked/leave/guarantee hour breakdown that both a
// timesheet and its payment record already store but previously rendered
// nowhere in the UI. `showGuaranteedHours` hides just the guaranteed-hours
// and guarantee-adjustment rows for a nanny whose caregiver has
// nanny_can_view_guaranteed_hours = false (spec 11/15.4); every other row is
// always shown, since only those two fields are gated by that flag.
function HourRow({ label, hours }: { label: string; hours: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-900 dark:text-gray-100">{hours.toFixed(2)}</span>
    </div>
  )
}

function HoursBreakdown({
  record,
  showGuaranteedHours,
}: {
  record: {
    actual_worked_hours: number
    regular_worked_hours: number
    overtime_worked_hours: number
    paid_pto_hours: number
    paid_sick_hours: number
    paid_holiday_hours: number
    family_cancellation_hours: number
    guaranteed_hours: number
    guarantee_adjustment_hours: number
    payable_regular_hours: number
    payable_overtime_hours: number
  }
  showGuaranteedHours: boolean
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-gray-50 p-3 text-xs dark:bg-gray-800/60">
      <HourRow label="Actual worked" hours={record.actual_worked_hours} />
      <HourRow label="Regular" hours={record.regular_worked_hours} />
      <HourRow label="Overtime" hours={record.overtime_worked_hours} />
      <HourRow label="Paid PTO" hours={record.paid_pto_hours} />
      <HourRow label="Paid sick" hours={record.paid_sick_hours} />
      <HourRow label="Paid holiday" hours={record.paid_holiday_hours} />
      <HourRow label="Family cancellation" hours={record.family_cancellation_hours} />
      {showGuaranteedHours && (
        <>
          <HourRow label="Guaranteed hours" hours={record.guaranteed_hours} />
          <HourRow label="Guarantee adjustment" hours={record.guarantee_adjustment_hours} />
        </>
      )}
      <HourRow label="Payable regular" hours={record.payable_regular_hours} />
      <HourRow label="Payable overtime" hours={record.payable_overtime_hours} />
    </div>
  )
}

// Presentational only -- entryTimeRanges already carries the exact strings
// buildDailyPayExportRows's CSV rows use ("HH:MM–HH:MM" for a manual entry,
// full ISO timestamps for a clocked one); this just makes either readable
// inline instead of duplicating any hour computation.
function formatEntryTimeRange(range: string): string {
  const [startRaw, endRaw] = range.split('–')
  const formatOne = (raw: string | undefined) => {
    if (!raw) return '?'
    if (raw.includes('T')) {
      const d = new Date(raw)
      return Number.isNaN(d.getTime()) ? raw : format(d, 'h:mm a')
    }
    const [h, m] = raw.split(':')
    const hour = Number(h)
    if (Number.isNaN(hour)) return raw
    const period = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 === 0 ? 12 : hour % 12
    return `${hour12}:${(m ?? '00').padStart(2, '0')} ${period}`
  }
  return `${formatOne(startRaw)}–${formatOne(endRaw)}`
}

// Spec 13.5's per-day timesheet breakdown (QUESTIONS_AND_CLARIFICATIONS.md
// item 36) -- one card per calendar day in the period, nested as a
// collapsible "Daily detail" disclosure below HoursBreakdown in the
// timesheet detail Modal. Card list instead of a literal 10-column table,
// same mobile-first pattern the rest of this codebase uses (no <table>
// anywhere in src) rather than a table that would need horizontal scroll.
function DailyDetailDay({ day }: { day: DailyBreakdown }) {
  const leaveItems = (
    [
      ['PTO', day.ptoHours],
      ['Sick', day.sickHours],
      ['Holiday', day.holidayHours],
      ['Unpaid', day.unpaidHours],
      ['Other paid', day.otherPaidHours],
    ] as const
  ).filter(([, hours]) => hours > 0)
  const notes = [...day.entryNotes, day.leaveNotes].filter(Boolean).join('; ')

  return (
    <div className="rounded-lg border border-gray-100 p-2.5 dark:border-gray-700">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{format(parseISO(day.date), 'EEE, MMM d')}</p>
        <div className="flex flex-wrap justify-end gap-1">
          {day.entryStatuses.length > 0 ? (
            day.entryStatuses.map((s) => <StatusChip key={s} status={s} />)
          ) : (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">No entry</span>
          )}
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-600 dark:text-gray-300">
        <span>
          Scheduled{' '}
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {day.scheduledHours != null ? day.scheduledHours.toFixed(2) : '—'}
          </span>
        </span>
        <span>
          Worked <span className="font-medium text-gray-900 dark:text-gray-100">{day.actualWorkedHours.toFixed(2)}</span>
        </span>
        {leaveItems.map(([label, hours]) => (
          <span key={label}>
            {label} <span className="font-medium text-gray-900 dark:text-gray-100">{hours.toFixed(2)}</span>
          </span>
        ))}
        {day.familyCancellationHours != null && day.familyCancellationHours > 0 && (
          <span>
            Family cancellation{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">{day.familyCancellationHours.toFixed(2)}</span>
          </span>
        )}
      </div>
      {day.entryTimeRanges.length > 0 && (
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
          {day.entryTimeRanges.map(formatEntryTimeRange).join(', ')}
        </p>
      )}
      {notes && <p className="mt-1 text-[11px] italic text-gray-400 dark:text-gray-500">{notes}</p>}
    </div>
  )
}

function timesheetErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
    return 'A timesheet for this exact date range already exists. Archive it first (see Archived below), or adjust the dates.'
  }
  return errorMessage(err, fallback)
}

// Statuses where money is still owed, i.e. "mark paid"/"void" apply.
const PAYABLE_STATUSES: readonly string[] = ['due', 'overdue', 'upcoming', 'partially_paid']

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
  const { household, isNanny, isParentOrCoAdmin, coadminAllowed, caregiverProfile } = useHousehold()
  const canExport = isParentOrCoAdmin && coadminAllowed('export_records')
  const { caregivers, selectedCaregiverId: caregiverId } = useSelectedCaregiver()
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [showForm, setShowForm] = useState(false)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  // Spec 13.8 "Payment Record Fields" / 14.6 "Add adjustment" -- reimbursements
  // and manual adjustments were always hardcoded to 0 in doGenerate even
  // though calc.ts's gross-pay formula already adds them in; this is the
  // first place either becomes settable.
  const [reimbursements, setReimbursements] = useState('0')
  const [manualAdjustments, setManualAdjustments] = useState('0')
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
  const [showReports, setShowReports] = useState(false)
  const [nannyPeriodStart, setNannyPeriodStart] = useState('')
  const [nannyPeriodEnd, setNannyPeriodEnd] = useState('')
  const [nannySubmitting, setNannySubmitting] = useState(false)
  // Annual summary export state
  const [annualSummaryYear, setAnnualSummaryYear] = useState(() => String(new Date().getFullYear()))
  const [annualSummaryExporting, setAnnualSummaryExporting] = useState(false)
  const [detailExporting, setDetailExporting] = useState<'timesheets' | 'payments' | null>(null)
  const [fullExporting, setFullExporting] = useState<'json' | 'csv' | null>(null)
  const [importingTimesheets, setImportingTimesheets] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const timesheetImportInput = useRef<HTMLInputElement>(null)

  // Tapping a timesheet/payment row opens its detail sheet.
  const [detailTimesheetId, setDetailTimesheetId] = useState<string | null>(null)
  const [detailPaymentId, setDetailPaymentId] = useState<string | null>(null)
  const [approvingTimesheetId, setApprovingTimesheetId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [showPaymentArchive, setShowPaymentArchive] = useState(false)
  // Spec 13.5 per-day breakdown (Q&A item 36) -- lazy-loaded the first time
  // the "Daily detail" disclosure is opened on a given timesheet, not
  // up front for every row in the list.
  const [showDailyDetail, setShowDailyDetail] = useState(false)
  const [dailyDetailForId, setDailyDetailForId] = useState<string | null>(null)
  const [dailyDetailRows, setDailyDetailRows] = useState<DailyBreakdown[] | null>(null)
  const [dailyDetailLoading, setDailyDetailLoading] = useState(false)
  const [dailyDetailError, setDailyDetailError] = useState<string | null>(null)

  const activeCaregiver = isNanny ? caregiverProfile : caregivers.find((c) => c.id === caregiverId) ?? null
  // Spec 11/15.4: nanny_can_view_gross_pay/nanny_can_view_guaranteed_hours only
  // restrict the nanny's own view -- a parent/co-admin always sees both.
  const showGrossPay = !isNanny || activeCaregiver?.nanny_can_view_gross_pay !== false
  const showGuaranteedHours = !isNanny || activeCaregiver?.nanny_can_view_guaranteed_hours !== false
  const showPaymentMethod = !isNanny || activeCaregiver?.nanny_can_view_payment_method !== false
  const activeTimesheets = timesheets.filter((t) => !t.deleted_at)
  const trashedTimesheets = timesheets.filter((t) => t.deleted_at)
  const activePayments = payments.filter((p) => !p.deleted_at)
  const trashedPayments = payments.filter((p) => p.deleted_at)
  // Spec 14.6 lists the parent's payment view as four distinct sections
  // (Upcoming/Due/Overdue/Paid history) rather than one flat list; group by
  // the same paymentDisplayStatus() bucketing already used for each row's
  // status chip, ordered most-urgent-first per spec 22's "What do I owe?"
  // parent priority.
  const groupedPayments = useMemo(() => {
    const groups: { overdue: PaymentRecord[]; due: PaymentRecord[]; upcoming: PaymentRecord[]; paidHistory: PaymentRecord[] } = {
      overdue: [],
      due: [],
      upcoming: [],
      paidHistory: [],
    }
    for (const p of activePayments) {
      const displayStatus = paymentDisplayStatus(p.status, p.due_date)
      if (displayStatus === 'overdue') groups.overdue.push(p)
      else if (displayStatus === 'due') groups.due.push(p)
      else if (displayStatus === 'upcoming') groups.upcoming.push(p)
      else groups.paidHistory.push(p)
    }
    return groups
  }, [activePayments])
  const earliestDue = (list: PaymentRecord[]) => [...list].sort((x, y) => x.due_date.localeCompare(y.due_date))[0]
  const nextPayment =
    earliestDue(groupedPayments.overdue) ?? earliestDue(groupedPayments.due) ?? earliestDue(groupedPayments.upcoming) ?? null
  const nextPaymentStatus = nextPayment ? paymentDisplayStatus(nextPayment.status, nextPayment.due_date) : null
  // Includes archived timesheets too, so catch-up still suggests resuming
  // after the most recent period even if it was later archived (an archived
  // period's period_end no longer blocks regenerating that same period --
  // see 0017_timesheet_period_unique_excludes_archived.sql -- but it's still
  // the most recent period for suggesting the next one).
  const lastPeriodEnd = timesheets.reduce<string | null>(
    (latest, t) => (!latest || t.period_end > latest ? t.period_end : latest),
    null
  )


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

  // Daily detail is scoped to whichever timesheet the modal is open for --
  // reset it whenever that changes (a different row opened, or the modal
  // closed) so a stale expanded/loaded state from one timesheet never shows
  // through for another.
  useEffect(() => {
    setShowDailyDetail(false)
    setDailyDetailForId(null)
    setDailyDetailRows(null)
    setDailyDetailError(null)
  }, [detailTimesheetId])

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

  // Worked/leave/guarantee math for one period. Shared by "generate a
  // timesheet from time entries" and "approve a nanny-submitted timesheet"
  // (spec 13.5: on approval the app calculates payable hours and gross pay,
  // then creates the payment record) -- identical arithmetic, the only
  // difference being whether the numbers land on a new row or an existing one.
  async function computePeriodTotals(
    forCaregiverId: string,
    caregiver: CaregiverProfile,
    start: string,
    end: string,
    timeEntries: TimeEntry[],
    reimbursementsAmount: number,
    manualAdjustmentsAmount: number
  ) {
    const actualWorkedHours = timeEntries
      .filter((t) => t.status === 'approved')
      .reduce((sum, t) => sum + (t.paid_hours ?? 0), 0)

    const { data: leaveRows } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('caregiver_id', forCaregiverId)
      .eq('status', 'approved')
      // An archived leave request has had its ledger hours handed back (see
      // PTO.tsx archiveRequest), so it must not be paid out here either.
      .is('archived_at', null)
      .gte('start_date', start)
      .lte('end_date', end)
    const leaveRequests = (leaveRows ?? []) as LeaveRequest[]
    const sumLeave = (type: LeaveRequest['leave_type']) =>
      leaveRequests.filter((l) => l.leave_type === type).reduce((sum, l) => sum + (l.hours_requested ?? 0), 0)

    const { occurrences, exceptions, shiftsById } = await loadScheduleContext(forCaregiverId, start, end)
    const scheduledHours = Math.max(
      occurrences.reduce((sum, o) => sum + shiftHours(o.shift), 0) +
        scheduleExceptionHoursDelta(exceptions, shiftsById),
      0
    )
    const guaranteedHoursBase = computeGuaranteedHoursBase(caregiver, occurrences, exceptions, shiftsById)
    // Family cancellation hours (spec 13.3, 13.6) now come from approved
    // schedule exceptions instead of manual entry -- see SPEC_CHANGE_LOG.md.
    // weather_emergency exceptions are folded into the same bucket: both
    // represent "caregiver didn't work, but is paid because of the
    // guarantee" -- there's no separate payable-hours column for weather
    // days, and inventing one for a single exception type wasn't worth a
    // migration. `other` exceptions are intentionally excluded -- too broad
    // a catch-all to assume it should always be guarantee-protected pay.
    const cancellationHours = caregiver.family_cancellation_counts_toward_guarantee
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
      unpaidTimeOffReducesGuarantee: caregiver.unpaid_time_off_reduces_guarantee,
      ptoCountsTowardGuarantee: caregiver.pto_counts_toward_guarantee,
      sickCountsTowardGuarantee: caregiver.sick_counts_toward_guarantee,
      holidayCountsTowardGuarantee: caregiver.holiday_counts_toward_guarantee,
      overtimeThresholdHours: caregiver.overtime_threshold_hours,
      overtimeMultiplier: caregiver.overtime_multiplier,
      hourlyRate: caregiver.default_hourly_rate ?? 0,
      reimbursements: reimbursementsAmount,
      manualAdjustments: manualAdjustmentsAmount,
    })

    return {
      caregiver,
      actualWorkedHours,
      scheduledHours,
      cancellationHours,
      ptoHours: sumLeave('pto'),
      sickHours: sumLeave('sick'),
      holidayHours: sumLeave('holiday'),
      unpaidHours: sumLeave('unpaid'),
      reimbursements: reimbursementsAmount,
      manualAdjustments: manualAdjustmentsAmount,
      result,
    }
  }

  type PeriodTotals = Awaited<ReturnType<typeof computePeriodTotals>>

  function timesheetHourFields(totals: PeriodTotals) {
    return {
      scheduled_hours: totals.scheduledHours,
      guaranteed_hours: totals.result.guaranteedHours,
      actual_worked_hours: totals.actualWorkedHours,
      regular_worked_hours: totals.result.regularWorkedHours,
      overtime_worked_hours: totals.result.overtimeWorkedHours,
      paid_pto_hours: totals.ptoHours,
      paid_sick_hours: totals.sickHours,
      paid_holiday_hours: totals.holidayHours,
      family_cancellation_hours: totals.cancellationHours,
      unpaid_time_off_hours: totals.unpaidHours,
      guarantee_adjustment_hours: totals.result.guaranteeAdjustmentHours,
      payable_regular_hours: totals.result.payableRegularHours,
      payable_overtime_hours: totals.result.payableOvertimeHours,
      hourly_rate: totals.caregiver.default_hourly_rate,
      overtime_rate: totals.result.overtimeRate,
      reimbursements: totals.reimbursements,
      manual_adjustments: totals.manualAdjustments,
      gross_pay_due: totals.result.grossPayDue,
    }
  }

  function paymentRecordFields(totals: PeriodTotals) {
    return {
      actual_worked_hours: totals.actualWorkedHours,
      regular_worked_hours: totals.result.regularWorkedHours,
      overtime_worked_hours: totals.result.overtimeWorkedHours,
      guaranteed_hours: totals.result.guaranteedHours,
      guarantee_adjustment_hours: totals.result.guaranteeAdjustmentHours,
      payable_regular_hours: totals.result.payableRegularHours,
      payable_overtime_hours: totals.result.payableOvertimeHours,
      paid_pto_hours: totals.ptoHours,
      paid_sick_hours: totals.sickHours,
      paid_holiday_hours: totals.holidayHours,
      family_cancellation_hours: totals.cancellationHours,
      hourly_rate: totals.caregiver.default_hourly_rate,
      overtime_rate: totals.result.overtimeRate,
      reimbursements: totals.reimbursements,
      manual_adjustments: totals.manualAdjustments,
      // Spec 13.8 "Payment method label" -- carries the caregiver's
      // configured default method onto the record; editable per-record isn't
      // built (no screen sets it after generation), matching how hourly_rate
      // is also just copied at generation time rather than re-editable.
      payment_method_label: totals.caregiver.payment_method_label,
      gross_pay_due: totals.result.grossPayDue,
    }
  }

  async function doGenerate(timeEntries: TimeEntry[]) {
    if (!caregiverId || !household || !activeCaregiver) return
    const totals = await computePeriodTotals(
      caregiverId,
      activeCaregiver,
      periodStart,
      periodEnd,
      timeEntries,
      round2(Number(reimbursements) || 0),
      round2(Number(manualAdjustments) || 0)
    )

    const { data: timesheet, error: tsError } = await supabase
      .from('timesheets')
      .insert({
        caregiver_id: caregiverId,
        period_start: periodStart,
        period_end: periodEnd,
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user?.id ?? null,
        ...timesheetHourFields(totals),
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
      after: { periodStart, periodEnd, grossPayDue: totals.result.grossPayDue },
    })

    const { error: payError } = await supabase.from('payment_records').insert({
      caregiver_id: caregiverId,
      timesheet_id: timesheet.id,
      period_start: periodStart,
      period_end: periodEnd,
      due_date: computeDueDate(periodEnd, activeCaregiver),
      status: 'due',
      ...paymentRecordFields(totals),
    })
    if (payError) throw payError

    setShowForm(false)
    setReimbursements('0')
    setManualAdjustments('0')
    setPendingUnapproved([])
    await loadData(caregiverId)
  }

  // Spec 13.5 Parent Workflow steps 4-6: approving a submitted timesheet
  // recalculates payable hours/gross pay from the period's records (the
  // nanny-submitted row only carries raw worked hours) and then creates the
  // payment record. Before this, a nanny-submitted timesheet had no approval
  // path at all and simply sat at 'submitted' forever.
  async function approveTimesheet(timesheet: Timesheet) {
    if (!caregiverId || !household || !activeCaregiver) return
    setApprovingTimesheetId(timesheet.id)
    setError(null)
    try {
      const { data: entries } = await supabase
        .from('time_entries')
        .select('*')
        .eq('caregiver_id', timesheet.caregiver_id)
        .is('deleted_at', null)
        .gte('date', timesheet.period_start)
        .lte('date', timesheet.period_end)
      const totals = await computePeriodTotals(
        timesheet.caregiver_id,
        activeCaregiver,
        timesheet.period_start,
        timesheet.period_end,
        (entries ?? []) as TimeEntry[],
        timesheet.reimbursements,
        timesheet.manual_adjustments
      )

      const { error: updateError } = await supabase
        .from('timesheets')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: user?.id ?? null,
          ...timesheetHourFields(totals),
        })
        .eq('id', timesheet.id)
      if (updateError) throw updateError

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'timesheet',
        entityId: timesheet.id,
        action: 'approve',
        before: { status: timesheet.status },
        after: { status: 'approved', grossPayDue: totals.result.grossPayDue },
      })

      // Re-approving a timesheet that already produced a payment record must
      // not create a second one.
      const alreadyHasPayment = payments.some((p) => p.timesheet_id === timesheet.id && !p.deleted_at)
      if (!alreadyHasPayment) {
        const { error: payError } = await supabase.from('payment_records').insert({
          caregiver_id: timesheet.caregiver_id,
          timesheet_id: timesheet.id,
          period_start: timesheet.period_start,
          period_end: timesheet.period_end,
          due_date: computeDueDate(timesheet.period_end, activeCaregiver),
          status: 'due',
          ...paymentRecordFields(totals),
        })
        if (payError) throw payError
      }

      setDetailTimesheetId(null)
      await loadData(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not approve timesheet.'))
    } finally {
      setApprovingTimesheetId(null)
    }
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
          // Spec 15.13 distinguishes parent_note (internal) from
          // nanny_visible_note (shown to the nanny) -- this note is
          // rendered unconditionally on the payment row/detail sheet today
          // (no role gate), so it belongs in the nanny-visible field, not
          // the internal one.
          nanny_visible_note: voidNote,
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

  // No confirm prompt: archiving is a soft delete that the Archived section
  // restores, and a modal on every swipe would defeat the gesture.
  async function archiveTimesheet(timesheet: Timesheet) {
    setError(null)
    setArchivingId(timesheet.id)
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

      setDetailTimesheetId(null)
      if (caregiverId) await loadData(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not archive timesheet.'))
    } finally {
      setArchivingId(null)
    }
  }

  async function restoreTimesheet(timesheet: Timesheet) {
    setError(null)
    setArchivingId(timesheet.id)
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

      setDetailTimesheetId(null)
      if (caregiverId) await loadData(caregiverId)
    } catch (err) {
      setError(errorMessage(err, 'Could not restore timesheet.'))
    } finally {
      setArchivingId(null)
    }
  }

  // Spec 13.5 per-day breakdown (Q&A item 36) -- loads the same per-day
  // building blocks computePeriodTotals/loadScheduleContext already use for
  // the pay calculation itself, plus a fresh time_entries/leave_requests
  // fetch scoped to just this timesheet's own period (the "Timesheets" list
  // doesn't keep those in state), then hands them to
  // buildTimesheetDailyBreakdown (payExport.ts) -- the same per-day
  // computation the CSV "Daily Detail" export already uses.
  async function loadDailyDetail(timesheet: Timesheet) {
    setDailyDetailLoading(true)
    setDailyDetailError(null)
    try {
      const [entriesRes, leaveRes, schedule] = await Promise.all([
        supabase
          .from('time_entries')
          .select('*')
          .eq('caregiver_id', timesheet.caregiver_id)
          .is('deleted_at', null)
          .gte('date', timesheet.period_start)
          .lte('date', timesheet.period_end),
        supabase
          .from('leave_requests')
          .select('*')
          .eq('caregiver_id', timesheet.caregiver_id)
          .eq('status', 'approved')
          .is('archived_at', null)
          .lte('start_date', timesheet.period_end)
          .gte('end_date', timesheet.period_start),
        loadScheduleContext(timesheet.caregiver_id, timesheet.period_start, timesheet.period_end),
      ])
      if (entriesRes.error) throw entriesRes.error
      if (leaveRes.error) throw leaveRes.error
      const caregiver = caregivers.find((c) => c.id === timesheet.caregiver_id)
      setDailyDetailRows(
        buildTimesheetDailyBreakdown(
          timesheet,
          (entriesRes.data ?? []) as TimeEntry[],
          (leaveRes.data ?? []) as LeaveRequest[],
          { ...schedule, familyCancellationCountsTowardGuarantee: caregiver?.family_cancellation_counts_toward_guarantee ?? false }
        )
      )
      setDailyDetailForId(timesheet.id)
    } catch (err) {
      setDailyDetailError(errorMessage(err, 'Could not load daily detail.'))
    } finally {
      setDailyDetailLoading(false)
    }
  }

  function toggleDailyDetail(timesheet: Timesheet) {
    setShowDailyDetail((s) => {
      const next = !s
      if (next && dailyDetailForId !== timesheet.id) loadDailyDetail(timesheet)
      return next
    })
  }

  // A payment record can be archived on its own -- previously it could only
  // be soft-deleted as a side effect of archiving its timesheet, which left
  // no way to clear a payment raised in error without also losing the
  // timesheet behind it. Restoring a timesheet still restores its payments.
  async function setPaymentArchived(payment: PaymentRecord, archived: boolean) {
    if (!household) return
    setError(null)
    setArchivingId(payment.id)
    try {
      const { error: updateError } = await supabase
        .from('payment_records')
        .update({ deleted_at: archived ? new Date().toISOString() : null })
        .eq('id', payment.id)
      if (updateError) throw updateError

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'payment_record',
        entityId: payment.id,
        action: archived ? 'archive' : 'restore',
        before: { status: payment.status, gross_pay_due: payment.gross_pay_due },
      })

      setDetailPaymentId(null)
      if (caregiverId) await loadData(caregiverId)
    } catch (err) {
      setError(errorMessage(err, archived ? 'Could not archive payment.' : 'Could not restore payment.'))
    } finally {
      setArchivingId(null)
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
        due_date: todayIso(),
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
        payment_method_label: correctingPayment.payment_method_label,
        // See handleVoidPayment's comment -- this note is nanny-visible
        // today with no role gate, so it belongs in nanny_visible_note.
        nanny_visible_note: `Correction of payment from ${correctingPayment.paid_at?.slice(0, 10) ?? correctingPayment.period_end}. Original: $${correctingPayment.gross_pay_due.toFixed(2)}. ${correctionNote}`,
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
        // Archived leave was handed back and isn't part of what was paid --
        // exclude it here too so the daily breakdown matches the period totals.
        supabase.from('leave_requests').select('*').eq('caregiver_id', caregiverId).eq('status', 'approved').is('archived_at', null).lte('start_date', periodEnd).gte('end_date', periodStart),
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

  // Spec 13.11 "Full records export CSV/JSON" — bundles every record type for
  // the selected caregiver (full history, not scoped to a period) into one
  // download instead of exporting timesheets/payments/PTO ledger separately.
  // JSON keeps records nested by type; CSV flattens the same records into one
  // sheet (record_type + id + a date-ish column + the full record as JSON)
  // since the record shapes don't share a common column set.
  async function exportFullRecords(fmt: 'json' | 'csv') {
    if (!caregiverId || !activeCaregiver) return
    setFullExporting(fmt)
    setError(null)
    try {
      const [entriesRes, leaveRes, ledgerRes, exceptionsRes, templatesRes] = await Promise.all([
        supabase.from('time_entries').select('*').eq('caregiver_id', caregiverId),
        supabase.from('leave_requests').select('*').eq('caregiver_id', caregiverId),
        supabase.from('leave_ledger').select('*').eq('caregiver_id', caregiverId),
        supabase.from('schedule_exceptions').select('*').eq('caregiver_id', caregiverId),
        supabase.from('schedule_templates').select('*').eq('caregiver_id', caregiverId),
      ])
      for (const res of [entriesRes, leaveRes, ledgerRes, exceptionsRes, templatesRes]) {
        if (res.error) throw res.error
      }
      const scheduleTemplates = (templatesRes.data ?? []) as ScheduleTemplate[]
      const shiftsRes = scheduleTemplates.length
        ? await supabase.from('schedule_shifts').select('*').in('schedule_template_id', scheduleTemplates.map((t) => t.id))
        : { data: [] as ScheduleShift[], error: null }
      if (shiftsRes.error) throw shiftsRes.error

      const bundle: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
        caregiver: activeCaregiver,
        schedule_templates: scheduleTemplates,
        schedule_shifts: shiftsRes.data ?? [],
        schedule_exceptions: exceptionsRes.data ?? [],
        time_entries: entriesRes.data ?? [],
        timesheets: activeTimesheets,
        payments: activePayments,
        leave_requests: leaveRes.data ?? [],
        leave_ledger: ledgerRes.data ?? [],
      }

      if (fmt === 'json') {
        downloadJson(`full-records-${activeCaregiver.name}.json`, bundle)
      } else {
        const rows: Record<string, unknown>[] = []
        for (const [recordType, records] of Object.entries(bundle)) {
          if (!Array.isArray(records)) continue
          for (const record of records as Record<string, unknown>[]) {
            rows.push({
              record_type: recordType,
              id: record.id ?? '',
              date: record.date ?? record.event_date ?? record.period_start ?? record.effective_start_date ?? '',
              record_json: JSON.stringify(record),
            })
          }
        }
        downloadCsv(`full-records-${activeCaregiver.name}.csv`, rows)
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not export full records.'))
    } finally {
      setFullExporting(null)
    }
  }

  // Spec 11's role matrix lists "Mark payment made" as Yes/Optional for a
  // co-admin, and migration 0014 already added the mark_payment_made RLS key
  // for exactly that -- but this check never consulted coadminAllowed, so a
  // restricted co-admin still saw a working-looking "Mark paid" button that
  // would fail against RLS on submit. Matches the coadminAllowed('export_records')
  // precedent already used elsewhere in this file.
  function canMarkPaid(payment: PaymentRecord) {
    return (
      isParentOrCoAdmin &&
      coadminAllowed('mark_payment_made') &&
      !payment.deleted_at &&
      PAYABLE_STATUSES.includes(payment.status)
    )
  }

  // Spec 13.8 Payment Corrections "Do not delete original record" -- a
  // payment record can be archived on its own via setPaymentArchived
  // (independent of its timesheet, see that function's comment), but that
  // action had no status guard at all, unlike canArchiveTimesheet below,
  // which already blocks archiving a timesheet once its payment has actually
  // been paid. Same guard, applied to the standalone payment-archive action
  // so a parent can't silently hide an already-paid record without going
  // through Correct or Void first.
  // Every payment_records update (archive/restore included, not just
  // mark-paid/void/correct) requires mark_payment_made per the
  // payment_records_update_manager RLS policy (migration 0014), which has no
  // status carve-out the way timesheets_update does -- so this needs the
  // same coadminAllowed check canMarkPaid above does.
  function canArchivePayment(payment: PaymentRecord) {
    return (
      isParentOrCoAdmin &&
      coadminAllowed('mark_payment_made') &&
      !payment.deleted_at &&
      payment.status !== 'paid' &&
      payment.status !== 'partially_paid'
    )
  }

  // Same as canMarkPaid above, for the sibling approve_timesheet key.
  function canApproveTimesheet(timesheet: Timesheet) {
    return (
      isParentOrCoAdmin &&
      coadminAllowed('approve_timesheet') &&
      !timesheet.deleted_at &&
      (timesheet.status === 'submitted' || timesheet.status === 'needs_correction')
    )
  }

  // Spec 24 "Paid periods are locked unless corrected" -- timesheet.status
  // itself never actually reaches 'paid'/'locked' in normal use (only
  // payment_records.status does), so those two checks alone never fire.
  // archiveTimesheet soft-deletes every payment_records row for this
  // timesheet_id unconditionally, so once money has actually changed hands
  // (partially_paid/paid) that must be Corrected or Voided first -- silently
  // archiving would erase the paid record instead. 'voided'/'corrected' are
  // themselves the "unless corrected" exception (the void-then-archive path
  // documented in SPEC_CHANGE_LOG.md's 2026-08-06 entry relies on this), and
  // a correction leaves the original row 'corrected' alongside a fresh 'due'
  // row for the same timesheet_id, so this checks for any still-outstanding
  // paid amount rather than assuming one payment row per timesheet.
  function canArchiveTimesheet(timesheet: Timesheet) {
    if (!isParentOrCoAdmin || timesheet.deleted_at || timesheet.status === 'paid' || timesheet.status === 'locked') {
      return false
    }
    const hasUncorrectedPayment = payments.some(
      (p) => p.timesheet_id === timesheet.id && !p.deleted_at && (p.status === 'paid' || p.status === 'partially_paid')
    )
    return !hasUncorrectedPayment
  }

  // The mark-paid/void/correct forms are their own sheets, so opening one from
  // the payment detail sheet dismisses that sheet first.
  function openMarkPaid(payment: PaymentRecord) {
    setDetailPaymentId(null)
    setMarkingPaidPayment(payment)
    setMarkPaidAmount((payment.gross_pay_due - (payment.amount_paid ?? 0)).toFixed(2))
  }

  function openVoid(payment: PaymentRecord) {
    setDetailPaymentId(null)
    setVoidingPayment(payment)
    setVoidNote('')
  }

  function openCorrect(payment: PaymentRecord) {
    setDetailPaymentId(null)
    setCorrectingPayment(payment)
    setCorrectionAmount(payment.gross_pay_due.toFixed(2))
    setCorrectionNote('')
  }

  function renderPaymentRow(p: PaymentRecord) {
    return (
      <SwipeRow
        key={p.id}
        className="border-b border-gray-100 last:border-0 dark:border-gray-700"
        contentClassName="bg-white px-4 py-2 dark:bg-gray-800"
        openLabel={`Open payment for ${p.period_start} to ${p.period_end}`}
        onOpen={() => setDetailPaymentId(p.id)}
        leadingAction={canMarkPaid(p) ? { label: 'Mark paid', tone: 'approve', onAction: () => openMarkPaid(p) } : null}
        trailingActions={
          canArchivePayment(p)
            ? [
                {
                  label: 'Archive',
                  tone: 'archive' as const,
                  onAction: () => setPaymentArchived(p, true),
                  disabled: archivingId === p.id,
                },
              ]
            : []
        }
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {formatDayRange(p.period_start, p.period_end)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Due {formatDay(p.due_date)}{showGrossPay ? ` · ${formatMoney(p.gross_pay_due)}` : ' · amount hidden'}
              {showPaymentMethod && formatPaymentMethod(p.payment_method_label) ? ` · ${formatPaymentMethod(p.payment_method_label)}` : ''}
            </p>
            {isNanny ? (
              p.nanny_visible_note && (
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{p.nanny_visible_note}</p>
              )
            ) : (
              <>
                {p.parent_note && (
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{p.parent_note}</p>
                )}
                {p.nanny_visible_note && (
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                    Nanny sees: {p.nanny_visible_note}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <StatusChip status={paymentDisplayStatus(p.status, p.due_date)} />
            {canMarkPaid(p) && (
              <button
                className="text-xs text-green-600 underline dark:text-green-400"
                onClick={(e) => {
                  e.stopPropagation()
                  openMarkPaid(p)
                }}
              >
                Mark paid
              </button>
            )}
          </div>
        </div>
      </SwipeRow>
    )
  }

  const detailTimesheet = timesheets.find((t) => t.id === detailTimesheetId) ?? null
  const detailPayment = payments.find((p) => p.id === detailPaymentId) ?? null

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">Pay</h1>
        {isParentOrCoAdmin && coadminAllowed('approve_timesheet') && (
          <Button variant="secondary" onClick={() => { setError(null); setShowForm(true) }}>
            + Timesheet
          </Button>
        )}
        {isNanny && (
          <Button variant="secondary" onClick={() => setShowNannyForm(true)}>
            Submit timesheet
          </Button>
        )}
      </div>

      {isParentOrCoAdmin && coadminAllowed('approve_timesheet') && (
        <input ref={timesheetImportInput} type="file" accept=".csv,text/csv" className="hidden" onChange={importTimesheets} />
      )}

      {isParentOrCoAdmin && <CaregiverSelect />}

      {error && !showForm && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {importMessage && <p className="text-sm text-emerald-700 dark:text-emerald-300">{importMessage}</p>}

      {showForm && (
        <Modal title="Generate timesheet" onClose={() => setShowForm(false)}>
          {activeCaregiver && !activeCaregiver.default_hourly_rate && (
            // QUESTIONS_AND_CLARIFICATIONS.md item 33: Finish Setup treats a
            // caregiver profile as complete once the row exists, even with no
            // hourly rate set (rate is optional on both Onboarding.tsx and
            // CaregiverDetail.tsx). doGenerate falls back to `?? 0`, which
            // would otherwise silently produce a $0 timesheet with no
            // explanation anywhere in the UI.
            <p className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              ⚠ {activeCaregiver.name} has no hourly rate set, so this timesheet
              will calculate as $0.{' '}
              <button
                type="button"
                className="underline"
                onClick={() => navigate(`/caregiver/${activeCaregiver.id}`)}
              >
                Set a rate on their profile
              </button>{' '}
              before generating.
            </p>
          )}
          {activeCaregiver && activeCaregiver.pay_frequency !== 'weekly' && (
            // Known limitation (QUESTIONS_AND_CLARIFICATIONS.md item 31):
            // overtime and fixed_weekly guaranteed hours are calculated
            // once across the whole period rather than per calendar week,
            // which is only correct when pay_frequency is weekly. Flagging
            // it here rather than silently computing a wrong number for a
            // household that picked biweekly/semi-monthly/monthly pay.
            <p className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              ⚠ Overtime and fixed-weekly guaranteed-hours totals below are
              calculated across the whole period, not per calendar week —
              they may be inaccurate for {activeCaregiver.pay_frequency.replace('_', ' ')} pay.
              Double-check hours worked in any week over 40 before approving.
            </p>
          )}
          <form onSubmit={handleGenerateTimesheet} className="space-y-3">
            <div className="space-y-3">
              <Field label="Period start">
                <input
                  type="date"
                  className={dateInputClass}
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  required
                />
              </Field>
              <Field label="Period end">
                <input
                  type="date"
                  className={dateInputClass}
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
            <div className="flex gap-3">
              <div className="min-w-0 flex-1">
                <Field label="Reimbursements ($, optional)">
                  <input
                    type="number"
                    step="0.01"
                    className={inputClass}
                    value={reimbursements}
                    onChange={(e) => setReimbursements(e.target.value)}
                  />
                </Field>
              </div>
              <div className="min-w-0 flex-1">
                <Field label="Manual adjustment ($, optional)">
                  <input
                    type="number"
                    step="0.01"
                    className={inputClass}
                    value={manualAdjustments}
                    onChange={(e) => setManualAdjustments(e.target.value)}
                  />
                </Field>
              </div>
            </div>
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
                      {formatDay(e.date)} · {formatHours(e.paid_hours)} · {e.status}
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
        </Modal>
      )}

      {isNanny && showNannyForm && (
        <Modal title="Submit timesheet for review" onClose={() => setShowNannyForm(false)}>
          <form onSubmit={handleSubmitTimesheet} className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Submit your approved time entries for this period so your employer can review and calculate pay.
            </p>
            <div className="space-y-3">
              <Field label="Period start">
                <input
                  type="date"
                  className={dateInputClass}
                  value={nannyPeriodStart}
                  onChange={(e) => setNannyPeriodStart(e.target.value)}
                  required
                />
              </Field>
              <Field label="Period end">
                <input
                  type="date"
                  className={dateInputClass}
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
        </Modal>
      )}

      {markingPaidPayment && (
        <Modal title="Mark payment paid" onClose={() => setMarkingPaidPayment(null)}>
          <form onSubmit={handleMarkPaid} className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Due {formatMoney(markingPaidPayment.gross_pay_due)} for {formatDayRange(markingPaidPayment.period_start, markingPaidPayment.period_end)}. Enter less than the full amount to record a partial payment.
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
        </Modal>
      )}

      {voidingPayment && (
        <Modal title="Void payment" onClose={() => setVoidingPayment(null)}>
          <form onSubmit={handleVoidPayment} className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatMoney(voidingPayment.gross_pay_due)} for {formatDayRange(voidingPayment.period_start, voidingPayment.period_end)}{' '}
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
        </Modal>
      )}

      {correctingPayment && (
        <Modal title="Correct payment" onClose={() => setCorrectingPayment(null)}>
          <form onSubmit={handleCorrectPayment} className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Original: {formatMoney(correctingPayment.gross_pay_due)} for {formatDayRange(correctingPayment.period_start, correctingPayment.period_end)}.
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
            {correctionAmount !== '' && !Number.isNaN(Number(correctionAmount)) && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Difference: {Number(correctionAmount) - correctingPayment.gross_pay_due >= 0 ? '+' : '-'}$
                {Math.abs(Number(correctionAmount) - correctingPayment.gross_pay_due).toFixed(2)}
              </p>
            )}
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
        </Modal>
      )}

      {nextPayment && (
        <div className="rounded-2xl bg-gray-900 p-4 text-white dark:bg-gray-100 dark:text-gray-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium opacity-70">
                {nextPaymentStatus === 'overdue' ? 'Overdue payment' : 'Next payment'}
              </p>
              <p className="mt-0.5 text-2xl font-bold">
                {showGrossPay ? formatMoney(nextPayment.gross_pay_due - (nextPayment.amount_paid ?? 0)) : 'Amount hidden'}
              </p>
              <p className="text-xs opacity-70">
                Due {formatDay(nextPayment.due_date)} · {formatDayRange(nextPayment.period_start, nextPayment.period_end)}
              </p>
            </div>
            {canMarkPaid(nextPayment) && (
              <button
                type="button"
                className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-900 active:bg-gray-200 dark:bg-gray-900 dark:text-gray-100"
                onClick={() => openMarkPaid(nextPayment)}
              >
                Mark paid
              </button>
            )}
          </div>
        </div>
      )}

      <Card title="Payments" action={canExport && activePayments.length > 0 && (
        <button className="text-xs text-blue-600 underline dark:text-blue-400" onClick={() => exportDetailedRecords('payments')} disabled={detailExporting !== null}>
          {detailExporting === 'payments' ? 'Exporting…' : 'Export daily CSV'}
        </button>
      )}>
        {activePayments.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No payment records yet.</p>
        ) : (
          <div className="-mx-4 space-y-4">
            {isParentOrCoAdmin && (
              <p className="px-4 text-[11px] text-gray-400 dark:text-gray-500">
                Tap for details. Swipe left to archive, swipe right to mark paid.
              </p>
            )}
            {(
              [
                ['Overdue', groupedPayments.overdue],
                ['Due', groupedPayments.due],
                ['Upcoming', groupedPayments.upcoming],
                ['Paid history', groupedPayments.paidHistory],
              ] as const
            ).map(
              ([label, group]) =>
                group.length > 0 && (
                  <div key={label}>
                    <p className="px-4 pb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {label} ({group.length})
                    </p>
                    {group.map(renderPaymentRow)}
                  </div>
                )
            )}
          </div>
        )}
      </Card>

      <Card title="Timesheets" action={canExport && activeTimesheets.length > 0 && (
        <button className="text-xs text-blue-600 underline dark:text-blue-400" onClick={() => exportDetailedRecords('timesheets')} disabled={detailExporting !== null}>
          {detailExporting === 'timesheets' ? 'Exporting…' : 'Export daily CSV'}
        </button>
      )}>
        {activeTimesheets.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No timesheets yet.</p>
        ) : (
          <div className="-mx-4">
            {isParentOrCoAdmin && (
              <p className="px-4 pb-2 text-[11px] text-gray-400 dark:text-gray-500">
                Tap for details. Swipe left to archive, swipe right to approve.
              </p>
            )}
            {activeTimesheets.map((t) => (
              <SwipeRow
                key={t.id}
                className="border-b border-gray-100 last:border-0 dark:border-gray-700"
                contentClassName="bg-white px-4 py-2 dark:bg-gray-800"
                openLabel={`Open timesheet for ${t.period_start} to ${t.period_end}`}
                onOpen={() => setDetailTimesheetId(t.id)}
                leadingAction={
                  canApproveTimesheet(t)
                    ? { label: 'Approve', tone: 'approve', onAction: () => approveTimesheet(t), disabled: approvingTimesheetId === t.id }
                    : null
                }
                trailingActions={
                  canArchiveTimesheet(t)
                    ? [
                        {
                          label: 'Archive',
                          tone: 'archive' as const,
                          onAction: () => archiveTimesheet(t),
                          disabled: archivingId === t.id,
                        },
                      ]
                    : []
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {formatDayRange(t.period_start, t.period_end)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatHours(t.actual_worked_hours)} worked
                      {showGrossPay ? ` · ${formatMoney(t.gross_pay_due)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusChip status={t.status} />
                    {canApproveTimesheet(t) && (
                      <button
                        className="text-xs text-green-600 underline disabled:opacity-50 dark:text-green-400"
                        disabled={approvingTimesheetId === t.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          approveTimesheet(t)
                        }}
                      >
                        {approvingTimesheetId === t.id ? 'Approving…' : 'Approve'}
                      </button>
                    )}
                  </div>
                </div>
              </SwipeRow>
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
            <span>Archived timesheets ({trashedTimesheets.length})</span>
            <span className="text-gray-400 dark:text-gray-500">{showArchive ? '▲' : '▼'}</span>
          </button>
          {showArchive && (
            <div className="-mx-4 mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
              {trashedTimesheets.map((t) => (
                <SwipeRow
                  key={t.id}
                  className="border-b border-gray-100 last:border-0 dark:border-gray-700"
                  contentClassName="bg-white px-4 py-2 dark:bg-gray-800"
                  openLabel={`Open archived timesheet for ${t.period_start} to ${t.period_end}`}
                  onOpen={() => setDetailTimesheetId(t.id)}
                  leadingAction={{ label: 'Restore', tone: 'restore', onAction: () => restoreTimesheet(t) }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatDayRange(t.period_start, t.period_end)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatHours(t.actual_worked_hours)} worked · {formatMoney(t.gross_pay_due)}
                      </p>
                    </div>
                    <button
                      className="shrink-0 text-xs text-blue-600 underline dark:text-blue-400"
                      onClick={(e) => {
                        e.stopPropagation()
                        restoreTimesheet(t)
                      }}
                    >
                      Restore
                    </button>
                  </div>
                </SwipeRow>
              ))}
            </div>
          )}
        </Card>
      )}

      {isParentOrCoAdmin && trashedPayments.length > 0 && (
        <Card>
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300"
            onClick={() => setShowPaymentArchive((s) => !s)}
          >
            <span>Archived payments ({trashedPayments.length})</span>
            <span className="text-gray-400 dark:text-gray-500">{showPaymentArchive ? '▲' : '▼'}</span>
          </button>
          {showPaymentArchive && (
            <div className="-mx-4 mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
              {trashedPayments.map((p) => (
                <SwipeRow
                  key={p.id}
                  className="border-b border-gray-100 last:border-0 dark:border-gray-700"
                  contentClassName="bg-white px-4 py-2 dark:bg-gray-800"
                  openLabel={`Open archived payment for ${p.period_start} to ${p.period_end}`}
                  onOpen={() => setDetailPaymentId(p.id)}
                  leadingAction={
                    coadminAllowed('mark_payment_made')
                      ? { label: 'Restore', tone: 'restore', onAction: () => setPaymentArchived(p, false) }
                      : null
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatDayRange(p.period_start, p.period_end)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Due {formatDay(p.due_date)} · {formatMoney(p.gross_pay_due)}
                      </p>
                    </div>
                    {coadminAllowed('mark_payment_made') && (
                      <button
                        className="shrink-0 text-xs text-blue-600 underline dark:text-blue-400"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPaymentArchived(p, false)
                        }}
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </SwipeRow>
              ))}
            </div>
          )}
        </Card>
      )}

      {((canExport && caregiverId) || (isParentOrCoAdmin && coadminAllowed('approve_timesheet'))) && (
        <div>
          <button
            className="flex w-full items-center justify-between px-1 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300"
            onClick={() => setShowReports((v) => !v)}
            aria-expanded={showReports}
          >
            <span>Reports, import & export</span>
            <span className={`text-xs text-gray-400 transition-transform ${showReports ? 'rotate-90' : ''}`}>›</span>
          </button>
          {showReports && (
            <div className="space-y-4">
              {isParentOrCoAdmin && coadminAllowed('approve_timesheet') && (
                <Card title="Import timesheets">
                  <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Add past timesheets from a CSV file.</p>
                  <Button variant="secondary" onClick={() => timesheetImportInput.current?.click()} disabled={importingTimesheets}>
                    {importingTimesheets ? 'Importing…' : 'Choose CSV…'}
                  </Button>
                </Card>
              )}
              {canExport && caregiverId && (
                <Card title="Annual summary">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="w-24">
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

              {canExport && caregiverId && (
                <Card title="Full records export">
                  <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                    Every record for {activeCaregiver?.name ?? 'this caregiver'} — schedule, time entries, timesheets,
                    payments, and PTO — bundled into one download.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => exportFullRecords('json')}
                      disabled={fullExporting !== null}
                    >
                      {fullExporting === 'json' ? 'Exporting…' : 'Export JSON'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => exportFullRecords('csv')}
                      disabled={fullExporting !== null}
                    >
                      {fullExporting === 'csv' ? 'Exporting…' : 'Export CSV'}
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {detailTimesheet && (
        <Modal title="Timesheet" onClose={() => setDetailTimesheetId(null)}>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {formatDayRange(detailTimesheet.period_start, detailTimesheet.period_end)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatHours(detailTimesheet.actual_worked_hours)} worked
                  {showGrossPay ? ` · ${formatMoney(detailTimesheet.gross_pay_due)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusChip status={detailTimesheet.status} />
                {detailTimesheet.deleted_at && (
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">
                    Archived {detailTimesheet.deleted_at.slice(0, 10)}
                  </span>
                )}
              </div>
            </div>
            <HoursBreakdown record={detailTimesheet} showGuaranteedHours={showGuaranteedHours} />
            <div className="border-t border-gray-100 pt-3 dark:border-gray-700">
              <button
                type="button"
                className="flex w-full items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300"
                onClick={() => toggleDailyDetail(detailTimesheet)}
              >
                <span>Daily detail</span>
                <span className="text-gray-400 dark:text-gray-500">{showDailyDetail ? '▲' : '▼'}</span>
              </button>
              {showDailyDetail && (
                <div className="mt-2 space-y-2">
                  {dailyDetailLoading && <p className="text-xs text-gray-400 dark:text-gray-500">Loading…</p>}
                  {dailyDetailError && <p className="text-xs text-red-600 dark:text-red-400">{dailyDetailError}</p>}
                  {!dailyDetailLoading &&
                    !dailyDetailError &&
                    dailyDetailRows &&
                    dailyDetailForId === detailTimesheet.id &&
                    dailyDetailRows.map((day) => <DailyDetailDay key={day.date} day={day} />)}
                </div>
              )}
            </div>
            {detailTimesheet.correction_note && (
              <p className="text-xs text-amber-700 dark:text-amber-300">{detailTimesheet.correction_note}</p>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {isParentOrCoAdmin && (
              <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
                {canApproveTimesheet(detailTimesheet) && (
                  <Button
                    className="flex-1"
                    disabled={approvingTimesheetId === detailTimesheet.id}
                    onClick={() => approveTimesheet(detailTimesheet)}
                  >
                    {approvingTimesheetId === detailTimesheet.id ? 'Approving…' : 'Approve'}
                  </Button>
                )}
                {detailTimesheet.deleted_at ? (
                  <Button
                    variant="secondary"
                    className="flex-1"
                    disabled={archivingId === detailTimesheet.id}
                    onClick={() => restoreTimesheet(detailTimesheet)}
                  >
                    {archivingId === detailTimesheet.id ? 'Restoring…' : 'Restore'}
                  </Button>
                ) : (
                  canArchiveTimesheet(detailTimesheet) && (
                    <Button
                      variant="danger"
                      className="flex-1"
                      disabled={archivingId === detailTimesheet.id}
                      onClick={() => archiveTimesheet(detailTimesheet)}
                    >
                      {archivingId === detailTimesheet.id ? 'Archiving…' : 'Archive'}
                    </Button>
                  )
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {detailPayment && (
        <Modal title="Payment" onClose={() => setDetailPaymentId(null)}>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {formatDayRange(detailPayment.period_start, detailPayment.period_end)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Due {formatDay(detailPayment.due_date)}
                  {showGrossPay ? ` · ${formatMoney(detailPayment.gross_pay_due)}` : ' · amount hidden'}
                  {showPaymentMethod && formatPaymentMethod(detailPayment.payment_method_label)
                    ? ` · ${formatPaymentMethod(detailPayment.payment_method_label)}`
                    : ''}
                </p>
                {showGrossPay && detailPayment.amount_paid != null && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Paid ${detailPayment.amount_paid.toFixed(2)}
                    {detailPayment.paid_at ? ` on ${detailPayment.paid_at.slice(0, 10)}` : ''}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusChip status={paymentDisplayStatus(detailPayment.status, detailPayment.due_date)} />
                {detailPayment.deleted_at && (
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">
                    Archived {detailPayment.deleted_at.slice(0, 10)}
                  </span>
                )}
              </div>
            </div>
            <HoursBreakdown record={detailPayment} showGuaranteedHours={showGuaranteedHours} />
            {isNanny ? (
              detailPayment.nanny_visible_note && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{detailPayment.nanny_visible_note}</p>
              )
            ) : (
              <>
                {detailPayment.parent_note && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{detailPayment.parent_note}</p>
                )}
                {detailPayment.nanny_visible_note && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Nanny sees: {detailPayment.nanny_visible_note}
                  </p>
                )}
              </>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {isParentOrCoAdmin && (
              <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
                {canMarkPaid(detailPayment) && (
                  <Button className="flex-1" onClick={() => openMarkPaid(detailPayment)}>
                    Mark paid
                  </Button>
                )}
                {detailPayment.status === 'paid' && coadminAllowed('mark_payment_made') && (
                  <Button variant="secondary" className="flex-1" onClick={() => openCorrect(detailPayment)}>
                    Correct
                  </Button>
                )}
                {canMarkPaid(detailPayment) && (
                  <Button variant="secondary" className="flex-1" onClick={() => openVoid(detailPayment)}>
                    Void
                  </Button>
                )}
                {detailPayment.deleted_at ? (
                  coadminAllowed('mark_payment_made') && (
                    <Button
                      variant="secondary"
                      className="flex-1"
                      disabled={archivingId === detailPayment.id}
                      onClick={() => setPaymentArchived(detailPayment, false)}
                    >
                      {archivingId === detailPayment.id ? 'Restoring…' : 'Restore'}
                    </Button>
                  )
                ) : (
                  canArchivePayment(detailPayment) && (
                    <Button
                      variant="danger"
                      className="flex-1"
                      disabled={archivingId === detailPayment.id}
                      onClick={() => setPaymentArchived(detailPayment, true)}
                    >
                      {archivingId === detailPayment.id ? 'Archiving…' : 'Archive'}
                    </Button>
                  )
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
