import { Outlet, NavLink, useLocation } from 'react-router-dom'

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

const tabs = [
  { to: '/home', label: 'Home', Icon: HomeIcon },
  { to: '/profile', label: 'Profile', Icon: ProfileIcon },
]

export default function Layout() {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-background font-body">
      {/* Scrollable content area */}
      <main className="pb-24 pt-4 px-5 max-w-lg mx-auto">
        <div key={location.pathname} className="page-enter">
          <Outlet />
        </div>
      </main>

      {/* Fixed bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,0,0,0.3)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {tabs.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-3 py-2 text-[11px] font-medium font-body transition-all duration-150 tap-target ${
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon active={isActive} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
