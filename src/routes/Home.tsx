import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek, subDays } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { buildWeeklySummaryCards, computeReminders, type LeaveBalanceSummary, type ReminderCard } from '../lib/reminders'
import { computeLeaveBalance, computeLeaveBalanceFromLedger } from '../lib/leave'
import { computeGuaranteedHoursBase, generateShiftsForRange, shiftHours, scheduleExceptionHoursDelta } from '../lib/schedule'
import { Card } from '../components/Card'
import { StatusChip } from '../components/StatusChip'
import type {
  CaregiverProfile,
  LeaveLedgerEntry,
  LeavePolicy,
  LeaveRequest,
  PaymentRecord,
  ReminderSetting,
  ScheduleException,
  ScheduleShift,
  ScheduleTemplate,
  TimeEntry,
  Timesheet,
} from '../lib/types'

const BALANCE_LEAVE_TYPES = ['pto', 'sick']

// Spec 14.1/14.2 "Today" card: current clock status + scheduled shift, per
// caregiver. Spec 22's UX priorities call this out as the single thing a
// parent should see immediately ("Is nanny clocked in?").
interface TodayStatus {
  caregiverId: string
  caregiverName: string
  chip: 'clocked_in' | 'scheduled' | 'missing_clock_out' | 'none'
  detail: string
}

// Spec 14.1 "Current Week" card fields: scheduled hours, actual hours,
// guaranteed hours, timesheet status. "Estimated payable hours" is
// deliberately left off this card -- like the weekly_summary digest
// (see SPEC_CHANGE_LOG.md), a full payable-hours number depends on PTO/sick/
// holiday/family-cancellation hours and overtime, which is only authoritative
// once run through the real pay-period calc in Pay.tsx; a second
// approximation here risked quietly disagreeing with it.
interface WeekSummary {
  caregiverId: string
  caregiverName: string
  scheduledHours: number
  actualHours: number
  guaranteedHours: number | null
  timesheetStatus: string | null
}

function buildTodayStatuses(input: {
  caregivers: CaregiverProfile[]
  todayStr: string
  occurrencesByCaregiver: Map<string, ReturnType<typeof generateShiftsForRange>>
  timeEntries: TimeEntry[]
  // Entry IDs the reminders engine (reminders.ts) has already flagged as
  // missing a clock-out (schedule-aware grace period, spec 21) -- reused here
  // rather than re-deriving the same grace-period logic a second time.
  missingClockOutEntryIds: Set<string>
}): TodayStatus[] {
  const { caregivers, todayStr, occurrencesByCaregiver, timeEntries, missingClockOutEntryIds } = input
  return caregivers.map((cg) => {
    const todayEntry = timeEntries.find((e) => e.caregiver_id === cg.id && e.date === todayStr && !e.deleted_at && e.clock_in_at)
    const todaysShifts = (occurrencesByCaregiver.get(cg.id) ?? []).filter((o) => o.date === todayStr)

    if (todayEntry && todayEntry.clock_in_at && !todayEntry.clock_out_at) {
      return {
        caregiverId: cg.id,
        caregiverName: cg.name,
        chip: missingClockOutEntryIds.has(todayEntry.id) ? 'missing_clock_out' : 'clocked_in',
        detail: `Clocked in since ${format(new Date(todayEntry.clock_in_at), 'h:mm a')}`,
      }
    }
    if (todaysShifts.length > 0) {
      const times = todaysShifts
        .map((o) => `${formatTime(o.shift.start_time)}–${formatTime(o.shift.end_time)}`)
        .join(', ')
      return { caregiverId: cg.id, caregiverName: cg.name, chip: 'scheduled', detail: `Scheduled ${times}` }
    }
    return { caregiverId: cg.id, caregiverName: cg.name, chip: 'none', detail: 'No shift scheduled today' }
  })
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

function buildWeekSummaries(input: {
  caregivers: CaregiverProfile[]
  weekStartStr: string
  weekEndStr: string
  todayStr: string
  occurrencesByCaregiver: Map<string, ReturnType<typeof generateShiftsForRange>>
  exceptionsByCaregiver: Map<string, ScheduleException[]>
  shiftsById: Record<string, ScheduleShift>
  timeEntries: TimeEntry[]
  timesheets: Timesheet[]
  // Gates the guaranteed-hours line by nanny_can_view_guaranteed_hours (spec
  // 11/15.4), same as the timesheet/payment breakdown in Pay.tsx.
  viewerIsNanny: boolean
}): WeekSummary[] {
  const {
    caregivers,
    weekStartStr,
    weekEndStr,
    todayStr,
    occurrencesByCaregiver,
    exceptionsByCaregiver,
    shiftsById,
    timeEntries,
    timesheets,
    viewerIsNanny,
  } = input
  return caregivers.map((cg) => {
    const occurrences = occurrencesByCaregiver.get(cg.id) ?? []
    const exceptions = exceptionsByCaregiver.get(cg.id) ?? []
    const scheduledHours = Math.max(
      occurrences.reduce((sum, o) => sum + shiftHours(o.shift), 0) +
        scheduleExceptionHoursDelta(exceptions, shiftsById),
      0
    )
    const actualHours = timeEntries
      .filter((e) => e.caregiver_id === cg.id && !e.deleted_at && e.date >= weekStartStr && e.date <= weekEndStr)
      .reduce((sum, e) => sum + (e.paid_hours ?? 0), 0)
    // Only surface guaranteed hours when the basis naturally maps to a single
    // calendar week -- `fixed_pay_period` may span more than a week (e.g.
    // biweekly), and showing that total as "this week's guarantee" would
    // overstate it. Also respects the nanny visibility flag.
    const canViewGuarantee = !viewerIsNanny || cg.nanny_can_view_guaranteed_hours
    const guaranteedHours =
      cg.guaranteed_hours_enabled && cg.guaranteed_hours_basis !== 'fixed_pay_period' && canViewGuarantee
        ? computeGuaranteedHoursBase(cg, occurrences, exceptions, shiftsById)
        : null
    const currentTimesheet = timesheets.find(
      (t) => t.caregiver_id === cg.id && !t.deleted_at && t.period_start <= todayStr && t.period_end >= todayStr
    )
    return {
      caregiverId: cg.id,
      caregiverName: cg.name,
      scheduledHours,
      actualHours,
      guaranteedHours,
      timesheetStatus: currentTimesheet?.status ?? null,
    }
  })
}

interface DashboardCard {
  id: string
  title: string
  stat: string
  detail: string
  route: string
}

const SEVERITY_STYLES: Record<ReminderCard['severity'], string> = {
  urgent: 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300',
}

const SEVERITY_ORDER: Record<ReminderCard['severity'], number> = { urgent: 0, warning: 1, info: 2 }

const REMINDER_ROUTES: Record<string, string> = {
  missing_clock_out: '/time',
  unsubmitted_timesheet: '/pay',
  pending_timesheet_approval: '/pay',
  pending_pto_request: '/pto',
  upcoming_pto: '/pto',
  payment_overdue: '/pay',
  payment_due: '/pay',
  pto_balance_low: '/pto',
  schedule_change: '/calendar',
  weekly_summary: '/pay',
}

function buildDashboardCards(input: {
  timeEntries: TimeEntry[]
  timesheets: Timesheet[]
  leaveRequests: LeaveRequest[]
  paymentRecords: PaymentRecord[]
}): DashboardCard[] {
  const { timeEntries, timesheets, leaveRequests, paymentRecords } = input
  const today = new Date()

  const weekHours = timeEntries
    .filter((e) =>
      !e.deleted_at &&
      e.status === 'approved' &&
      differenceInCalendarDays(today, parseISO(e.date)) >= 0 &&
      differenceInCalendarDays(today, parseISO(e.date)) < 7
    )
    .reduce((sum, e) => sum + (e.paid_hours ?? 0), 0)

  const pendingLeaveCount = leaveRequests.filter((l) => l.status === 'requested').length

  const upcomingPayment = paymentRecords
    .filter((p) => p.status !== 'paid' && p.status !== 'voided')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]

  const pendingTimesheetCount = timesheets.filter((t) => t.status === 'draft' || t.status === 'submitted').length

  return [
    {
      id: 'time',
      title: 'Time',
      stat: `${weekHours.toFixed(1)} hrs`,
      detail: 'logged this week',
      route: '/time',
    },
    {
      id: 'schedule',
      title: 'Schedule',
      stat: 'View',
      detail: 'recurring shifts',
      route: '/calendar',
    },
    {
      id: 'pto',
      title: 'PTO & Leave',
      stat: pendingLeaveCount > 0 ? `${pendingLeaveCount}` : '—',
      detail: pendingLeaveCount > 0 ? 'requests pending' : 'no pending requests',
      route: '/pto',
    },
    {
      id: 'pay',
      title: 'Pay',
      stat: upcomingPayment ? `$${upcomingPayment.gross_pay_due.toFixed(2)}` : pendingTimesheetCount > 0 ? `${pendingTimesheetCount}` : '—',
      detail: upcomingPayment ? `due ${upcomingPayment.due_date}` : pendingTimesheetCount > 0 ? 'timesheets to review' : 'all caught up',
      route: '/pay',
    },
  ]
}

export function Home() {
  const { user } = useAuth()
  const { household, isNanny, caregiverProfile } = useHousehold()
  const { caregivers } = useCaregivers(household?.id)
  const [reminders, setReminders] = useState<ReminderCard[]>([])
  const [dashboardCards, setDashboardCards] = useState<DashboardCard[]>([])
  const [todayStatuses, setTodayStatuses] = useState<TodayStatus[]>([])
  const [weekSummaries, setWeekSummaries] = useState<WeekSummary[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const caregiverIds = isNanny
      ? caregiverProfile
        ? [caregiverProfile.id]
        : []
      : caregivers.map((c) => c.id)

    if (caregiverIds.length === 0) {
      setReminders([])
      setDashboardCards([])
      setTodayStatuses([])
      setWeekSummaries([])
      setLoading(false)
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      const today = new Date()
      const todayStr = today.toISOString().slice(0, 10)
      const weekStartsOn = household?.week_start_day === 'monday' ? 1 : 0
      const weekStart = startOfWeek(today, { weekStartsOn })
      const weekEnd = addDays(weekStart, 6)
      const weekStartStr = format(weekStart, 'yyyy-MM-dd')
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd')
      // Schedule/exception range covers the whole current week (for the
      // "This Week" card's scheduled hours) plus the 2 days before it in case
      // the week just started (to still catch missed clock-outs from the
      // tail end of last week).
      const rangeStart = weekStartStr < subDays(today, 2).toISOString().slice(0, 10)
        ? weekStartStr
        : subDays(today, 2).toISOString().slice(0, 10)
      const rangeEnd = weekEndStr

      const [
        timeEntries,
        timesheets,
        leaveRequests,
        paymentRecords,
        templateRows,
        leavePolicyRows,
        leaveLedgerRows,
        scheduleExceptionRows,
        reminderSettingRows,
      ] = await Promise.all([
        supabase.from('time_entries').select('*').in('caregiver_id', caregiverIds),
        supabase.from('timesheets').select('*').in('caregiver_id', caregiverIds),
        supabase.from('leave_requests').select('*').in('caregiver_id', caregiverIds),
        supabase.from('payment_records').select('*').in('caregiver_id', caregiverIds),
        supabase.from('schedule_templates').select('*').in('caregiver_id', caregiverIds).eq('active', true),
        supabase.from('leave_policies').select('*').in('caregiver_id', caregiverIds).in('leave_type', BALANCE_LEAVE_TYPES),
        supabase.from('leave_ledger').select('*').in('caregiver_id', caregiverIds),
        supabase
          .from('schedule_exceptions')
          .select('*')
          .in('caregiver_id', caregiverIds)
          .eq('status', 'approved')
          .gte('date', rangeStart)
          .lte('date', rangeEnd),
        user
          ? supabase.from('reminders').select('*').eq('household_id', household?.id ?? '').eq('recipient_user_id', user.id)
          : Promise.resolve({ data: [] as ReminderSetting[] }),
      ])
      if (cancelled) return
      const allTimesheets = (timesheets.data ?? []) as Timesheet[]
      const allPayments = (paymentRecords.data ?? []) as PaymentRecord[]
      const activeTimesheets = allTimesheets.filter((t) => !t.deleted_at)
      const activePayments = allPayments.filter((p) => !p.deleted_at)
      const allTimeEntries = (timeEntries.data ?? []) as TimeEntry[]
      const allLeaveRequests = (leaveRequests.data ?? []) as LeaveRequest[]
      const templates = (templateRows.data ?? []) as ScheduleTemplate[]
      const leavePolicies = (leavePolicyRows.data ?? []) as LeavePolicy[]
      const leaveLedger = (leaveLedgerRows.data ?? []) as LeaveLedgerEntry[]
      const scheduleExceptions = (scheduleExceptionRows.data ?? []) as ScheduleException[]
      const reminderSettings = (reminderSettingRows.data ?? []) as ReminderSetting[]
      const disabledTypes = new Set(reminderSettings.filter((s) => !s.enabled).map((s) => s.type))
      const scopedCaregivers = caregivers.filter((c) => caregiverIds.includes(c.id))

      const leaveBalances: LeaveBalanceSummary[] = leavePolicies
        .filter((p) => p.annual_allowance_hours != null)
        .map((policy) => {
          const policyLedger = leaveLedger.filter((e) => e.leave_policy_id === policy.id)
          const balance =
            policyLedger.length > 0
              ? computeLeaveBalanceFromLedger(policy, policyLedger)
              : computeLeaveBalance(
                  policy,
                  allLeaveRequests.filter((r) => r.caregiver_id === policy.caregiver_id)
                )
          return { caregiverId: policy.caregiver_id, leaveType: policy.leave_type, remainingHours: balance.remainingHours }
        })

      // Load shifts for those templates to build schedule occurrences
      let scheduleOccurrences: ReturnType<typeof generateShiftsForRange> = []
      const shiftsById: Record<string, ScheduleShift> = {}
      const occurrencesByCaregiver = new Map<string, ReturnType<typeof generateShiftsForRange>>()
      if (templates.length > 0) {
        const { data: shiftRows } = await supabase
          .from('schedule_shifts')
          .select('*')
          .in('schedule_template_id', templates.map((t) => t.id))
        const shiftsByTemplate: Record<string, ScheduleShift[]> = {}
        for (const shift of (shiftRows ?? []) as ScheduleShift[]) {
          shiftsByTemplate[shift.schedule_template_id] ??= []
          shiftsByTemplate[shift.schedule_template_id].push(shift)
          shiftsById[shift.id] = shift
        }
        scheduleOccurrences = generateShiftsForRange(templates, shiftsByTemplate, rangeStart, rangeEnd)
        const templateCaregiverById = new Map(templates.map((t) => [t.id, t.caregiver_id]))
        for (const occ of scheduleOccurrences) {
          const cgId = templateCaregiverById.get(occ.template.id)
          if (!cgId) continue
          const list = occurrencesByCaregiver.get(cgId) ?? []
          list.push(occ)
          occurrencesByCaregiver.set(cgId, list)
        }
      }
      const exceptionsByCaregiver = new Map<string, ScheduleException[]>()
      for (const ex of scheduleExceptions) {
        const list = exceptionsByCaregiver.get(ex.caregiver_id) ?? []
        list.push(ex)
        exceptionsByCaregiver.set(ex.caregiver_id, list)
      }

      const cards = computeReminders({
        today,
        timeEntries: allTimeEntries,
        timesheets: activeTimesheets,
        leaveRequests: allLeaveRequests,
        paymentRecords: activePayments,
        caregivers,
        scheduleOccurrences,
        leaveBalances,
        scheduleExceptions,
        disabledTypes,
      })
      if (!disabledTypes.has('weekly_summary')) {
        cards.push(
          ...buildWeeklySummaryCards({
            today,
            weekStartsOn: household?.week_start_day === 'monday' ? 1 : 0,
            caregivers: scopedCaregivers,
            timeEntries: allTimeEntries,
            timesheets: activeTimesheets,
            paymentRecords: activePayments,
            leaveBalances,
            viewerIsNanny: isNanny,
          })
        )
      }
      cards.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
      setReminders(cards)
      setDashboardCards(buildDashboardCards({ timeEntries: allTimeEntries, timesheets: activeTimesheets, leaveRequests: allLeaveRequests, paymentRecords: activePayments }))
      const missingClockOutEntryIds = new Set(
        cards.filter((c) => c.type === 'missing_clock_out').map((c) => c.id.replace('missing-clock-out-', ''))
      )
      setTodayStatuses(
        buildTodayStatuses({
          caregivers: scopedCaregivers,
          todayStr,
          occurrencesByCaregiver,
          timeEntries: allTimeEntries,
          missingClockOutEntryIds,
        })
      )
      setWeekSummaries(
        buildWeekSummaries({
          caregivers: scopedCaregivers,
          weekStartStr,
          weekEndStr,
          todayStr,
          occurrencesByCaregiver,
          exceptionsByCaregiver,
          shiftsById,
          timeEntries: allTimeEntries,
          timesheets: activeTimesheets,
          viewerIsNanny: isNanny,
        })
      )
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [caregivers, isNanny, caregiverProfile, household, user])

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">{household?.name}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Here's what needs your attention.</p>
      </div>

      {!loading && todayStatuses.length > 0 && (
        <Card title="Today">
          <div className="space-y-2">
            {todayStatuses.map((t) => (
              <div key={t.caregiverId} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  {todayStatuses.length > 1 && (
                    <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">{t.caregiverName}</p>
                  )}
                  <p className="truncate text-sm text-gray-700 dark:text-gray-300">{t.detail}</p>
                </div>
                {t.chip !== 'none' && <StatusChip status={t.chip} />}
              </div>
            ))}
          </div>
        </Card>
      )}

      {!loading && weekSummaries.length > 0 && (
        <Card title="This Week">
          <div className="space-y-3">
            {weekSummaries.map((w) => (
              <div key={w.caregiverId} className="space-y-1.5">
                {weekSummaries.length > 1 && (
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{w.caregiverName}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="text-gray-700 dark:text-gray-300">
                    <span className="font-semibold text-gray-900 dark:text-gray-50">{w.scheduledHours.toFixed(1)}</span> scheduled
                  </span>
                  <span className="text-gray-700 dark:text-gray-300">
                    <span className="font-semibold text-gray-900 dark:text-gray-50">{w.actualHours.toFixed(1)}</span> actual
                  </span>
                  {w.guaranteedHours != null && (
                    <span className="text-gray-700 dark:text-gray-300">
                      <span className="font-semibold text-gray-900 dark:text-gray-50">{w.guaranteedHours.toFixed(1)}</span> guaranteed
                    </span>
                  )}
                  {w.timesheetStatus && <StatusChip status={w.timesheetStatus} />}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!loading && dashboardCards.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {dashboardCards.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(c.route)}
              className="rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm shadow-gray-900/5 transition active:scale-[0.98] active:bg-gray-50 dark:border-gray-800 dark:bg-gray-800 dark:shadow-none dark:active:bg-gray-700"
            >
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{c.title}</p>
              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-50">{c.stat}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{c.detail}</p>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading…</p>
      ) : reminders.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400">You're all caught up. No reminders right now.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {reminders.map((r) => {
            const route = REMINDER_ROUTES[r.type]
            return (
              <div
                key={r.id}
                role={route ? 'button' : undefined}
                tabIndex={route ? 0 : undefined}
                onClick={route ? () => navigate(route) : undefined}
                className={`rounded-xl border p-3 text-sm ${SEVERITY_STYLES[r.severity]} ${route ? 'cursor-pointer' : ''}`}
              >
                {r.message}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
