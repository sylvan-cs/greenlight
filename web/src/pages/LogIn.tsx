import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function LogIn() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await signIn(email, password)
    setLoading(false)

    if (error) {
      setError(error)
    } else {
      navigate('/home')
    }
  }

  const handleReset = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Enter your email address')
      return
    }
    setError('')
    setResetLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    setResetLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setResetSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 pt-14">
      <div className="w-full max-w-sm mx-auto flex flex-col gap-8">
        {/* Back */}
        <button
          onClick={() => resetMode ? (setResetMode(false), setError(''), setResetSent(false)) : navigate('/')}
          className="self-start w-9 h-9 rounded-full flex items-center justify-center bg-muted/60 hover:bg-muted transition-colors active:scale-95"
          aria-label="Go back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        {resetMode ? (
          <>
            <h1 className="text-4xl font-display tracking-tight">Reset Password</h1>

            {resetSent ? (
              <div className="bg-primary/8 border border-primary/20 rounded-2xl p-6 text-center space-y-3">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary mx-auto">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <p className="font-display text-lg text-foreground">Check your inbox</p>
                <p className="text-sm font-body text-muted-foreground">
                  We sent a password reset link to <strong className="text-foreground">{email}</strong>
                </p>
              </div>
            ) : (
              <form onSubmit={handleReset} className="flex flex-col gap-4">
                <p className="text-sm font-body text-muted-foreground">
                  Enter your email and we'll send you a link to reset your password.
                </p>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-body font-medium text-foreground" htmlFor="reset-email">
                    Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full h-12 px-4 bg-card border border-border rounded-xl text-foreground font-body placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    placeholder="you@example.com"
                  />
                </div>

                {error && (
                  <p className="text-sm font-body text-destructive" role="alert">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full h-14 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1 text-base font-body"
                >
                  {resetLoading ? 'Sending\u2026' : 'Send Reset Link'}
                </button>
              </form>
            )}
          </>
        ) : (
          <>
            {/* Header */}
            <h1 className="text-4xl font-display tracking-tight">Welcome Back</h1>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-body font-medium text-foreground" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full h-12 px-4 bg-card border border-border rounded-xl text-foreground font-body placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-body font-medium text-foreground" htmlFor="password">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setResetMode(true); setError('') }}
                    className="text-xs font-body font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full h-12 px-4 bg-card border border-border rounded-xl text-foreground font-body placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="text-sm font-body text-destructive" role="alert">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1 text-base font-body"
              >
                {loading ? 'Signing in\u2026' : 'Log In'}
              </button>
            </form>

            {/* Switch */}
            <p className="text-sm font-body text-muted-foreground text-center">
              Don't have an account?{' '}
              <Link to="/signup" className="text-primary font-medium hover:underline">
                Sign up
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
