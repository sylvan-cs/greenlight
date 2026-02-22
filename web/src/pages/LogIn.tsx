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
    <div className="flex flex-col h-full px-6 pt-16 w-full max-w-[480px] mx-auto">
      <h1 className="font-display text-[28px] font-bold mb-8">Welcome Back</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          {loading ? 'Signing in...' : 'Log In'}
        </button>
      </form>

      <p className="text-text-secondary text-sm text-center mt-6">
        Don't have an account?{' '}
        <Link to="/signup" className="text-green-primary font-medium">Sign up</Link>
      </p>
    </div>
  )
}
