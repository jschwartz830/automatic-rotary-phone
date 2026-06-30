import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { Card, Button, Field, inputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import type { CaregiverProfile, PayFrequency, PaydayRule, PayPeriodAnchor } from '../lib/types'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const PAY_FREQUENCIES: PayFrequency[] = ['weekly', 'biweekly', 'semi_monthly', 'monthly']
const PAYDAY_RULES: PaydayRule[] = ['same_day_each_week', 'days_after_period_end', 'manual']
const REMINDER_OPTIONS = [
  { value: 0, label: 'Same day' },
  { value: 1, label: '1 day before' },
  { value: 2, label: '2 days before' },
  { value: 3, label: '3 days before' },
]

export function More() {
  const { user, signOut } = useAuth()
  const { household, isParentAdmin, isParentOrCoAdmin } = useHousehold()
  const { caregivers, refresh } = useCaregivers(household?.id)
  const [caregiverId, setCaregiverId] = useState<string | null>(null)
  const [rate, setRate] = useState('')
  const [overtimeThreshold, setOvertimeThreshold] = useState('40')
  const [overtimeMultiplier, setOvertimeMultiplier] = useState('1.5')
  const [guaranteedEnabled, setGuaranteedEnabled] = useState(false)
  const [guaranteedHours, setGuaranteedHours] = useState('')
  const [payFrequency, setPayFrequency] = useState<PayFrequency>('weekly')
  const [payPeriodAnchor, setPayPeriodAnchor] = useState<PayPeriodAnchor>('start_day')
  const [payPeriodStartDay, setPayPeriodStartDay] = useState('1')
  const [payPeriodEndDay, setPayPeriodEndDay] = useState('4')
  const [paydayRule, setPaydayRule] = useState<PaydayRule>('days_after_period_end')
  const [paydayDayOfWeek, setPaydayDayOfWeek] = useState('5')
  const [paydayDaysAfterPeriodEnd, setPaydayDaysAfterPeriodEnd] = useState('5')
  const [reminderDays, setReminderDays] = useState<number[]>([0, 1])
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const caregiver = caregivers.find((c) => c.id === caregiverId) ?? null

  useEffect(() => {
    if (!caregiverId && caregivers.length > 0) setCaregiverId(caregivers[0].id)
  }, [caregivers, caregiverId])

  useEffect(() => {
    if (!caregiver) return
    setRate(caregiver.default_hourly_rate?.toString() ?? '')
    setOvertimeThreshold(caregiver.overtime_threshold_hours.toString())
    setOvertimeMultiplier(caregiver.overtime_multiplier.toString())
    setGuaranteedEnabled(caregiver.guaranteed_hours_enabled)
    setGuaranteedHours(caregiver.fixed_weekly_guaranteed_hours?.toString() ?? '')
    setPayFrequency(caregiver.pay_frequency)
    setPayPeriodAnchor(caregiver.pay_period_anchor)
    setPayPeriodStartDay(caregiver.pay_period_start_day.toString())
    setPayPeriodEndDay(caregiver.pay_period_end_day?.toString() ?? '4')
    setPaydayRule(caregiver.payday_rule)
    setPaydayDayOfWeek(caregiver.payday_day_of_week?.toString() ?? '5')
    setPaydayDaysAfterPeriodEnd(caregiver.payday_days_after_period_end?.toString() ?? '5')
    setReminderDays(caregiver.payment_reminder_days_before?.length ? caregiver.payment_reminder_days_before : [0, 1])
  }, [caregiver])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!caregiver || !household) return
    setSaving(true)
    try {
      const updates: Partial<CaregiverProfile> = {
        default_hourly_rate: rate ? Number(rate) : null,
        overtime_threshold_hours: Number(overtimeThreshold) || 40,
        overtime_multiplier: Number(overtimeMultiplier) || 1.5,
        guaranteed_hours_enabled: guaranteedEnabled,
        guaranteed_hours_basis: guaranteedEnabled ? 'fixed_weekly' : 'linked_to_schedule',
        fixed_weekly_guaranteed_hours: guaranteedEnabled && guaranteedHours ? Number(guaranteedHours) : null,
        pay_frequency: payFrequency,
        pay_period_anchor: payPeriodAnchor,
        pay_period_start_day: Number(payPeriodStartDay) || 0,
        pay_period_end_day: payPeriodAnchor === 'end_day' ? Number(payPeriodEndDay) || 0 : null,
        payday_rule: paydayRule,
        payday_day_of_week: paydayRule === 'same_day_each_week' ? Number(paydayDayOfWeek) || 0 : null,
        payday_days_after_period_end:
          paydayRule === 'days_after_period_end' ? Number(paydayDaysAfterPeriodEnd) || 0 : null,
        payment_reminder_days_before: reminderDays.length ? reminderDays : [0],
      }
      await supabase.from('caregiver_profiles').update(updates).eq('id', caregiver.id)
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'caregiver_profile',
        entityId: caregiver.id,
        action: 'update',
        after: updates as Record<string, unknown>,
      })
      await refresh()
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold text-gray-900">More</h1>

      <Card title="Navigate">
        <div className="flex flex-wrap gap-2">
          <Link to="/calendar" className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-900">
            Schedule
          </Link>
          <Link to="/pto" className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-900">
            PTO
          </Link>
          {isParentOrCoAdmin && (
            <Link to="/audit-log" className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-900">
              Audit Log
            </Link>
          )}
        </div>
      </Card>

      {isParentOrCoAdmin && caregivers.length > 0 && (
        <Card title="Caregiver pay settings">
          <CaregiverSelect caregivers={caregivers} value={caregiverId} onChange={setCaregiverId} />
          <form onSubmit={handleSave} className="space-y-3">
            <Field label="Hourly rate">
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </Field>
            <div className="flex gap-3">
              <Field label="Overtime threshold (hrs/wk)">
                <input
                  type="number"
                  className={inputClass}
                  value={overtimeThreshold}
                  onChange={(e) => setOvertimeThreshold(e.target.value)}
                />
              </Field>
              <Field label="Overtime multiplier">
                <input
                  type="number"
                  step="0.1"
                  className={inputClass}
                  value={overtimeMultiplier}
                  onChange={(e) => setOvertimeMultiplier(e.target.value)}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={guaranteedEnabled}
                onChange={(e) => setGuaranteedEnabled(e.target.checked)}
              />
              Guaranteed weekly hours
            </label>
            {guaranteedEnabled && (
              <Field label="Guaranteed hours per week">
                <input
                  type="number"
                  step="0.25"
                  className={inputClass}
                  value={guaranteedHours}
                  onChange={(e) => setGuaranteedHours(e.target.value)}
                />
              </Field>
            )}
            <div className="flex gap-3">
              <Field label="Pay frequency">
                <select
                  className={inputClass}
                  value={payFrequency}
                  onChange={(e) => setPayFrequency(e.target.value as PayFrequency)}
                >
                  {PAY_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {f.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Pay period anchored by">
                <select
                  className={inputClass}
                  value={payPeriodAnchor}
                  onChange={(e) => setPayPeriodAnchor(e.target.value as PayPeriodAnchor)}
                >
                  <option value="start_day">Start day</option>
                  <option value="end_day">End day / payday</option>
                </select>
              </Field>
            </div>
            {payPeriodAnchor === 'start_day' ? (
              <Field label="Pay period starts">
                <select className={inputClass} value={payPeriodStartDay} onChange={(e) => setPayPeriodStartDay(e.target.value)}>
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Pay period ends">
                <select className={inputClass} value={payPeriodEndDay} onChange={(e) => setPayPeriodEndDay(e.target.value)}>
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <p className="text-xs text-gray-500">
              For example, a nanny who works Monday–Thursday and is paid at the end of her last shift would be
              anchored to &ldquo;End day&rdquo; = Thursday.
            </p>
            <Field label="Payday rule">
              <select className={inputClass} value={paydayRule} onChange={(e) => setPaydayRule(e.target.value as PaydayRule)}>
                {PAYDAY_RULES.map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </Field>
            {paydayRule === 'same_day_each_week' && (
              <Field label="Payday">
                <select className={inputClass} value={paydayDayOfWeek} onChange={(e) => setPaydayDayOfWeek(e.target.value)}>
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {paydayRule === 'days_after_period_end' && (
              <Field label="Days after period end">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={paydayDaysAfterPeriodEnd}
                  onChange={(e) => setPaydayDaysAfterPeriodEnd(e.target.value)}
                />
              </Field>
            )}
            <Field label="Remind me about payday">
              <div className="flex flex-wrap gap-3">
                {REMINDER_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1.5 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={reminderDays.includes(opt.value)}
                      onChange={(e) =>
                        setReminderDays((prev) =>
                          e.target.checked
                            ? [...prev, opt.value].sort((a, b) => a - b)
                            : prev.filter((d) => d !== opt.value)
                        )
                      }
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </Field>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
            {savedAt && <p className="text-xs text-green-600">Saved.</p>}
          </form>
        </Card>
      )}

      <Card title="Account">
        <p className="mb-3 text-sm text-gray-600">{user?.email}</p>
        <p className="mb-3 text-xs text-gray-400">
          {isParentAdmin ? 'Parent admin' : isParentOrCoAdmin ? 'Parent co-admin' : 'Nanny'}
        </p>
        <Button variant="secondary" onClick={() => signOut()}>
          Sign out
        </Button>
      </Card>
    </div>
  )
}
