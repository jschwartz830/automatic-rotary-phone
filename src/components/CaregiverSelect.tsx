import type { CaregiverProfile } from '../lib/types'
import { inputClass } from './Card'

export function CaregiverSelect({
  caregivers,
  value,
  onChange,
}: {
  caregivers: CaregiverProfile[]
  value: string | null
  onChange: (id: string) => void
}) {
  if (caregivers.length === 0) return null
  return (
    <select
      className={`${inputClass} mb-4`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      {caregivers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}
