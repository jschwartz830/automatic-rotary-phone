import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { HouseholdProvider, useHousehold } from './context/HouseholdContext'
import { isSupabaseConfigured } from './lib/supabase'
import { Layout } from './components/Layout'
import { Login } from './routes/Login'
import { Onboarding } from './routes/Onboarding'
import { Home } from './routes/Home'
import { Schedule } from './routes/Schedule'
import { Time } from './routes/Time'
import { Pay } from './routes/Pay'
import { Pto } from './routes/Pto'
import { More } from './routes/More'
import { AuditLog } from './routes/AuditLog'
import { SetupRequired } from './routes/SetupRequired'

function Loading() {
  return (
    <div className="flex min-h-svh items-center justify-center pt-[env(safe-area-inset-top)] text-sm text-gray-400">
      Loading…
    </div>
  )
}

function Gate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  if (authLoading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  return <HouseholdProvider>{children}</HouseholdProvider>
}

function RequireHousehold({ children }: { children: React.ReactNode }) {
  const { loading, household } = useHousehold()
  if (loading) return <Loading />
  if (!household) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user, loading: authLoading } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={!authLoading && user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/onboarding"
        element={
          <Gate>
            <Onboarding />
          </Gate>
        }
      />
      <Route
        path="/"
        element={
          <Gate>
            <RequireHousehold>
              <Layout />
            </RequireHousehold>
          </Gate>
        }
      >
        <Route index element={<Home />} />
        <Route path="time" element={<Time />} />
        <Route path="calendar" element={<Schedule />} />
        <Route path="pay" element={<Pay />} />
        <Route path="pto" element={<Pto />} />
        <Route path="more" element={<More />} />
        <Route path="audit-log" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  )
}

export default App
