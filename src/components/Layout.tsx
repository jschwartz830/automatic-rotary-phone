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
    <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-hidden bg-gray-50 pt-[env(safe-area-inset-top)] dark:bg-gray-900">
      <main className="min-h-0 flex-1 overflow-y-auto pb-[calc(3rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      {/* The dock is pinned to the TRUE bottom of the screen with
          position:fixed/bottom:0. This is the one anchor iOS gets right in an
          installed home-screen app: unlike viewport heights (vh/svh/dvh) and
          the fixed-positioning containing block used for full-height layout,
          which can stop short of the screen and leave a phantom-toolbar gap,
          bottom:0 lands on the real screen edge. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Belt-and-suspenders: extend the dock's background below its own box
            so the bottom edge stays covered even in the unlikely case bottom:0
            itself lands a few px short. Clipped off-screen when it doesn't. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-full h-40 bg-white/95 dark:bg-gray-900/95"
        />
        {/* Fixed row height keeps the bar identically sized on every tab,
            regardless of how each icon glyph happens to measure itself. */}
        <div className="flex h-12">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                  isActive ? 'text-gray-900 dark:text-gray-50' : 'text-gray-400 dark:text-gray-500'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-6 w-8 items-center justify-center rounded-full text-base leading-none ${
                      isActive ? 'bg-gray-100 dark:bg-gray-800' : ''
                    }`}
                  >
                    {tab.icon}
                  </span>
                  <span className="leading-none">{tab.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
