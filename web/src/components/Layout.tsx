import { Outlet, NavLink } from 'react-router-dom'

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#22C55E' : '#6B7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#22C55E' : '#6B7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

export default function Layout() {
  return (
    <div className="h-full w-full">
      {/* Scrollable content area */}
      <main className="min-h-full pb-24 w-full max-w-[480px] mx-auto px-6">
        <Outlet />
      </main>

      {/* Fixed bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-dark-bg"
        style={{ borderTop: '1px solid #2E2E2E' }}
      >
        <div className="max-w-[480px] mx-auto flex h-16 pb-[env(safe-area-inset-bottom)]">
          <NavLink
            to="/home"
            className="flex-1 flex flex-col items-center justify-center gap-2"
          >
            {({ isActive }) => (
              <>
                <HomeIcon active={isActive} />
                <span className={`text-[10px] font-medium leading-none ${isActive ? 'text-green-primary' : 'text-tab-inactive'}`}>Home</span>
              </>
            )}
          </NavLink>
          <NavLink
            to="/profile"
            className="flex-1 flex flex-col items-center justify-center gap-2"
          >
            {({ isActive }) => (
              <>
                <ProfileIcon active={isActive} />
                <span className={`text-[10px] font-medium leading-none ${isActive ? 'text-green-primary' : 'text-tab-inactive'}`}>Profile</span>
              </>
            )}
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
