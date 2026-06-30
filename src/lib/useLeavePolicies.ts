import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { LeavePolicy } from './types'

export function useLeavePolicies(caregiverId: string | null) {
  const [policies, setPolicies] = useState<LeavePolicy[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!caregiverId) {
      setPolicies([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase.from('leave_policies').select('*').eq('caregiver_id', caregiverId)
    setPolicies((data ?? []) as LeavePolicy[])
    setLoading(false)
  }, [caregiverId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { policies, loading, refresh }
}
