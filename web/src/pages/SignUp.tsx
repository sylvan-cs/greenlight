import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function SignUp() {
  const { signUp } = useAuth()
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
      <div className="flex flex-col items-center justify-center h-full px-6 w-full max-w-[480px] mx-auto">
        <div className="w-16 h-16 rounded-full bg-green-primary/20 flex items-center justify-center mb-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h2 className="font-display text-2xl font-bold mb-2">Check your email</h2>
        <p className="text-text-secondary text-center mb-8">
          We sent a confirmation link to <span className="text-white">{email}</span>
        </p>
        <Link to="/login" className="text-green-primary font-medium">
          Go to Log In
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full px-6 pt-16 w-full max-w-[480px] mx-auto">
      <h1 className="font-display text-[28px] font-bold mb-8">Create Account</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="fullName" className="mb-2 block" style={{ fontSize: 13, color: '#9CA3AF' }}>Full Name</label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            className="w-full px-4 py-3.5 bg-dark-card border border-dark-border rounded-xl text-white placeholder-text-secondary focus:outline-none focus:border-green-primary transition-colors"
            placeholder="John Doe"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-2 block" style={{ fontSize: 13, color: '#9CA3AF' }}>Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3.5 bg-dark-card border border-dark-border rounded-xl text-white placeholder-text-secondary focus:outline-none focus:border-green-primary transition-colors"
            placeholder="john@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block" style={{ fontSize: 13, color: '#9CA3AF' }}>Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-3.5 bg-dark-card border border-dark-border rounded-xl text-white placeholder-text-secondary focus:outline-none focus:border-green-primary transition-colors"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-green-primary hover:bg-green-hover text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 text-[15px]"
        >
          {loading ? 'Creating account...' : 'Sign Up'}
        </button>
      </form>

      <p className="text-text-secondary text-sm text-center mt-6">
        Already have an account?{' '}
        <Link to="/login" className="text-green-primary font-medium">Log in</Link>
      </p>
    </div>
  )
}
