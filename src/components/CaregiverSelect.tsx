import { useSelectedCaregiver } from '../context/SelectedCaregiverContext'

// One-tap caregiver switcher shown on parent screens. Bound to the shared
// selection, so picking a nanny here carries over to every other tab. Hidden
// entirely when there's only one caregiver -- there's nothing to choose.
export function CaregiverSelect({
  allOption,
  allSelected = false,
  onSelectAll,
  onSelect,
}: {
  // Optional "All" chip (Calendar's combined view).
  allOption?: boolean
  allSelected?: boolean
  onSelectAll?: () => void
  onSelect?: (id: string) => void
} = {}) {
  const { caregivers, selectedCaregiverId, setSelectedCaregiverId, colorFor } = useSelectedCaregiver()
  if (caregivers.length < 2) return null

  const visible = caregivers.filter((c) => c.employment_status === 'active' || c.id === selectedCaregiverId)
  const chip = (active: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
        : 'bg-white text-gray-700 ring-1 ring-gray-200 active:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700'
    }`

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5" role="tablist" aria-label="Caregiver">
      {allOption && (
        <button type="button" role="tab" aria-selected={allSelected} className={chip(allSelected)} onClick={onSelectAll}>
          All
        </button>
      )}
      {visible.map((c) => {
        const active = !allSelected && c.id === selectedCaregiverId
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={chip(active)}
            onClick={() => {
              setSelectedCaregiverId(c.id)
              onSelect?.(c.id)
            }}
          >
            <span className={`h-2 w-2 rounded-full ${colorFor(c.id).dot}`} aria-hidden />
            {c.name}
          </button>
        )
      })}
    </div>
  )
}
