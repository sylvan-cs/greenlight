import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function SignUp() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await signUp(email, password, fullName)
    setLoading(false)

    if (error) {
      setError(error)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
            <span className="text-2xl">✉️</span>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-display tracking-tight">Check your email</h2>
            <p className="text-sm font-body text-muted-foreground">
              We sent a confirmation link to <span className="text-foreground font-medium">{email}</span>. Click the link to activate your account.
            </p>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="w-full h-12 border border-border text-foreground font-medium rounded-xl hover:bg-muted/50 transition-colors font-body"
          >
            Back to Log In
          </button>
        </div>
      </div>
    )
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
        <h1 className="text-4xl font-display tracking-tight">Create Account</h1>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-body font-medium text-foreground" htmlFor="fullName">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
              autoComplete="name"
              className="w-full h-12 px-4 bg-card border border-border rounded-xl text-foreground font-body placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              placeholder="Jane Smith"
            />
          </div>
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
              minLength={6}
              autoComplete="new-password"
              className="w-full h-12 px-4 bg-card border border-border rounded-xl text-foreground font-body placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              placeholder="Min. 6 characters"
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
            {loading ? 'Creating account\u2026' : 'Sign Up'}
          </button>
        </form>

        {/* Switch */}
        <p className="text-sm font-body text-muted-foreground text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
