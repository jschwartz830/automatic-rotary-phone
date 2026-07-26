import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { usePreferences } from '../context/PreferencesContext'
import { useCaregivers } from '../lib/useCaregivers'
import { supabase } from '../lib/supabase'
import { logAuditEvent } from '../lib/audit'
import { errorMessage } from '../lib/errors'
import { Card, Button, Field, inputClass } from '../components/Card'
import { StatusChip } from '../components/StatusChip'
import { APP_VERSION, APP_VERSION_TITLE, forceRefreshApp } from '../lib/version'
import { REMINDER_TYPE_INFO } from '../lib/reminders'
import type { HouseholdRole, ReminderSetting } from '../lib/types'

// Co-admin permissions that the database actually enforces (via
// can_manage_household_setting in the RLS policies / caregiver-profile trigger).
// A co-admin has each one by default; permissions[key] === false revokes it.
// export_records is the one exception: exports only read rows a co-admin can
// already SELECT and format them client-side, so there's no separate data
// boundary for RLS to enforce -- it's gated client-side only (coadminAllowed
// in HouseholdContext), not by the database. See QUESTIONS_AND_CLARIFICATIONS.md.
const COADMIN_PERMISSIONS: { key: string; label: string }[] = [
  { key: 'edit_pay_rate', label: 'Edit pay rate & pay settings' },
  { key: 'edit_pto_policy', label: 'Edit PTO / leave policy' },
  { key: 'edit_guaranteed_hours_policy', label: 'Edit guaranteed-hours settings' },
  { key: 'edit_schedule', label: 'Edit schedule & exceptions' },
  { key: 'edit_household', label: 'Edit household settings' },
  { key: 'manage_users', label: 'Manage household members' },
  { key: 'view_audit_log', label: 'View audit log' },
  { key: 'approve_timesheet', label: 'Approve timesheets / request corrections' },
  { key: 'mark_payment_made', label: 'Mark payments made / void / correct' },
  { key: 'approve_pto', label: 'Approve / reject PTO requests' },
  { key: 'export_records', label: 'Export records' },
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

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
]

export function More() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { household, isParentAdmin, isParentOrCoAdmin, refresh: refreshHousehold } = useHousehold()
  const { theme, setTheme, timeFormat, setTimeFormat } = usePreferences()
  const { caregivers, refresh } = useCaregivers(household?.id)
  const [showVersionDetail, setShowVersionDetail] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
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
  const [householdName, setHouseholdName] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [weekStartDay, setWeekStartDay] = useState<'sunday' | 'monday'>('monday')
  const [householdSaving, setHouseholdSaving] = useState(false)
  const [householdSavedAt, setHouseholdSavedAt] = useState<number | null>(null)
  const [householdSaveError, setHouseholdSaveError] = useState<string | null>(null)
  const [reminderSettings, setReminderSettings] = useState<ReminderSetting[]>([])
  const [reminderSettingsError, setReminderSettingsError] = useState<string | null>(null)
  const [savingReminderType, setSavingReminderType] = useState<string | null>(null)

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

  const loadReminderSettings = useCallback(async () => {
    if (!household || !user) return
    setReminderSettingsError(null)
    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('household_id', household.id)
      .eq('recipient_user_id', user.id)
    if (error) {
      setReminderSettingsError(errorMessage(error, 'Could not load reminder settings.'))
      return
    }
    setReminderSettings((data ?? []) as ReminderSetting[])
  }, [household, user])

  useEffect(() => {
    if (isParentOrCoAdmin) loadReminderSettings()
  }, [isParentOrCoAdmin, loadReminderSettings])

  async function toggleReminderType(type: string, enabled: boolean) {
    if (!household || !user) return
    setSavingReminderType(type)
    setReminderSettingsError(null)
    try {
      const existing = reminderSettings.find((s) => s.type === type)
      let entityId = existing?.id
      if (existing) {
        const { error } = await supabase.from('reminders').update({ enabled }).eq('id', existing.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('reminders')
          .insert({ household_id: household.id, recipient_user_id: user.id, type, enabled })
          .select('id')
          .single()
        if (error) throw error
        entityId = (data as { id: string }).id
      }
      await logAuditEvent({
        householdId: household.id,
        actorUserId: user.id,
        entityType: 'reminder_setting',
        entityId: entityId ?? '',
        action: 'update',
        before: { type, enabled: existing?.enabled ?? true },
        after: { type, enabled },
      })
      await loadReminderSettings()
    } catch (err) {
      setReminderSettingsError(errorMessage(err, 'Could not update reminder settings.'))
    } finally {
      setSavingReminderType(null)
    }
  }

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
      setNewCaregiverName('')
      setNewCaregiverRate('')
      setShowAddCaregiver(false)
      navigate(`/caregiver/${newCaregiver.id}`)
    } catch (err) {
      setAddCaregiverError(errorMessage(err, 'Could not add caregiver.'))
    } finally {
      setAddCaregiverSubmitting(false)
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
        <Card title="Reminder settings">
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            Choose which reminder cards show up on your Home screen. Applies to your own account only.
          </p>
          <div className="space-y-1.5">
            {REMINDER_TYPE_INFO.map((rt) => {
              const setting = reminderSettings.find((s) => s.type === rt.type)
              const enabled = setting?.enabled ?? true
              return (
                <label key={rt.type} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={savingReminderType === rt.type}
                    onChange={(e) => toggleReminderType(rt.type, e.target.checked)}
                  />
                  {rt.label}
                </label>
              )
            })}
          </div>
          {reminderSettingsError && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{reminderSettingsError}</p>}
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
        <Card title="Caregivers">
          {caregivers.length === 0 ? (
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">No caregivers yet.</p>
          ) : (
            <div className="mb-3 space-y-2">
              {caregivers.map((c) => (
                <button
                  key={c.id}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-100 p-3 text-left active:bg-gray-50 dark:border-gray-700 dark:active:bg-gray-900"
                  onClick={() => navigate(`/caregiver/${c.id}`)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{c.name}</p>
                    {c.default_hourly_rate != null && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">${c.default_hourly_rate.toFixed(2)}/hr</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusChip status={c.employment_status} />
                    <span className="text-gray-300 dark:text-gray-600">›</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {showAddCaregiver ? (
            <form onSubmit={handleAddCaregiver} className="space-y-3 border-t border-gray-100 pt-3 dark:border-gray-700">
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
              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowAddCaregiver(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={addCaregiverSubmitting}>
                  {addCaregiverSubmitting ? 'Adding…' : 'Add caregiver'}
                </Button>
              </div>
            </form>
          ) : (
            <button
              className="w-full rounded-xl border border-dashed border-gray-300 py-2.5 text-sm font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400"
              onClick={() => setShowAddCaregiver(true)}
            >
              + Add caregiver
            </button>
          )}
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

      {isParentOrCoAdmin && (
        <Link
          to="/audit-log"
          className="block rounded-xl bg-gray-100 px-3 py-2 text-center text-sm font-medium text-gray-900 dark:bg-gray-700 dark:text-gray-100"
        >
          Audit Log
        </Link>
      )}
    </div>
  )
}
