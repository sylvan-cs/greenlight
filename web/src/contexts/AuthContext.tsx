import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  needsOnboarding: boolean
  setNeedsOnboarding: (val: boolean) => void
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null; userId: string | null }>
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
  const [loading, setLoading] = useState(true) // only true on first load
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const isInitialized = useRef(false)

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      isInitialized.current = true
      setLoading(false) // this is the ONLY place loading transitions to false

      // Check onboarding in background, don't block
      if (session?.user) {
        checkOnboarding(session.user.id).then(setNeedsOnboarding)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, eventSession) => {
      setSession(eventSession)
      setUser(eventSession?.user ?? null)
      // NEVER set loading here

      if (event === 'SIGNED_IN' && eventSession?.user) {
        checkOnboarding(eventSession.user.id).then(setNeedsOnboarding)
      }
      if (event === 'SIGNED_OUT') {
        setNeedsOnboarding(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    return { error: error?.message ?? null, userId: data?.user?.id ?? null }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
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
