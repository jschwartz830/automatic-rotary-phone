import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import type { CaregiverProfile, Household, HouseholdUser } from '../lib/types'

interface HouseholdContextValue {
  loading: boolean
  households: Household[]
  membership: HouseholdUser | null
  household: Household | null
  caregiverProfile: CaregiverProfile | null
  isParentAdmin: boolean
  isParentOrCoAdmin: boolean
  isNanny: boolean
  refresh: () => Promise<void>
  setActiveHouseholdId: (id: string) => void
}

const HouseholdContext = createContext<HouseholdContextValue | undefined>(undefined)

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [households, setHouseholds] = useState<Household[]>([])
  const [memberships, setMemberships] = useState<HouseholdUser[]>([])
  const [activeHouseholdId, setActiveHouseholdIdState] = useState<string | null>(
    () => localStorage.getItem('nanny-ledger:active-household')
  )
  const [caregiverProfile, setCaregiverProfile] = useState<CaregiverProfile | null>(null)

  const setActiveHouseholdId = useCallback((id: string) => {
    localStorage.setItem('nanny-ledger:active-household', id)
    setActiveHouseholdIdState(id)
  }, [])

  const refresh = useCallback(async () => {
    if (!user) {
      setHouseholds([])
      setMemberships([])
      setCaregiverProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)

    const { data: membershipRows } = await supabase
      .from('household_users')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')

    const memberships = (membershipRows ?? []) as HouseholdUser[]
    setMemberships(memberships)

    const householdIds = memberships.map((m) => m.household_id)
    if (householdIds.length > 0) {
      const { data: householdRows } = await supabase
        .from('households')
        .select('*')
        .in('id', householdIds)
      setHouseholds((householdRows ?? []) as Household[])
    } else {
      setHouseholds([])
    }

    const { data: caregiverRows } = await supabase
      .from('caregiver_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    setCaregiverProfile((caregiverRows ?? null) as CaregiverProfile | null)

    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  const household =
    households.find((h) => h.id === activeHouseholdId) ?? households[0] ?? null
  const membership =
    memberships.find((m) => m.household_id === household?.id) ?? null

  const value: HouseholdContextValue = {
    loading,
    households,
    membership,
    household,
    caregiverProfile,
    isParentAdmin: membership?.role === 'parent_admin',
    isParentOrCoAdmin: membership?.role === 'parent_admin' || membership?.role === 'parent_co_admin',
    isNanny: membership?.role === 'nanny',
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
