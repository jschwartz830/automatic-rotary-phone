import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInCalendarDays, parseISO, subDays } from 'date-fns'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { computeReminders, type ReminderCard } from '../lib/reminders'
import { generateShiftsForRange } from '../lib/schedule'
import { Card } from '../components/Card'
import type { LeaveRequest, PaymentRecord, ScheduleShift, ScheduleTemplate, TimeEntry, Timesheet } from '../lib/types'

interface DashboardCard {
  id: string
  title: string
  stat: string
  detail: string
  route: string
}

const SEVERITY_STYLES: Record<ReminderCard['severity'], string> = {
  urgent: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
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
  const { household, isNanny, caregiverProfile } = useHousehold()
  const { caregivers } = useCaregivers(household?.id)
  const [reminders, setReminders] = useState<ReminderCard[]>([])
  const [dashboardCards, setDashboardCards] = useState<DashboardCard[]>([])
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
      setLoading(false)
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      const today = new Date()
      // Load schedule data for the past 2 days (enough to catch missed clock-outs)
      const rangeStart = subDays(today, 2).toISOString().slice(0, 10)
      const rangeEnd = today.toISOString().slice(0, 10)

      const [timeEntries, timesheets, leaveRequests, paymentRecords, templateRows] = await Promise.all([
        supabase.from('time_entries').select('*').in('caregiver_id', caregiverIds),
        supabase.from('timesheets').select('*').in('caregiver_id', caregiverIds),
        supabase.from('leave_requests').select('*').in('caregiver_id', caregiverIds),
        supabase.from('payment_records').select('*').in('caregiver_id', caregiverIds),
        supabase.from('schedule_templates').select('*').in('caregiver_id', caregiverIds).eq('active', true),
      ])
      if (cancelled) return
      const allTimesheets = (timesheets.data ?? []) as Timesheet[]
      const allPayments = (paymentRecords.data ?? []) as PaymentRecord[]
      const activeTimesheets = allTimesheets.filter((t) => !t.deleted_at)
      const activePayments = allPayments.filter((p) => !p.deleted_at)
      const allTimeEntries = (timeEntries.data ?? []) as TimeEntry[]
      const allLeaveRequests = (leaveRequests.data ?? []) as LeaveRequest[]
      const templates = (templateRows.data ?? []) as ScheduleTemplate[]

      // Load shifts for those templates to build schedule occurrences
      let scheduleOccurrences: ReturnType<typeof generateShiftsForRange> = []
      if (templates.length > 0) {
        const { data: shiftRows } = await supabase
          .from('schedule_shifts')
          .select('*')
          .in('schedule_template_id', templates.map((t) => t.id))
        const shiftsByTemplate: Record<string, ScheduleShift[]> = {}
        for (const shift of (shiftRows ?? []) as ScheduleShift[]) {
          shiftsByTemplate[shift.schedule_template_id] ??= []
          shiftsByTemplate[shift.schedule_template_id].push(shift)
        }
        scheduleOccurrences = generateShiftsForRange(templates, shiftsByTemplate, rangeStart, rangeEnd)
      }

      const cards = computeReminders({
        today,
        timeEntries: allTimeEntries,
        timesheets: activeTimesheets,
        leaveRequests: allLeaveRequests,
        paymentRecords: activePayments,
        caregivers,
        scheduleOccurrences,
      })
      cards.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
      setReminders(cards)
      setDashboardCards(buildDashboardCards({ timeEntries: allTimeEntries, timesheets: activeTimesheets, leaveRequests: allLeaveRequests, paymentRecords: activePayments }))
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [caregivers, isNanny, caregiverProfile])

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{household?.name}</h1>
        <p className="text-sm text-gray-500">Here's what needs your attention.</p>
      </div>

      {!loading && dashboardCards.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {dashboardCards.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(c.route)}
              className="rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm active:bg-gray-50"
            >
              <p className="text-xs font-medium text-gray-500">{c.title}</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{c.stat}</p>
              <p className="text-xs text-gray-400">{c.detail}</p>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : reminders.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">You're all caught up. No reminders right now.</p>
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
