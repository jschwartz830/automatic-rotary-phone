import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { errorMessage } from '../lib/errors'
import type { CaregiverProfile, Household, HouseholdUser } from '../lib/types'

interface HouseholdContextValue {
  loading: boolean
  // Set when the household lookup failed. Callers must not treat a failed
  // lookup as "no household" -- that sends the user to onboarding, where they
  // end up creating a duplicate household.
  error: string | null
  households: Household[]
  membership: HouseholdUser | null
  household: Household | null
  caregiverProfile: CaregiverProfile | null
  isParentAdmin: boolean
  isParentOrCoAdmin: boolean
  isNanny: boolean
  // True unless the current user is a parent_co_admin explicitly restricted
  // from this permission key (household_users.permissions[key] === false).
  // Parent admins are never restricted. Mirrors coadmin_permission_allowed()
  // in the DB (migration 0002) for keys the UI wants to gate client-side.
  coadminAllowed: (key: string) => boolean
  refresh: () => Promise<void>
  setActiveHouseholdId: (id: string) => void
}

const HouseholdContext = createContext<HouseholdContextValue | undefined>(undefined)

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  // Supabase hands out a new user object on every auth event (token refresh,
  // tab refocus), so key the lookup on the id to avoid needless reloads.
  const userId = user?.id ?? null
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [households, setHouseholds] = useState<Household[]>([])
  const [memberships, setMemberships] = useState<HouseholdUser[]>([])
  const [activeHouseholdId, setActiveHouseholdIdState] = useState<string | null>(
    () => {
      try {
        return localStorage.getItem('nanny-ledger:active-household')
      } catch {
        return null
      }
    }
  )
  const [caregiverProfile, setCaregiverProfile] = useState<CaregiverProfile | null>(null)

  const setActiveHouseholdId = useCallback((id: string) => {
    try {
      localStorage.setItem('nanny-ledger:active-household', id)
    } catch {
      // The in-memory selection still works when browser storage is blocked.
    }
    setActiveHouseholdIdState(id)
  }, [])

  const refresh = useCallback(async () => {
    if (!userId) {
      setHouseholds([])
      setMemberships([])
      setCaregiverProfile(null)
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    try {
      const { data: membershipRows, error: membershipError } = await supabase
        .from('household_users')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
      if (membershipError) throw membershipError

      const memberships = (membershipRows ?? []) as HouseholdUser[]

      const householdIds = memberships.map((m) => m.household_id)
      let householdList: Household[] = []
      if (householdIds.length > 0) {
        const { data: householdRows, error: householdError } = await supabase
          .from('households')
          .select('*')
          .in('id', householdIds)
          .order('created_at')
        if (householdError) throw householdError
        householdList = (householdRows ?? []) as Household[]
      }

      const { data: caregiverRows, error: caregiverError } = await supabase
        .from('caregiver_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (caregiverError) throw caregiverError

      setMemberships(memberships)
      setHouseholds(householdList)
      setCaregiverProfile((caregiverRows ?? null) as CaregiverProfile | null)
    } catch (err) {
      // Keep whatever was loaded before so a transient failure doesn't make
      // the household vanish mid-session.
      setError(errorMessage(err, 'Could not load your household.'))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const household =
    households.find((h) => h.id === activeHouseholdId) ?? households[0] ?? null
  const membership =
    memberships.find((m) => m.household_id === household?.id) ?? null

  // PostgREST does not guarantee row order without an explicit order clause.
  // Remember the fallback chosen on first load so a refresh (including the one
  // after saving household settings) cannot silently switch to another
  // household and make that household's caregiver history appear to vanish.
  useEffect(() => {
    if (household && household.id !== activeHouseholdId) {
      setActiveHouseholdId(household.id)
    }
  }, [activeHouseholdId, household, setActiveHouseholdId])

  const value: HouseholdContextValue = {
    loading,
    error,
    households,
    membership,
    household,
    caregiverProfile,
    isParentAdmin: membership?.role === 'parent_admin',
    isParentOrCoAdmin: membership?.role === 'parent_admin' || membership?.role === 'parent_co_admin',
    isNanny: membership?.role === 'nanny',
    coadminAllowed: (key) =>
      membership?.role !== 'parent_co_admin' || membership.permissions?.[key] !== false,
    refresh,
    setActiveHouseholdId,
  }

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext)
  if (!ctx) throw new Error('useHousehold must be used within HouseholdProvider')
  return ctx
}
