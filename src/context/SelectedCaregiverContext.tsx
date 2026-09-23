import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useHousehold } from './HouseholdContext'
import { useCaregivers } from '../lib/useCaregivers'
import { caregiverColor, type CaregiverColor } from '../lib/caregiverColors'
import type { CaregiverProfile } from '../lib/types'

// One caregiver list and one "who am I looking at" selection shared by every
// tab, so switching Time -> Calendar -> Pay keeps the same nanny selected
// instead of each screen resetting to the first caregiver. The choice is
// remembered per household across reloads.
interface SelectedCaregiverContextValue {
  caregivers: CaregiverProfile[]
  caregiversLoading: boolean
  refreshCaregivers: () => Promise<void>
  selectedCaregiverId: string | null
  selectedCaregiver: CaregiverProfile | null
  setSelectedCaregiverId: (id: string) => void
  colorFor: (caregiverId: string) => CaregiverColor
}

const SelectedCaregiverContext = createContext<SelectedCaregiverContextValue | undefined>(undefined)

function storageKey(householdId: string): string {
  return `nannager:selected-caregiver:${householdId}`
}

function readStored(householdId: string | undefined): string | null {
  if (!householdId) return null
  try {
    return localStorage.getItem(storageKey(householdId))
  } catch {
    return null
  }
}

export function SelectedCaregiverProvider({ children }: { children: ReactNode }) {
  const { household, isNanny, caregiverProfile } = useHousehold()
  const { caregivers, loading: caregiversLoading, refresh: refreshCaregivers } = useCaregivers(household?.id)
  const [storedId, setStoredId] = useState<string | null>(() => readStored(household?.id))

  useEffect(() => {
    setStoredId(readStored(household?.id))
  }, [household?.id])

  const setSelectedCaregiverId = useCallback(
    (id: string) => {
      setStoredId(id)
      if (!household?.id) return
      try {
        localStorage.setItem(storageKey(household.id), id)
      } catch {
        // In-memory selection still works when browser storage is blocked.
      }
    },
    [household?.id]
  )

  // A nanny only ever sees their own profile. For parents, fall back to the
  // first active caregiver when nothing (or a since-removed caregiver) is
  // remembered.
  const selectedCaregiverId = isNanny
    ? caregiverProfile?.id ?? null
    : caregivers.some((c) => c.id === storedId)
      ? storedId
      : (caregivers.find((c) => c.employment_status === 'active') ?? caregivers[0])?.id ?? null

  const value = useMemo<SelectedCaregiverContextValue>(() => {
    const ids = caregivers.map((c) => c.id)
    return {
      caregivers,
      caregiversLoading,
      refreshCaregivers,
      selectedCaregiverId,
      selectedCaregiver:
        caregivers.find((c) => c.id === selectedCaregiverId) ?? (isNanny ? caregiverProfile : null),
      setSelectedCaregiverId,
      colorFor: (id: string) => caregiverColor(id, ids),
    }
  }, [caregivers, caregiversLoading, refreshCaregivers, selectedCaregiverId, isNanny, caregiverProfile, setSelectedCaregiverId])

  return <SelectedCaregiverContext.Provider value={value}>{children}</SelectedCaregiverContext.Provider>
}

export function useSelectedCaregiver() {
  const ctx = useContext(SelectedCaregiverContext)
  if (!ctx) throw new Error('useSelectedCaregiver must be used within SelectedCaregiverProvider')
  return ctx
}
