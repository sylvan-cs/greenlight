import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getInitials } from '../lib/helpers'
import { supabase } from '../lib/supabase'

export default function Profile() {
  const { user, signOut } = useAuth()
  const [phone, setPhone] = useState('')
  const [phoneSaved, setPhoneSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const fullName = user?.user_metadata?.full_name ?? 'User'
  const email = user?.email ?? ''

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.phone) setPhone(data.phone)
      })
  }, [user])

  const savePhone = async () => {
    if (!user) return
    setSaving(true)
    setPhoneSaved(false)
    try {
      await supabase
        .from('profiles')
        .update({ phone })
        .eq('id', user.id)
      setPhoneSaved(true)
      setTimeout(() => setPhoneSaved(false), 3000)
    } catch (e) {
      console.error('Failed to save phone:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ paddingTop: 32 }}>
      <h1 className="font-display font-bold" style={{ fontSize: 30, marginBottom: 32 }}>Profile</h1>

      <div className="bg-dark-card border border-dark-border rounded-2xl p-6 mb-6">
        <div className="w-16 h-16 rounded-full bg-green-primary/15 border-2 border-green-primary flex items-center justify-center mb-4">
          <span className="text-green-primary text-xl font-bold">
            {getInitials(fullName)}
          </span>
        </div>
        <p className="font-display font-semibold text-lg">{fullName}</p>
        <p className="text-text-secondary text-sm">{email}</p>
      </div>

      <div className="bg-dark-card border border-dark-border rounded-2xl p-6 mb-6">
        <label htmlFor="phone" className="mb-2 block" style={{ fontSize: 13, color: '#9CA3AF' }}>
          Phone Number
        </label>
        <p className="text-text-secondary text-xs mb-3">
          Get SMS alerts when a matching tee time is found.
        </p>
        <div className="flex gap-3">
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+1 (555) 123-4567"
            className="flex-1 px-4 py-3.5 bg-dark-bg border border-dark-border rounded-xl text-white placeholder-text-secondary focus:outline-none focus:border-green-primary transition-colors"
          />
          <button
            onClick={savePhone}
            disabled={saving}
            className="px-5 py-3.5 bg-green-primary hover:bg-green-hover text-white font-bold rounded-xl transition-colors disabled:opacity-50 text-sm"
          >
            {saving ? 'Saving...' : phoneSaved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      <button
        onClick={signOut}
        className="w-full py-3.5 border border-dark-border text-text-secondary font-medium rounded-xl hover:bg-dark-card transition-colors"
      >
        Sign Out
      </button>
    </div>
  )
}
