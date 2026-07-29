import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { Card, Button, Field, inputClass, dateInputClass } from '../components/Card'
import { useLeavePolicies } from '../lib/useLeavePolicies'
import { formatLeaveType } from '../lib/leave'
import { formatPaymentMethod } from '../lib/payPeriod'
import type {
  CaregiverPrivateNote,
  CaregiverProfile,
  GuaranteedHoursBasis,
  LeaveType,
  PayFrequency,
  PaydayRule,
  PaymentMethodLabel,
  PayPeriodAnchor,
} from '../lib/types'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const PAY_FREQUENCIES: PayFrequency[] = ['weekly', 'biweekly', 'semi_monthly', 'monthly']
const PAYDAY_RULES: PaydayRule[] = ['same_day_each_week', 'days_after_period_end', 'manual']
const PAYMENT_METHODS: PaymentMethodLabel[] = ['zelle', 'venmo', 'check', 'bank_transfer', 'payroll_provider', 'cash', 'other']
// Spec 11/15.4: the flags a nanny's own visibility into pay/PTO/guarantee
// data is gated by. Toggled instantly (like More.tsx's co-admin permission
// checkboxes) rather than bundled into the Pay settings submit, since they're
// their own concern (visibility, not the underlying value).
const NANNY_VISIBILITY_FLAGS: { key: keyof CaregiverProfile; label: string }[] = [
  { key: 'nanny_can_view_pay_rate', label: 'Hourly pay rate' },
  { key: 'nanny_can_view_gross_pay', label: 'Gross pay due / paid amounts' },
  { key: 'nanny_can_view_pto_balance', label: 'PTO / sick balance' },
  { key: 'nanny_can_view_guaranteed_hours', label: 'Guaranteed hours / guarantee adjustment' },
  { key: 'nanny_can_view_payment_method', label: 'Payment method label' },
]
const REMINDER_OPTIONS = [
  { value: 0, label: 'Same day' },
  { value: 1, label: '1 day before' },
  { value: 2, label: '2 days before' },
  { value: 3, label: '3 days before' },
]
const BALANCE_TYPES: LeaveType[] = ['pto', 'sick']

export function CaregiverDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { household, isParentAdmin, isNanny } = useHousehold()
  const { caregivers, refresh } = useCaregivers(household?.id)
  const caregiver = caregivers.find((c) => c.id === id) ?? null
  const { policies, refresh: refreshPolicies } = useLeavePolicies(id ?? null)
  const [allowanceDrafts, setAllowanceDrafts] = useState<Record<string, string>>({})
  const [savingPolicy, setSavingPolicy] = useState<LeaveType | null>(null)
  const [policyError, setPolicyError] = useState<string | null>(null)

  const [profileName, setProfileName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileStartDate, setProfileStartDate] = useState('')
  const [profileEmploymentStatus, setProfileEmploymentStatus] =
    useState<CaregiverProfile['employment_status']>('active')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSavedAt, setProfileSavedAt] = useState<number | null>(null)
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)

  const [rate, setRate] = useState('')
  const [overtimeThreshold, setOvertimeThreshold] = useState('40')
  const [overtimeMultiplier, setOvertimeMultiplier] = useState('1.5')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodLabel | ''>('')
  const [guaranteedEnabled, setGuaranteedEnabled] = useState(false)
  const [guaranteedBasis, setGuaranteedBasis] = useState<GuaranteedHoursBasis>('linked_to_schedule')
  const [guaranteedHours, setGuaranteedHours] = useState('')
  const [unpaidReducesGuarantee, setUnpaidReducesGuarantee] = useState(true)
  const [familyCancellationCounts, setFamilyCancellationCounts] = useState(true)
  const [ptoCounts, setPtoCounts] = useState(true)
  const [sickCounts, setSickCounts] = useState(true)
  const [holidayCounts, setHolidayCounts] = useState(true)
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

  const [confirmRemoveCaregiver, setConfirmRemoveCaregiver] = useState(false)
  const [removingCaregiver, setRemovingCaregiver] = useState(false)
  const [removeCaregiverError, setRemoveCaregiverError] = useState<string | null>(null)

  // Nanny visibility flags (spec 11/15.4) -- instant-toggle, like More.tsx's
  // co-admin permission checkboxes, since each is its own independent switch
  // rather than part of the Pay settings submit.
  const [savingVisibilityKey, setSavingVisibilityKey] = useState<string | null>(null)
  const [visibilityError, setVisibilityError] = useState<string | null>(null)

  // Private notes (spec 15.4 "notes_private" / 18 "employer-only notes") --
  // stored in caregiver_private_notes, a separate table (not a column) so RLS
  // can fully exclude the nanny role; see migration 0001's comment on that
  // table. Never had a read/write UI until now.
  const [privateNote, setPrivateNote] = useState('')
  const [privateNoteSaving, setPrivateNoteSaving] = useState(false)
  const [privateNoteSavedAt, setPrivateNoteSavedAt] = useState<number | null>(null)
  const [privateNoteError, setPrivateNoteError] = useState<string | null>(null)

  useEffect(() => {
    if (!caregiver) return
    let cancelled = false
    async function loadPrivateNote() {
      const { data } = await supabase
        .from('caregiver_private_notes')
        .select('notes')
        .eq('caregiver_id', caregiver!.id)
        .maybeSingle()
      if (!cancelled) setPrivateNote((data as Pick<CaregiverPrivateNote, 'notes'> | null)?.notes ?? '')
    }
    loadPrivateNote()
    return () => {
      cancelled = true
    }
  }, [caregiver])

  useEffect(() => {
    if (!caregiver) return
    setProfileName(caregiver.name)
    setProfileEmail(caregiver.email ?? '')
    setProfilePhone(caregiver.phone ?? '')
    setProfileStartDate(caregiver.start_date ?? '')
    setProfileEmploymentStatus(caregiver.employment_status)
    setProfileSavedAt(null)
    setProfileSaveError(null)
    setConfirmRemoveCaregiver(false)
    setRemoveCaregiverError(null)
  }, [caregiver])

  useEffect(() => {
    if (!caregiver) return
    setRate(caregiver.default_hourly_rate?.toString() ?? '')
    setOvertimeThreshold(caregiver.overtime_threshold_hours.toString())
    setOvertimeMultiplier(caregiver.overtime_multiplier.toString())
    setPaymentMethod(caregiver.payment_method_label ?? '')
    setGuaranteedEnabled(caregiver.guaranteed_hours_enabled)
    setGuaranteedBasis(caregiver.guaranteed_hours_basis ?? 'linked_to_schedule')
    setGuaranteedHours(caregiver.fixed_weekly_guaranteed_hours?.toString() ?? '')
    setUnpaidReducesGuarantee(caregiver.unpaid_time_off_reduces_guarantee)
    setFamilyCancellationCounts(caregiver.family_cancellation_counts_toward_guarantee)
    setPtoCounts(caregiver.pto_counts_toward_guarantee)
    setSickCounts(caregiver.sick_counts_toward_guarantee)
    setHolidayCounts(caregiver.holiday_counts_toward_guarantee)
    setPayFrequency(caregiver.pay_frequency)
    setPayPeriodAnchor(caregiver.pay_period_anchor)
    setPayPeriodStartDay(caregiver.pay_period_start_day.toString())
    setPayPeriodEndDay(caregiver.pay_period_end_day?.toString() ?? '4')
    setPaydayRule(caregiver.payday_rule)
    setPaydayDayOfWeek(caregiver.payday_day_of_week?.toString() ?? '5')
    setPaydayDaysAfterPeriodEnd(caregiver.payday_days_after_period_end?.toString() ?? '5')
    setReminderDays(caregiver.payment_reminder_days_before?.length ? caregiver.payment_reminder_days_before : [0, 1])
  }, [caregiver])

  useEffect(() => {
    const drafts: Record<string, string> = {}
    for (const type of BALANCE_TYPES) {
      const policy = policies.find((p) => p.leave_type === type)
      drafts[type] = policy?.annual_allowance_hours?.toString() ?? ''
    }
    setAllowanceDrafts(drafts)
  }, [policies])

  async function saveAllowance(type: LeaveType) {
    if (!caregiver || !household) return
    setSavingPolicy(type)
    setPolicyError(null)
    try {
      const draft = allowanceDrafts[type] ?? ''
      const newHours = draft ? Number(draft) : null
      const existingPolicy = policies.find((p) => p.leave_type === type)
      const { data: upsertedRows, error: upsertError } = await supabase
        .from('leave_policies')
        .upsert(
          {
            caregiver_id: caregiver.id,
            leave_type: type,
            accrual_method: 'front_loaded_annual',
            annual_allowance_hours: newHours,
          },
          { onConflict: 'caregiver_id,leave_type' }
        )
        .select()
      if (upsertError) throw upsertError

      // Write an opening_balance ledger event when the policy is first created,
      // or a manual_adjustment when the allowance changes.
      if (newHours != null) {
        const policyId = (upsertedRows?.[0] as { id?: string } | null)?.id ?? existingPolicy?.id
        if (policyId) {
          const isNew = !existingPolicy
          const { data: ledgerRows } = await supabase
            .from('leave_ledger')
            .select('hours_delta')
            .eq('caregiver_id', caregiver.id)
            .eq('leave_policy_id', policyId)
          const currentBalance = (ledgerRows ?? []).reduce((sum: number, r: { hours_delta: number }) => sum + r.hours_delta, 0)
          const delta = isNew ? newHours : newHours - (existingPolicy?.annual_allowance_hours ?? 0)
          if (delta !== 0) {
            await supabase.from('leave_ledger').insert({
              caregiver_id: caregiver.id,
              leave_policy_id: policyId,
              event_date: new Date().toISOString().slice(0, 10),
              event_type: isNew ? 'opening_balance' : 'manual_adjustment',
              hours_delta: delta,
              balance_after: currentBalance + delta,
              created_by: user?.id ?? null,
              notes: isNew ? `Initial ${type} allowance set to ${newHours} hrs` : `Allowance updated from ${existingPolicy?.annual_allowance_hours ?? 0} to ${newHours} hrs`,
            })
          }
        }
      }

      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'leave_policy',
        entityId: caregiver.id,
        action: 'update',
        after: { leaveType: type, annualAllowanceHours: draft },
      })

      await refreshPolicies()
    } catch (err) {
      setPolicyError(errorMessage(err, 'Could not save allowance.'))
    } finally {
      setSavingPolicy(null)
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    if (!caregiver || !household || !profileName.trim()) return
    setProfileSaving(true)
    setProfileSaveError(null)
    try {
      const updates: Partial<CaregiverProfile> = {
        name: profileName.trim(),
        email: profileEmail.trim() || null,
        phone: profilePhone.trim() || null,
        start_date: profileStartDate || null,
        employment_status: profileEmploymentStatus,
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
      setProfileSavedAt(Date.now())
    } catch (err) {
      setProfileSaveError(errorMessage(err, 'Could not save caregiver profile.'))
    } finally {
      setProfileSaving(false)
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
        payment_method_label: paymentMethod || null,
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
        unpaid_time_off_reduces_guarantee: unpaidReducesGuarantee,
        family_cancellation_counts_toward_guarantee: familyCancellationCounts,
        pto_counts_toward_guarantee: ptoCounts,
        sick_counts_toward_guarantee: sickCounts,
        holiday_counts_toward_guarantee: holidayCounts,
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

  async function toggleVisibilityFlag(key: keyof CaregiverProfile, value: boolean) {
    if (!caregiver || !household) return
    setSavingVisibilityKey(key)
    setVisibilityError(null)
    try {
      const { error } = await supabase
        .from('caregiver_profiles')
        .update({ [key]: value })
        .eq('id', caregiver.id)
      if (error) throw error
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'caregiver_profile',
        entityId: caregiver.id,
        action: 'update',
        before: { [key]: caregiver[key] },
        after: { [key]: value },
      })
      await refresh()
    } catch (err) {
      setVisibilityError(errorMessage(err, 'Could not update visibility setting.'))
    } finally {
      setSavingVisibilityKey(null)
    }
  }

  async function handleSavePrivateNote(e: FormEvent) {
    e.preventDefault()
    if (!caregiver || !household) return
    setPrivateNoteSaving(true)
    setPrivateNoteError(null)
    try {
      const { error } = await supabase.from('caregiver_private_notes').upsert({
        caregiver_id: caregiver.id,
        notes: privateNote || null,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'caregiver_profile',
        entityId: caregiver.id,
        action: 'update_private_note',
      })
      setPrivateNoteSavedAt(Date.now())
    } catch (err) {
      setPrivateNoteError(errorMessage(err, 'Could not save private note.'))
    } finally {
      setPrivateNoteSaving(false)
    }
  }

  async function handleRemoveCaregiver() {
    if (!caregiver || !household) return
    setRemovingCaregiver(true)
    setRemoveCaregiverError(null)
    try {
      const removedId = caregiver.id
      const removedName = caregiver.name
      const { error } = await supabase.from('caregiver_profiles').delete().eq('id', removedId)
      if (error) throw error
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'caregiver_profile',
        entityId: removedId,
        action: 'remove',
        before: { name: removedName },
      })
      await refresh()
      navigate('/more')
    } catch (err) {
      setRemoveCaregiverError(errorMessage(err, 'Could not remove caregiver.'))
      setRemovingCaregiver(false)
    }
  }

  // Spec 11: nanny cannot access settings for pay rate, PTO policy, or
  // guaranteed hours -- this whole page is that settings surface (pay rate,
  // guaranteed-hours basis, PTO/sick allowances), not just individual
  // fields, so it's blocked outright rather than field-by-field. RLS already
  // rejects a nanny's writes here; this closes the read/UI side too, which
  // covers spec 15.4's nanny_can_view_pay_rate and
  // nanny_can_view_guaranteed_hours flags (see QUESTIONS_AND_CLARIFICATIONS.md
  // item 20) since this was the only screen displaying either value.
  if (isNanny) return <Navigate to="/" replace />

  if (!caregiver) {
    return (
      <div className="space-y-4 p-4">
        <Link to="/more" className="text-sm text-blue-600 underline dark:text-blue-400">
          ← Back to More
        </Link>
        <p className="text-sm text-gray-500 dark:text-gray-400">Caregiver not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <Link to="/more" className="text-sm text-blue-600 underline dark:text-blue-400">
        ← Back to More
      </Link>
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">{caregiver.name}</h1>

      <Card title="Profile">
        <form onSubmit={handleSaveProfile} className="space-y-3">
          <Field label="Name">
            <input
              className={inputClass}
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              required
            />
          </Field>
          <Field label="Email (optional)">
            <input
              type="email"
              className={inputClass}
              value={profileEmail}
              onChange={(e) => setProfileEmail(e.target.value)}
            />
          </Field>
          <Field label="Phone (optional)">
            <input
              type="tel"
              className={inputClass}
              value={profilePhone}
              onChange={(e) => setProfilePhone(e.target.value)}
            />
          </Field>
          <Field label="Start date (optional)">
            <input
              type="date"
              className={dateInputClass}
              value={profileStartDate}
              onChange={(e) => setProfileStartDate(e.target.value)}
            />
          </Field>
          <Field label="Employment status">
            <select
              className={inputClass}
              value={profileEmploymentStatus}
              onChange={(e) => setProfileEmploymentStatus(e.target.value as CaregiverProfile['employment_status'])}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="terminated">Terminated</option>
            </select>
          </Field>
          <Button type="submit" className="w-full" disabled={profileSaving}>
            {profileSaving ? 'Saving…' : 'Save profile'}
          </Button>
          {profileSaveError && <p className="text-xs text-red-600 dark:text-red-400">{profileSaveError}</p>}
          {profileSavedAt && !profileSaveError && (
            <p className="text-xs text-green-600 dark:text-green-400">Saved.</p>
          )}
        </form>

        {isParentAdmin && (
          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
            {confirmRemoveCaregiver ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Permanently remove <span className="font-semibold">{caregiver.name}</span>? This also deletes
                  their schedule, time entries, timesheets, leave, and payment history and cannot be undone. To
                  keep their history, set their employment status to Inactive or Terminated instead.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    className="text-xs text-red-600 underline disabled:opacity-50 dark:text-red-400"
                    disabled={removingCaregiver}
                    onClick={handleRemoveCaregiver}
                  >
                    {removingCaregiver ? 'Removing…' : 'Yes, remove permanently'}
                  </button>
                  <button
                    className="text-xs text-gray-500 underline dark:text-gray-400"
                    disabled={removingCaregiver}
                    onClick={() => setConfirmRemoveCaregiver(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="text-xs text-red-500 underline dark:text-red-400"
                onClick={() => setConfirmRemoveCaregiver(true)}
              >
                Remove caregiver
              </button>
            )}
            {removeCaregiverError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{removeCaregiverError}</p>
            )}
          </div>
        )}
      </Card>

      <Card title="Private notes">
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
          Visible to parents/co-admins only -- never shown to the nanny (spec 15.4/18).
        </p>
        <form onSubmit={handleSavePrivateNote} className="space-y-3">
          <textarea
            className={`${inputClass} min-h-[80px]`}
            value={privateNote}
            onChange={(e) => setPrivateNote(e.target.value)}
            placeholder="Notes only you and other parents/co-admins can see…"
          />
          <Button type="submit" className="w-full" disabled={privateNoteSaving}>
            {privateNoteSaving ? 'Saving…' : 'Save private note'}
          </Button>
          {privateNoteError && <p className="text-xs text-red-600 dark:text-red-400">{privateNoteError}</p>}
          {privateNoteSavedAt && !privateNoteError && (
            <p className="text-xs text-green-600 dark:text-green-400">Saved.</p>
          )}
        </form>
      </Card>

      <Card title="Pay settings">
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
          <Field label="Payment method (optional)">
            <select
              className={inputClass}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethodLabel | '')}
            >
              <option value="">Not set</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {formatPaymentMethod(m)}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
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
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Guaranteed hours will be calculated from the nanny's active recurring schedule — the sum of shift hours where "counts toward guaranteed hours" is enabled.
                </p>
              )}
              <div className="space-y-1.5 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/60">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  What counts toward meeting the guarantee (spec 13.6)
                </p>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={familyCancellationCounts}
                    onChange={(e) => setFamilyCancellationCounts(e.target.checked)}
                  />
                  Family cancellations count toward guarantee
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={ptoCounts} onChange={(e) => setPtoCounts(e.target.checked)} />
                  PTO counts toward guarantee
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={sickCounts} onChange={(e) => setSickCounts(e.target.checked)} />
                  Sick time counts toward guarantee
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={holidayCounts} onChange={(e) => setHolidayCounts(e.target.checked)} />
                  Holidays count toward guarantee
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={unpaidReducesGuarantee}
                    onChange={(e) => setUnpaidReducesGuarantee(e.target.checked)}
                  />
                  Nanny-requested unpaid time off reduces the guarantee
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  A category left unchecked is still paid as its own leave type — it just isn't counted when figuring
                  out how many extra "guarantee" hours are owed on top of what was actually worked/paid.
                </p>
              </div>
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
          <p className="text-xs text-gray-500 dark:text-gray-400">
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
                <label key={opt.value} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
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
          {saveError && <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>}
          {savedAt && !saveError && <p className="text-xs text-green-600 dark:text-green-400">Saved.</p>}
        </form>
      </Card>

      <Card title="Nanny visibility">
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          What {caregiver.name} can see about their own pay/PTO/guarantee data (spec 11/15.4). Unchecking hides that
          value on their Pay/PTO/Home screens; it doesn't change the underlying setting.
        </p>
        <div className="space-y-2">
          {NANNY_VISIBILITY_FLAGS.map((flag) => (
            <label key={flag.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={(caregiver[flag.key] as boolean) !== false}
                disabled={savingVisibilityKey === flag.key}
                onChange={(e) => toggleVisibilityFlag(flag.key, e.target.checked)}
              />
              {flag.label}
            </label>
          ))}
        </div>
        {visibilityError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{visibilityError}</p>}
      </Card>

      <Card title="PTO settings">
        <div className="space-y-4">
          {BALANCE_TYPES.map((type) => (
            <Field key={type} label={`Annual ${formatLeaveType(type)} hours allowed`}>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="1"
                  className={`${inputClass} flex-1`}
                  placeholder="Annual hours allowed"
                  value={allowanceDrafts[type] ?? ''}
                  onChange={(e) => setAllowanceDrafts((d) => ({ ...d, [type]: e.target.value }))}
                />
                <button
                  type="button"
                  className="text-xs text-blue-600 underline disabled:opacity-50 dark:text-blue-400"
                  disabled={savingPolicy === type}
                  onClick={() => saveAllowance(type)}
                >
                  {savingPolicy === type ? 'Saving…' : 'Save'}
                </button>
              </div>
            </Field>
          ))}
          {policyError && <p className="text-xs text-red-600 dark:text-red-400">{policyError}</p>}
        </div>
      </Card>
    </div>
  )
}
