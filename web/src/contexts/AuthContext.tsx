import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  needsOnboarding: boolean
  setNeedsOnboarding: (val: boolean) => void
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function checkOnboarding(userId: string): Promise<boolean> {
  const { count } = await supabase
    .from('user_courses')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
  return (count ?? 0) === 0
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  // Once true, never show splash/loading screen for auth again
  const isInitialized = useRef(false)
  // Track whether the user explicitly called signOut
  const explicitSignOut = useRef(false)

  useEffect(() => {
    // Timeout only guards the initial load — never clears an already-resolved session
    const timeout = setTimeout(() => {
      if (!isInitialized.current) {
        isInitialized.current = true
        console.warn('Auth session check timed out — treating as unauthenticated')
        setLoading(false)
      }
    }, 2000)

    // Listen for auth state changes (fires INITIAL_SESSION on startup, then SIGNED_IN/OUT etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, eventSession) => {
        // If we already have a session and get a SIGNED_OUT event,
        // verify it's real before wiping state (guards against spurious events)
        if (event === 'SIGNED_OUT' && isInitialized.current && !explicitSignOut.current) {
          const { data: { session: verified } } = await supabase.auth.getSession()
          if (verified) {
            // Session is still valid — ignore this spurious SIGNED_OUT
            console.warn('Ignored spurious SIGNED_OUT — session still valid')
            return
          }
        }
        // Reset the explicit sign-out flag after handling
        explicitSignOut.current = false

        setSession(eventSession)
        setUser(eventSession?.user ?? null)

        if (eventSession?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          const needs = await checkOnboarding(eventSession.user.id)
          setNeedsOnboarding(needs)
        } else if (!eventSession) {
          setNeedsOnboarding(false)
        }

        // Mark initial load complete on the first event (INITIAL_SESSION)
        if (!isInitialized.current) {
          isInitialized.current = true
          clearTimeout(timeout)
          setLoading(false)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    return { error: error?.message ?? null }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    explicitSignOut.current = true
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, needsOnboarding, setNeedsOnboarding, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
