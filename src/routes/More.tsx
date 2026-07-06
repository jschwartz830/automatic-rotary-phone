import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { usePreferences } from '../context/PreferencesContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { Card, Button, Field, inputClass } from '../components/Card'
import { CaregiverSelect } from '../components/CaregiverSelect'
import { APP_VERSION, APP_VERSION_TITLE, forceRefreshApp } from '../lib/version'
import type { CaregiverProfile, GuaranteedHoursBasis, HouseholdRole, PayFrequency, PaydayRule, PayPeriodAnchor } from '../lib/types'

// Co-admin permissions that the database actually enforces (via
// can_manage_household_setting in the RLS policies / caregiver-profile trigger).
// A co-admin has each one by default; permissions[key] === false revokes it.
// Only these keys have a real server-side effect, so only these are exposed.
const COADMIN_PERMISSIONS: { key: string; label: string }[] = [
  { key: 'edit_pay_rate', label: 'Edit pay rate & pay settings' },
  { key: 'edit_pto_policy', label: 'Edit PTO / leave policy' },
  { key: 'edit_guaranteed_hours_policy', label: 'Edit guaranteed-hours settings' },
  { key: 'edit_schedule', label: 'Edit schedule & exceptions' },
  { key: 'edit_household', label: 'Edit household settings' },
  { key: 'manage_users', label: 'Manage household members' },
  { key: 'view_audit_log', label: 'View audit log' },
]

interface MemberRow {
  id: string
  user_id: string
  role: HouseholdRole
  status: string
  permissions: Record<string, boolean>
  full_name: string | null
  email: string | null
}

const ROLE_LABELS: Record<HouseholdRole, string> = {
  parent_admin: 'Parent admin',
  parent_co_admin: 'Co-admin',
  nanny: 'Nanny',
}

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
  const { theme, setTheme, timeFormat, setTimeFormat } = usePreferences()
  const { caregivers, refresh } = useCaregivers(household?.id)
  const [showVersionDetail, setShowVersionDetail] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
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
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null)
  const [parentJoinCode, setParentJoinCode] = useState<string | null>(null)
  const [parentJoinCodeLoading, setParentJoinCodeLoading] = useState(false)
  const [parentJoinCodeError, setParentJoinCodeError] = useState<string | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [membersError, setMembersError] = useState<string | null>(null)
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [showAddCaregiver, setShowAddCaregiver] = useState(false)
  const [newCaregiverName, setNewCaregiverName] = useState('')
  const [newCaregiverRate, setNewCaregiverRate] = useState('')
  const [addCaregiverSubmitting, setAddCaregiverSubmitting] = useState(false)
  const [addCaregiverError, setAddCaregiverError] = useState<string | null>(null)
  const [profileName, setProfileName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileStartDate, setProfileStartDate] = useState('')
  const [profileEmploymentStatus, setProfileEmploymentStatus] =
    useState<CaregiverProfile['employment_status']>('active')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSavedAt, setProfileSavedAt] = useState<number | null>(null)
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)
  const [confirmRemoveCaregiver, setConfirmRemoveCaregiver] = useState(false)
  const [removingCaregiver, setRemovingCaregiver] = useState(false)
  const [removeCaregiverError, setRemoveCaregiverError] = useState<string | null>(null)
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
    supabase
      .from('households')
      .select('join_code, parent_join_code')
      .eq('id', household.id)
      .single()
      .then(({ data }) => {
        const row = data as { join_code: string | null; parent_join_code: string | null } | null
        setJoinCode(row?.join_code ?? null)
        setParentJoinCode(row?.parent_join_code ?? null)
      })
  }, [household, isParentOrCoAdmin])

  const loadMembers = useCallback(async () => {
    if (!household) return
    setMembersError(null)
    const { data: hu, error } = await supabase
      .from('household_users')
      .select('id, user_id, role, status, permissions')
      .eq('household_id', household.id)
    if (error) {
      setMembersError(errorMessage(error, 'Could not load household members.'))
      return
    }
    const rows = (hu ?? []) as Omit<MemberRow, 'full_name' | 'email'>[]
    const ids = rows.map((r) => r.user_id)
    const { data: us } = ids.length
      ? await supabase.from('users').select('id, full_name, email').in('id', ids)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] }
    const byId = Object.fromEntries((us ?? []).map((u) => [u.id, u]))
    setMembers(
      rows
        .map((r) => ({
          ...r,
          permissions: (r.permissions ?? {}) as Record<string, boolean>,
          full_name: byId[r.user_id]?.full_name ?? null,
          email: byId[r.user_id]?.email ?? null,
        }))
        .sort((a, b) => a.role.localeCompare(b.role))
    )
  }, [household])

  useEffect(() => {
    if (isParentAdmin) loadMembers()
  }, [isParentAdmin, loadMembers])

  async function toggleMemberPermission(member: MemberRow, key: string, allowed: boolean) {
    if (!household) return
    setSavingMemberId(member.id)
    setMembersError(null)
    try {
      const newPermissions = { ...member.permissions, [key]: allowed }
      const { error } = await supabase
        .from('household_users')
        .update({ permissions: newPermissions })
        .eq('id', member.id)
      if (error) throw error
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'household_user',
        entityId: member.id,
        action: 'update_permissions',
        before: { [key]: member.permissions[key] ?? true },
        after: { [key]: allowed },
      })
      await loadMembers()
    } catch (err) {
      setMembersError(errorMessage(err, 'Could not update permissions.'))
    } finally {
      setSavingMemberId(null)
    }
  }

  async function removeMember(member: MemberRow) {
    if (!household) return
    setSavingMemberId(member.id)
    setMembersError(null)
    try {
      const { error } = await supabase.from('household_users').delete().eq('id', member.id)
      if (error) throw error
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user?.id ?? '',
        entityType: 'household_user',
        entityId: member.id,
        action: 'remove',
        before: { role: member.role, email: member.email },
      })
      setConfirmRemoveId(null)
      await loadMembers()
    } catch (err) {
      setMembersError(errorMessage(err, 'Could not remove member.'))
    } finally {
      setSavingMemberId(null)
    }
  }

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
    setJoinCodeError(null)
    try {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase()
      const { error } = await supabase.from('households').update({ join_code: code }).eq('id', household.id)
      if (error) throw error
      setJoinCode(code)
    } catch (err) {
      setJoinCodeError(errorMessage(err, 'Could not generate join code.'))
    } finally {
      setJoinCodeLoading(false)
    }
  }

  async function revokeJoinCode() {
    if (!household) return
    setJoinCodeLoading(true)
    setJoinCodeError(null)
    try {
      const { error } = await supabase.from('households').update({ join_code: null }).eq('id', household.id)
      if (error) throw error
      setJoinCode(null)
    } catch (err) {
      setJoinCodeError(errorMessage(err, 'Could not revoke join code.'))
    } finally {
      setJoinCodeLoading(false)
    }
  }

  async function generateParentJoinCode() {
    if (!household) return
    setParentJoinCodeLoading(true)
    setParentJoinCodeError(null)
    try {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase()
      const { error } = await supabase.from('households').update({ parent_join_code: code }).eq('id', household.id)
      if (error) throw error
      setParentJoinCode(code)
    } catch (err) {
      setParentJoinCodeError(errorMessage(err, 'Could not generate co-parent code.'))
    } finally {
      setParentJoinCodeLoading(false)
    }
  }

  async function revokeParentJoinCode() {
    if (!household) return
    setParentJoinCodeLoading(true)
    setParentJoinCodeError(null)
    try {
      const { error } = await supabase.from('households').update({ parent_join_code: null }).eq('id', household.id)
      if (error) throw error
      setParentJoinCode(null)
    } catch (err) {
      setParentJoinCodeError(errorMessage(err, 'Could not revoke co-parent code.'))
    } finally {
      setParentJoinCodeLoading(false)
    }
  }

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
      setConfirmRemoveCaregiver(false)
      setCaregiverId(null)
      await refresh()
    } catch (err) {
      setRemoveCaregiverError(errorMessage(err, 'Could not remove caregiver.'))
    } finally {
      setRemovingCaregiver(false)
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

  async function handleForceRefresh() {
    setRefreshing(true)
    try {
      await forceRefreshApp()
    } catch {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">More</h1>

      <Card title="Navigate">
        <div className="flex flex-wrap gap-2">
          <Link to="/calendar" className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-900 dark:bg-gray-700 dark:text-gray-100">
            Schedule
          </Link>
          <Link to="/pto" className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-900 dark:bg-gray-700 dark:text-gray-100">
            PTO
          </Link>
          {isParentOrCoAdmin && (
            <Link to="/audit-log" className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-900 dark:bg-gray-700 dark:text-gray-100">
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
            {householdSaveError && <p className="text-xs text-red-600 dark:text-red-400">{householdSaveError}</p>}
            {householdSavedAt && !householdSaveError && <p className="text-xs text-green-600 dark:text-green-400">Saved.</p>}
          </form>
        </Card>
      )}

      {isParentOrCoAdmin && (
        <Card title="Nanny access">
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            Share this code with your nanny so they can sign up and join your household.
          </p>
          {joinCode ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-900">
                <span className="flex-1 font-mono text-2xl font-bold tracking-widest text-gray-900 dark:text-gray-50">
                  {joinCode}
                </span>
                <button
                  className="text-xs text-blue-600 underline disabled:opacity-50 dark:text-blue-400"
                  disabled={joinCodeLoading}
                  onClick={generateJoinCode}
                >
                  Regenerate
                </button>
              </div>
              <button
                className="text-xs text-red-500 underline disabled:opacity-50 dark:text-red-400"
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
          {joinCodeError && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{joinCodeError}</p>}
        </Card>
      )}

      {isParentAdmin && (
        <Card title="Co-parent access">
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            Share this separate code with a second parent so they can sign up and join as a co-admin. Keep it
            distinct from the nanny code — it grants management access.
          </p>
          {parentJoinCode ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-900">
                <span className="flex-1 font-mono text-2xl font-bold tracking-widest text-gray-900 dark:text-gray-50">
                  {parentJoinCode}
                </span>
                <button
                  className="text-xs text-blue-600 underline disabled:opacity-50 dark:text-blue-400"
                  disabled={parentJoinCodeLoading}
                  onClick={generateParentJoinCode}
                >
                  Regenerate
                </button>
              </div>
              <button
                className="text-xs text-red-500 underline disabled:opacity-50 dark:text-red-400"
                disabled={parentJoinCodeLoading}
                onClick={revokeParentJoinCode}
              >
                Revoke code
              </button>
            </div>
          ) : (
            <Button variant="secondary" onClick={generateParentJoinCode} disabled={parentJoinCodeLoading}>
              {parentJoinCodeLoading ? 'Generating…' : 'Generate co-parent code'}
            </Button>
          )}
          {parentJoinCodeError && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400">{parentJoinCodeError}</p>
          )}
        </Card>
      )}

      {isParentAdmin && (
        <Card title="Household members">
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            Everyone with access to this household. Co-admins have full access by default; uncheck a permission
            to restrict it.
          </p>
          {members.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No members yet.</p>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const isSelf = member.user_id === user?.id
                return (
                  <div key={member.id} className="rounded-xl border border-gray-100 p-3 dark:border-gray-700">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {member.full_name || member.email || 'Member'}
                          {isSelf && <span className="ml-1 text-xs font-normal text-gray-400">(you)</span>}
                        </p>
                        {member.email && member.full_name && (
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{member.email}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {ROLE_LABELS[member.role]}
                      </span>
                    </div>

                    {member.role === 'parent_admin' && (
                      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">Full access — cannot be restricted.</p>
                    )}

                    {member.role === 'parent_co_admin' && (
                      <div className="mt-2 space-y-1.5">
                        {COADMIN_PERMISSIONS.map((perm) => {
                          const allowed = member.permissions[perm.key] !== false
                          return (
                            <label
                              key={perm.key}
                              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                            >
                              <input
                                type="checkbox"
                                checked={allowed}
                                disabled={savingMemberId === member.id}
                                onChange={(e) => toggleMemberPermission(member, perm.key, e.target.checked)}
                              />
                              {perm.label}
                            </label>
                          )
                        })}
                      </div>
                    )}

                    {!isSelf && member.role !== 'parent_admin' && (
                      <div className="mt-2">
                        {confirmRemoveId === member.id ? (
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-600 dark:text-gray-400">Remove this member?</span>
                            <button
                              className="text-xs text-red-600 underline disabled:opacity-50 dark:text-red-400"
                              disabled={savingMemberId === member.id}
                              onClick={() => removeMember(member)}
                            >
                              Yes, remove
                            </button>
                            <button
                              className="text-xs text-gray-500 underline dark:text-gray-400"
                              onClick={() => setConfirmRemoveId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="text-xs text-red-500 underline dark:text-red-400"
                            onClick={() => setConfirmRemoveId(member.id)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {membersError && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{membersError}</p>}
        </Card>
      )}

      {isParentOrCoAdmin && (
        <Card
          title="Caregivers"
          action={
            <button
              className="text-xs text-blue-600 underline dark:text-blue-400"
              onClick={() => setShowAddCaregiver((s) => !s)}
            >
              {showAddCaregiver ? 'Cancel' : '+ Add caregiver'}
            </button>
          }
        >
          {showAddCaregiver && (
            <form onSubmit={handleAddCaregiver} className="mb-3 space-y-3 border-b border-gray-100 pb-3 dark:border-gray-700">
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
              {addCaregiverError && <p className="text-xs text-red-600 dark:text-red-400">{addCaregiverError}</p>}
              <Button type="submit" className="w-full" disabled={addCaregiverSubmitting}>
                {addCaregiverSubmitting ? 'Adding…' : 'Add caregiver'}
              </Button>
            </form>
          )}
          {caregivers.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No caregivers yet.</p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {caregivers.length} {caregivers.length === 1 ? 'caregiver' : 'caregivers'} on this household. Pick one
              below to edit their profile or pay settings.
            </p>
          )}
        </Card>
      )}

      {isParentOrCoAdmin && caregivers.length > 0 && (
        <Card title="Caregiver profile">
          <CaregiverSelect caregivers={caregivers} value={caregiverId} onChange={setCaregiverId} />
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
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Field label="Start date (optional)">
                  <input
                    type="date"
                    className={inputClass}
                    value={profileStartDate}
                    onChange={(e) => setProfileStartDate(e.target.value)}
                  />
                </Field>
              </div>
              <div className="min-w-0 flex-1">
                <Field label="Employment status">
                  <select
                    className={inputClass}
                    value={profileEmploymentStatus}
                    onChange={(e) =>
                      setProfileEmploymentStatus(e.target.value as CaregiverProfile['employment_status'])
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </Field>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={profileSaving}>
              {profileSaving ? 'Saving…' : 'Save profile'}
            </Button>
            {profileSaveError && <p className="text-xs text-red-600 dark:text-red-400">{profileSaveError}</p>}
            {profileSavedAt && !profileSaveError && (
              <p className="text-xs text-green-600 dark:text-green-400">Saved.</p>
            )}
          </form>

          {isParentAdmin && caregiver && (
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
      )}

      <Card title="Appearance">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Theme</p>
            <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-900">
              {(
                [
                  ['light', 'Light'],
                  ['dark', 'Dark'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    theme === value
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Clock format</p>
            <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-900">
              {(
                [
                  ['12h', '12-hour'],
                  ['24h', '24-hour'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTimeFormat(value)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    timeFormat === value
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Account">
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{user?.email}</p>
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          {isParentAdmin ? 'Parent admin' : isParentOrCoAdmin ? 'Parent co-admin' : 'Nanny'}
        </p>
        <Button variant="secondary" onClick={() => signOut()}>
          Sign out
        </Button>
      </Card>

      <Card title="About">
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setShowVersionDetail((s) => !s)}
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Version <span className="font-mono">{APP_VERSION}</span>
          </p>
        </button>
        {showVersionDetail && (
          <div className="mt-2 space-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-400">
            <p className="font-semibold text-gray-700 dark:text-gray-300">Latest merged version</p>
            <p>
              Version stamp: Version <span className="font-mono">{APP_VERSION}</span>
            </p>
            <p>Latest merge/change title: {APP_VERSION_TITLE}</p>
          </div>
        )}
        <Button
          variant="secondary"
          className="mt-3 w-full"
          onClick={handleForceRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing…' : 'Force refresh (clear cache & update)'}
        </Button>
      </Card>
    </div>
  )
}
