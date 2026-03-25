import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Welcome from './pages/Welcome'
import SignUp from './pages/SignUp'
import LogIn from './pages/LogIn'
import Home from './pages/Home'
import Profile from './pages/Profile'
import StartRound from './pages/StartRound'
import StartRoundWho from './pages/StartRoundWho'
import RoundDetail from './pages/RoundDetail'
import SharePage from './pages/SharePage'
import OnboardCourses from './pages/OnboardCourses'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import type { ReactNode } from 'react'

function SplashScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-background">
      <h1 className="text-4xl font-display tracking-tight text-foreground">The Starter</h1>
      <div className="w-8 h-[3px] bg-primary rounded-full mt-3" />
    </div>
  )
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, needsOnboarding } = useAuth()

  if (loading) return <SplashScreen />
  if (!user) return <Navigate to="/" replace />
  if (needsOnboarding) return <Navigate to="/onboard/courses" replace />
  return <>{children}</>
}

function OnboardRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return <SplashScreen />
  if (!user) return <Navigate to="/" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return <SplashScreen />
  if (user) return <Navigate to="/home" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><Welcome /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><SignUp /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><LogIn /></PublicRoute>} />

      <Route path="/onboard/courses" element={<OnboardRoute><OnboardCourses /></OnboardRoute>} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/home" element={<Home />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="/start" element={<ProtectedRoute><StartRound /></ProtectedRoute>} />
      <Route path="/start/available" element={<ProtectedRoute><StartRoundWho /></ProtectedRoute>} />
      <Route path="/round/:id" element={<ProtectedRoute><RoundDetail /></ProtectedRoute>} />

      <Route path="/r/:shareCode" element={<SharePage />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
