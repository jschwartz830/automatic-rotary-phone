import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { Button, Field, inputClass } from '../components/Card'

export function Login() {
  const { signInWithPassword, signUp } = useAuth()
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const result =
      mode === 'sign_in'
        ? await signInWithPassword(email, password)
        : await signUp(email, password, fullName)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else if (mode === 'sign_up') {
      setConfirmSent(true)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Nanny Ledger</h1>
        <p className="mb-6 text-sm text-gray-500">
          Schedule, time, PTO, guaranteed hours, and payment records for your household.
        </p>

        {confirmSent ? (
          <p className="rounded-xl bg-green-50 p-4 text-sm text-green-800">
            Check your email to confirm your account, then sign in.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'sign_up' && (
              <Field label="Full name">
                <input
                  className={inputClass}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </Field>
            )}
            <Field label="Email">
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {mode === 'sign_in' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        )}

        <button
          className="mt-4 text-sm text-gray-500 underline"
          onClick={() => {
            setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in')
            setError(null)
          }}
        >
          {mode === 'sign_in' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
