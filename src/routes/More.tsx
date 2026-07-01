import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { Card, Button, Field, inputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import type { CaregiverProfile, GuaranteedHoursBasis, PayFrequency, PaydayRule, PayPeriodAnchor } from '../lib/types'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
]
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
  const { household, isParentAdmin, isParentOrCoAdmin, refresh: refreshHousehold } = useHousehold()
  const { caregivers, refresh } = useCaregivers(household?.id)
  const [caregiverId, setCaregiverId] = useState<string | null>(null)
  const [rate, setRate] = useState('')
  const [overtimeThreshold, setOvertimeThreshold] = useState('40')
  const [overtimeMultiplier, setOvertimeMultiplier] = useState('1.5')
  const [guaranteedEnabled, setGuaranteedEnabled] = useState(false)
  const [guaranteedBasis, setGuaranteedBasis] = useState<GuaranteedHoursBasis>('linked_to_schedule')
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
  const [saveError, setSaveError] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState<string | null>(null)
  const [joinCodeLoading, setJoinCodeLoading] = useState(false)
  const [showAddCaregiver, setShowAddCaregiver] = useState(false)
  const [newCaregiverName, setNewCaregiverName] = useState('')
  const [newCaregiverRate, setNewCaregiverRate] = useState('')
  const [addCaregiverSubmitting, setAddCaregiverSubmitting] = useState(false)
  const [addCaregiverError, setAddCaregiverError] = useState<string | null>(null)
  const [householdName, setHouseholdName] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [weekStartDay, setWeekStartDay] = useState<'sunday' | 'monday'>('monday')
  const [householdSaving, setHouseholdSaving] = useState(false)
  const [householdSavedAt, setHouseholdSavedAt] = useState<number | null>(null)
  const [householdSaveError, setHouseholdSaveError] = useState<string | null>(null)

  const caregiver = caregivers.find((c) => c.id === caregiverId) ?? null

  useEffect(() => {
    if (!caregiverId && caregivers.length > 0) setCaregiverId(caregivers[0].id)
  }, [caregivers, caregiverId])

  useEffect(() => {
    if (!household || !isParentOrCoAdmin) return
    supabase.from('households').select('join_code').eq('id', household.id).single().then(({ data }) => {
      setJoinCode((data as { join_code: string | null } | null)?.join_code ?? null)
    })
  }, [household, isParentOrCoAdmin])

  useEffect(() => {
    if (!household) return
    setHouseholdName(household.name)
    setTimezone(household.timezone)
    setWeekStartDay(household.week_start_day)
  }, [household])

  async function handleSaveHousehold(e: FormEvent) {
    e.preventDefault()
    if (!household) return
    setHouseholdSaving(true)
    setHouseholdSaveError(null)
    try {
      const updates = { name: householdName.trim(), timezone, week_start_day: weekStartDay }
      const { error } = await supabase.from('households').update(updates).eq('id', household.id)
      if (error) throw error
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'household',
        entityId: household.id,
        action: 'update',
        after: updates,
      })
      await refreshHousehold()
      setHouseholdSavedAt(Date.now())
    } catch (err) {
      setHouseholdSaveError(errorMessage(err, 'Could not save household settings.'))
    } finally {
      setHouseholdSaving(false)
    }
  }

  async function generateJoinCode() {
    if (!household) return
    setJoinCodeLoading(true)
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    const { error } = await supabase.from('households').update({ join_code: code }).eq('id', household.id)
    if (!error) setJoinCode(code)
    setJoinCodeLoading(false)
  }

  async function revokeJoinCode() {
    if (!household) return
    setJoinCodeLoading(true)
    const { error } = await supabase.from('households').update({ join_code: null }).eq('id', household.id)
    if (!error) setJoinCode(null)
    setJoinCodeLoading(false)
  }

  useEffect(() => {
    if (!caregiver) return
    setRate(caregiver.default_hourly_rate?.toString() ?? '')
    setOvertimeThreshold(caregiver.overtime_threshold_hours.toString())
    setOvertimeMultiplier(caregiver.overtime_multiplier.toString())
    setGuaranteedEnabled(caregiver.guaranteed_hours_enabled)
    setGuaranteedBasis(caregiver.guaranteed_hours_basis ?? 'linked_to_schedule')
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

  async function handleAddCaregiver(e: FormEvent) {
    e.preventDefault()
    if (!household || !newCaregiverName.trim()) return
    setAddCaregiverSubmitting(true)
    setAddCaregiverError(null)
    try {
      const { data: newCaregiver, error } = await supabase
        .from('caregiver_profiles')
        .insert({
          household_id: household.id,
          name: newCaregiverName.trim(),
          default_hourly_rate: newCaregiverRate ? Number(newCaregiverRate) : null,
        })
        .select()
        .single()
      if (error) throw error
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'caregiver_profile',
        entityId: newCaregiver.id,
        action: 'create',
        after: { name: newCaregiverName.trim() },
      })
      await refresh()
      setCaregiverId(newCaregiver.id)
      setNewCaregiverName('')
      setNewCaregiverRate('')
      setShowAddCaregiver(false)
    } catch (err) {
      setAddCaregiverError(errorMessage(err, 'Could not add caregiver.'))
    } finally {
      setAddCaregiverSubmitting(false)
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!caregiver || !household) return
    setSaving(true)
    setSaveError(null)
    try {
      const updates: Partial<CaregiverProfile> = {
        default_hourly_rate: rate ? Number(rate) : null,
        overtime_threshold_hours: Number(overtimeThreshold) || 40,
        overtime_multiplier: Number(overtimeMultiplier) || 1.5,
        guaranteed_hours_enabled: guaranteedEnabled,
        guaranteed_hours_basis: guaranteedEnabled ? guaranteedBasis : 'linked_to_schedule',
        fixed_weekly_guaranteed_hours:
          guaranteedEnabled && guaranteedBasis === 'fixed_weekly' && guaranteedHours
            ? Number(guaranteedHours)
            : null,
        fixed_pay_period_guaranteed_hours:
          guaranteedEnabled && guaranteedBasis === 'fixed_pay_period' && guaranteedHours
            ? Number(guaranteedHours)
            : null,
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
      const { error } = await supabase.from('caregiver_profiles').update(updates).eq('id', caregiver.id)
      if (error) throw error
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
    } catch (err) {
      setSaveError(errorMessage(err, 'Could not save pay settings.'))
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

      {isParentOrCoAdmin && (
        <Card title="Household settings">
          <form onSubmit={handleSaveHousehold} className="space-y-3">
            <Field label="Household name">
              <input
                className={inputClass}
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                required
              />
            </Field>
            <Field label="Timezone">
              <select className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Week starts on">
              <select
                className={inputClass}
                value={weekStartDay}
                onChange={(e) => setWeekStartDay(e.target.value as 'sunday' | 'monday')}
              >
                <option value="monday">Monday</option>
                <option value="sunday">Sunday</option>
              </select>
            </Field>
            <Button type="submit" className="w-full" disabled={householdSaving}>
              {householdSaving ? 'Saving…' : 'Save household settings'}
            </Button>
            {householdSaveError && <p className="text-xs text-red-600">{householdSaveError}</p>}
            {householdSavedAt && !householdSaveError && <p className="text-xs text-green-600">Saved.</p>}
          </form>
        </Card>
      )}

      {isParentOrCoAdmin && (
        <Card title="Nanny access">
          <p className="mb-3 text-sm text-gray-500">
            Share this code with your nanny so they can sign up and join your household.
          </p>
          {joinCode ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
                <span className="flex-1 font-mono text-2xl font-bold tracking-widest text-gray-900">
                  {joinCode}
                </span>
                <button
                  className="text-xs text-blue-600 underline disabled:opacity-50"
                  disabled={joinCodeLoading}
                  onClick={generateJoinCode}
                >
                  Regenerate
                </button>
              </div>
              <button
                className="text-xs text-red-500 underline disabled:opacity-50"
                disabled={joinCodeLoading}
                onClick={revokeJoinCode}
              >
                Revoke code
              </button>
            </div>
          ) : (
            <Button variant="secondary" onClick={generateJoinCode} disabled={joinCodeLoading}>
              {joinCodeLoading ? 'Generating…' : 'Generate join code'}
            </Button>
          )}
        </Card>
      )}

      {isParentOrCoAdmin && (
        <Card
          title="Caregivers"
          action={
            <button
              className="text-xs text-blue-600 underline"
              onClick={() => setShowAddCaregiver((s) => !s)}
            >
              {showAddCaregiver ? 'Cancel' : '+ Add caregiver'}
            </button>
          }
        >
          {showAddCaregiver && (
            <form onSubmit={handleAddCaregiver} className="mb-3 space-y-3 border-b border-gray-100 pb-3">
              <Field label="Caregiver name">
                <input
                  className={inputClass}
                  value={newCaregiverName}
                  onChange={(e) => setNewCaregiverName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Hourly rate (optional)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputClass}
                  value={newCaregiverRate}
                  onChange={(e) => setNewCaregiverRate(e.target.value)}
                />
              </Field>
              {addCaregiverError && <p className="text-xs text-red-600">{addCaregiverError}</p>}
              <Button type="submit" className="w-full" disabled={addCaregiverSubmitting}>
                {addCaregiverSubmitting ? 'Adding…' : 'Add caregiver'}
              </Button>
            </form>
          )}
          {caregivers.length === 0 ? (
            <p className="text-sm text-gray-500">No caregivers yet.</p>
          ) : (
            <p className="text-xs text-gray-500">
              {caregivers.length} {caregivers.length === 1 ? 'caregiver' : 'caregivers'} on this household. Pick one
              below to edit pay settings.
            </p>
          )}
        </Card>
      )}

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
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Field label="OT after (hrs/wk)">
                  <input
                    type="number"
                    className={inputClass}
                    value={overtimeThreshold}
                    onChange={(e) => setOvertimeThreshold(e.target.value)}
                  />
                </Field>
              </div>
              <div className="min-w-0 flex-1">
                <Field label="OT multiplier">
                  <input
                    type="number"
                    step="0.1"
                    className={inputClass}
                    value={overtimeMultiplier}
                    onChange={(e) => setOvertimeMultiplier(e.target.value)}
                  />
                </Field>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={guaranteedEnabled}
                onChange={(e) => setGuaranteedEnabled(e.target.checked)}
              />
              Guaranteed hours enabled
            </label>
            {guaranteedEnabled && (
              <>
                <Field label="Guaranteed hours basis">
                  <select
                    className={inputClass}
                    value={guaranteedBasis}
                    onChange={(e) => setGuaranteedBasis(e.target.value as GuaranteedHoursBasis)}
                  >
                    <option value="linked_to_schedule">Linked to recurring schedule</option>
                    <option value="fixed_weekly">Fixed weekly amount</option>
                    <option value="fixed_pay_period">Fixed per pay period</option>
                  </select>
                </Field>
                {(guaranteedBasis === 'fixed_weekly' || guaranteedBasis === 'fixed_pay_period') && (
                  <Field label={guaranteedBasis === 'fixed_weekly' ? 'Guaranteed hours per week' : 'Guaranteed hours per pay period'}>
                    <input
                      type="number"
                      step="0.25"
                      className={inputClass}
                      value={guaranteedHours}
                      onChange={(e) => setGuaranteedHours(e.target.value)}
                    />
                  </Field>
                )}
                {guaranteedBasis === 'linked_to_schedule' && (
                  <p className="text-xs text-gray-500">
                    Guaranteed hours will be calculated from the nanny's active recurring schedule — the sum of shift hours where "counts toward guaranteed hours" is enabled.
                  </p>
                )}
              </>
            )}
            <div className="flex gap-3">
              <div className="min-w-0 flex-1">
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
              </div>
              <div className="min-w-0 flex-1">
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
            {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            {savedAt && !saveError && <p className="text-xs text-green-600">Saved.</p>}
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
