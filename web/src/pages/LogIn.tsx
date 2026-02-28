import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function LogIn() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 pt-14">
      <div className="w-full max-w-sm mx-auto flex flex-col gap-8">
        {/* Back */}
        <button
          onClick={() => navigate('/')}
          className="self-start w-9 h-9 rounded-full flex items-center justify-center bg-muted/60 hover:bg-muted transition-colors active:scale-95"
          aria-label="Go back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

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
            <label className="text-sm font-body font-medium text-foreground" htmlFor="password">
              Password
            </label>
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
      </div>
    </div>
  )
}
