import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { Button, Field, inputClass } from '../components/Card'

export function Onboarding() {
  const { user } = useAuth()
  const { refresh } = useHousehold()
  const [householdName, setHouseholdName] = useState('')
  const [nannyName, setNannyName] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
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
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Set up your household</h1>
        <p className="mb-6 text-sm text-gray-500">
          You can add more caregivers and adjust settings later.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
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
