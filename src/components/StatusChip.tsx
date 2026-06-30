const COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  clocked_in: 'bg-green-100 text-green-700',
  missing_clock_out: 'bg-amber-100 text-amber-800',
  submitted: 'bg-blue-100 text-blue-700',
  needs_correction: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-700',
  payment_due: 'bg-amber-100 text-amber-800',
  paid: 'bg-green-100 text-green-700',
  locked: 'bg-gray-200 text-gray-700',
  pending: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-700',
  overdue: 'bg-red-100 text-red-700',
  upcoming: 'bg-blue-100 text-blue-700',
  due: 'bg-amber-100 text-amber-800',
  partially_paid: 'bg-amber-100 text-amber-800',
  corrected: 'bg-purple-100 text-purple-700',
  voided: 'bg-gray-200 text-gray-500',
  requested: 'bg-amber-100 text-amber-800',
  canceled: 'bg-gray-200 text-gray-500',
  used: 'bg-gray-100 text-gray-600',
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
}

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const classes = COLORS[status] ?? 'bg-gray-100 text-gray-700'
  const text = label ?? status.replace(/_/g, ' ')
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${classes}`}>
      {text}
    </span>
  )
}
