// Each caregiver gets a stable accent color (by position in the household's
// name-ordered caregiver list) so the same person reads the same way on the
// picker, the calendar, and Home.
export interface CaregiverColor {
  dot: string
  soft: string
  text: string
  ring: string
}

const PALETTE: CaregiverColor[] = [
  { dot: 'bg-sky-500', soft: 'bg-sky-50 dark:bg-sky-500/15', text: 'text-sky-700 dark:text-sky-300', ring: 'ring-sky-500' },
  { dot: 'bg-violet-500', soft: 'bg-violet-50 dark:bg-violet-500/15', text: 'text-violet-700 dark:text-violet-300', ring: 'ring-violet-500' },
  { dot: 'bg-amber-500', soft: 'bg-amber-50 dark:bg-amber-500/15', text: 'text-amber-800 dark:text-amber-300', ring: 'ring-amber-500' },
  { dot: 'bg-rose-500', soft: 'bg-rose-50 dark:bg-rose-500/15', text: 'text-rose-700 dark:text-rose-300', ring: 'ring-rose-500' },
  { dot: 'bg-teal-500', soft: 'bg-teal-50 dark:bg-teal-500/15', text: 'text-teal-700 dark:text-teal-300', ring: 'ring-teal-500' },
  { dot: 'bg-lime-600', soft: 'bg-lime-50 dark:bg-lime-500/15', text: 'text-lime-800 dark:text-lime-300', ring: 'ring-lime-600' },
]

export function caregiverColor(caregiverId: string, caregiverIds: string[]): CaregiverColor {
  const index = caregiverIds.indexOf(caregiverId)
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length]
}
