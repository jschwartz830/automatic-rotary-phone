import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { HouseholdProvider, useHousehold } from './context/HouseholdContext'
import { PreferencesProvider } from './context/PreferencesContext'
import { SelectedCaregiverProvider } from './context/SelectedCaregiverContext'
import { isSupabaseConfigured } from './lib/supabase'
import { Layout } from './components/Layout'
import { Login } from './routes/Login'
import { Onboarding } from './routes/Onboarding'
import { Home } from './routes/Home'
import { Schedule } from './routes/Schedule'
import { Time } from './routes/Time'
import { Pay } from './routes/Pay'
import { PTO } from './routes/PTO'
import { More } from './routes/More'
import { CaregiverDetail } from './routes/CaregiverDetail'
import { AuditLog } from './routes/AuditLog'
import { SetupRequired } from './routes/SetupRequired'

function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-gray-50 pt-[env(safe-area-inset-top)] text-sm text-gray-400 dark:bg-gray-900">
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

function LoadError() {
  const { error, refresh } = useHousehold()
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 overflow-y-auto bg-gray-50 px-6 pt-[env(safe-area-inset-top)] text-center text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
      <p>Couldn't load your household.</p>
      <p className="text-xs">{error}</p>
      <button onClick={() => refresh()} className="text-blue-600 underline dark:text-blue-400">
        Try again
      </button>
    </div>
  )
}

function RequireHousehold({ children }: { children: React.ReactNode }) {
  const { loading, error, household } = useHousehold()
  if (loading) return <Loading />
  if (!household) return error ? <LoadError /> : <Navigate to="/onboarding" replace />
  return <>{children}</>
}

// Onboarding is only for users with no household. Without this guard a user
// who lands here (stale link, back button, failed lookup) can create a
// duplicate household.
function RequireNoHousehold({ children }: { children: React.ReactNode }) {
  const { loading, error, household } = useHousehold()
  if (loading) return <Loading />
  if (household) return <Navigate to="/" replace />
  if (error) return <LoadError />
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
            <RequireNoHousehold>
              <Onboarding />
            </RequireNoHousehold>
          </Gate>
        }
      />
      <Route
        path="/"
        element={
          <Gate>
            <RequireHousehold>
              <SelectedCaregiverProvider>
                <Layout />
              </SelectedCaregiverProvider>
            </RequireHousehold>
          </Gate>
        }
      >
        <Route index element={<Home />} />
        <Route path="time" element={<Time />} />
        <Route path="calendar" element={<Schedule />} />
        <Route path="pay" element={<Pay />} />
        <Route path="pto" element={<PTO />} />
        <Route path="more" element={<More />} />
        <Route path="caregiver/:id" element={<CaregiverDetail />} />
        <Route path="audit-log" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  if (!isSupabaseConfigured) {
    return (
      <PreferencesProvider>
        <SetupRequired />
      </PreferencesProvider>
    )
  }

  return (
    <PreferencesProvider>
      <AuthProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </AuthProvider>
    </PreferencesProvider>
  )
}

export default App
