import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { Button, Field, inputClass } from '../components/Card'

type Mode = 'choose' | 'create' | 'join'

export function Onboarding() {
  const { user } = useAuth()
  const { refresh } = useHousehold()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('choose')

  // Create household fields
  const [householdName, setHouseholdName] = useState('')
  const [nannyName, setNannyName] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')

  // Join household fields
  const [joinCode, setJoinCode] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setSubmitting(true)
    try {
      const { data: household, error: householdError } = await supabase
        .from('households')
        .insert({ name: householdName, created_by: user.id })
        .select()
        .single()
      if (householdError) throw householdError

      const { error: membershipError } = await supabase.from('household_users').insert({
        household_id: household.id,
        user_id: user.id,
        role: 'parent_admin',
        status: 'active',
        accepted_at: new Date().toISOString(),
      })
      if (membershipError) throw membershipError

      if (nannyName.trim()) {
        const { error: caregiverError } = await supabase.from('caregiver_profiles').insert({
          household_id: household.id,
          name: nannyName.trim(),
          default_hourly_rate: hourlyRate ? Number(hourlyRate) : null,
        })
        if (caregiverError) throw caregiverError
      }

      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setSubmitting(true)
    try {
      const { error: rpcError } = await supabase.rpc('join_household_by_code', {
        p_code: joinCode.trim().toUpperCase(),
      })
      if (rpcError) throw rpcError
      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Could not join household.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'choose') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-gray-50 px-6 pt-[env(safe-area-inset-top)]">
        <div className="w-full max-w-sm space-y-4">
          <div>
            <h1 className="mb-1 text-2xl font-bold text-gray-900">Welcome</h1>
            <p className="text-sm text-gray-500">Are you setting up a new household or joining one?</p>
          </div>
          <button
            onClick={() => setMode('create')}
            className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm shadow-gray-900/5 transition active:scale-[0.98] active:bg-gray-50"
          >
            <p className="font-semibold text-gray-900">Set up my household</p>
            <p className="text-sm text-gray-500">I'm a parent / employer creating a new account.</p>
          </button>
          <button
            onClick={() => setMode('join')}
            className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm shadow-gray-900/5 transition active:scale-[0.98] active:bg-gray-50"
          >
            <p className="font-semibold text-gray-900">Join a household</p>
            <p className="text-sm text-gray-500">I'm a nanny / caregiver with a join code from my employer.</p>
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'join') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-gray-50 px-6 pt-[env(safe-area-inset-top)]">
        <div className="w-full max-w-sm">
          <button onClick={() => setMode('choose')} className="mb-4 text-sm text-blue-600 underline">
            ← Back
          </button>
          <h1 className="mb-1 text-2xl font-bold text-gray-900">Join a household</h1>
          <p className="mb-6 text-sm text-gray-500">
            Enter the join code your employer shared with you.
          </p>
          <form onSubmit={handleJoin} className="space-y-4">
            <Field label="Join code">
              <input
                className={`${inputClass} tracking-widest uppercase`}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={8}
                required
              />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Joining…' : 'Join household'}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm">
        <button onClick={() => setMode('choose')} className="mb-4 text-sm text-blue-600 underline">
          ← Back
        </button>
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Set up your household</h1>
        <p className="mb-6 text-sm text-gray-500">
          You can add more caregivers and adjust settings later.
        </p>
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Household name">
            <input
              className={inputClass}
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              placeholder="The Smith Family"
              required
            />
          </Field>
          <Field label="Nanny's name (optional)">
            <input
              className={inputClass}
              value={nannyName}
              onChange={(e) => setNannyName(e.target.value)}
              placeholder="Jane Doe"
            />
          </Field>
          {nannyName.trim() && (
            <Field label="Default hourly rate">
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="25.00"
              />
            </Field>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create household'}
          </Button>
        </form>
      </div>
    </div>
  )
}
