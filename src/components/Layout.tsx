import { NavLink, Outlet } from 'react-router-dom'
import { useHousehold } from '../context/HouseholdContext'

const PARENT_TABS = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/time', label: 'Time', icon: '⏱️' },
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/pay', label: 'Pay', icon: '💵' },
  { to: '/more', label: 'More', icon: '⋯' },
]

const NANNY_TABS = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/time', label: 'Time', icon: '⏱️' },
  { to: '/pto', label: 'PTO', icon: '🌴' },
  { to: '/pay', label: 'Pay', icon: '💵' },
]

export function Layout() {
  const { isNanny } = useHousehold()
  const tabs = isNanny ? NANNY_TABS : PARENT_TABS

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col bg-gray-50">
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-1/2 z-10 w-full max-w-md -translate-x-1/2 border-t border-gray-200 bg-white">
        <div className="flex">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                  isActive ? 'text-gray-900' : 'text-gray-400'
                }`
              }
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
