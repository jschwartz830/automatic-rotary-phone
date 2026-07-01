const COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  clocked_in: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  missing_clock_out: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  needs_correction: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  payment_due: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  paid: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  locked: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  upcoming: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  due: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  partially_paid: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  corrected: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
  voided: 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  requested: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  canceled: 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  used: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  active: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  inactive: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
}

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const classes = COLORS[status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  const text = label ?? status.replace(/_/g, ' ')
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${classes}`}>
      {text}
    </span>
  )
}
