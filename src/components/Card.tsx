import type { ReactNode } from 'react'

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm shadow-gray-900/5 dark:border-gray-800 dark:bg-gray-800 dark:shadow-none">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  const base =
    'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100'
  const variants: Record<string, string> = {
    primary: 'bg-gray-900 text-white active:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:active:bg-gray-300',
    secondary: 'bg-gray-100 text-gray-900 active:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:active:bg-gray-600',
    danger: 'bg-red-600 text-white active:bg-red-700 dark:bg-red-500 dark:active:bg-red-600',
    ghost: 'bg-transparent text-gray-700 active:bg-gray-100 dark:text-gray-300 dark:active:bg-gray-800',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-300 dark:focus:ring-gray-300'
