import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { CaregiverProfile } from './types'

export function useCaregivers(householdId: string | undefined) {
  const [caregivers, setCaregivers] = useState<CaregiverProfile[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!householdId) {
      setCaregivers([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('caregiver_profiles')
      .select('*')
      .eq('household_id', householdId)
      .order('name')
    setCaregivers((data ?? []) as CaregiverProfile[])
    setLoading(false)
  }, [householdId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { caregivers, loading, refresh }
}
