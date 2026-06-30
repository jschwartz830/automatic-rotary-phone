import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { computeReminders, type ReminderCard } from '../lib/reminders'
import { Card } from '../components/Card'
import type { LeaveRequest, PaymentRecord, TimeEntry, Timesheet } from '../lib/types'

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

export function Home() {
  const { household, isNanny, caregiverProfile } = useHousehold()
  const { caregivers } = useCaregivers(household?.id)
  const [reminders, setReminders] = useState<ReminderCard[]>([])
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
      setLoading(false)
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      const [timeEntries, timesheets, leaveRequests, paymentRecords] = await Promise.all([
        supabase.from('time_entries').select('*').in('caregiver_id', caregiverIds),
        supabase.from('timesheets').select('*').in('caregiver_id', caregiverIds),
        supabase.from('leave_requests').select('*').in('caregiver_id', caregiverIds),
        supabase.from('payment_records').select('*').in('caregiver_id', caregiverIds),
      ])
      if (cancelled) return
      const cards = computeReminders({
        today: new Date(),
        timeEntries: (timeEntries.data ?? []) as TimeEntry[],
        timesheets: (timesheets.data ?? []) as Timesheet[],
        leaveRequests: (leaveRequests.data ?? []) as LeaveRequest[],
        paymentRecords: (paymentRecords.data ?? []) as PaymentRecord[],
      })
      cards.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
      setReminders(cards)
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
