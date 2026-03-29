import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Avatar from './Avatar'
import type { ProfileSearchResult } from '../lib/types'

interface InviteFriendsProps {
  selectedUsers: ProfileSearchResult[]
  onSelectionChange: (users: ProfileSearchResult[]) => void
  existingUserIds?: string[]
}

export default function InviteFriends({ selectedUsers, onSelectionChange, existingUserIds = [] }: InviteFriendsProps) {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProfileSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.trim().length < 2) {
      setResults([])
      setShowDropdown(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      if (!user) return
      setSearching(true)

      const q = query.trim()
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .neq('id', user.id)
        .limit(10)

      if (data) {
        const excludeSet = new Set([
          ...existingUserIds,
          ...selectedUsers.map(u => u.id),
        ])
        setResults(data.filter((p: any) => p.full_name && !excludeSet.has(p.id)) as ProfileSearchResult[])
        setShowDropdown(true)
      }
      setSearching(false)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const addUser = (profile: ProfileSearchResult) => {
    onSelectionChange([...selectedUsers, profile])
    setQuery('')
    setResults([])
    setShowDropdown(false)
  }

  const removeUser = (id: string) => {
    onSelectionChange(selectedUsers.filter(u => u.id !== id))
  }

  return (
    <section className="space-y-2.5">
      <h3 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
        Invite Friends
      </h3>

      {/* Selected chips */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedUsers.map(u => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-primary/15 border border-primary/40 text-sm font-body font-medium text-primary"
            >
              <Avatar name={u.full_name} confirmed size={22} />
              <span className="truncate max-w-[120px]">{u.full_name.split(' ')[0]}</span>
              <button
                onClick={() => removeUser(u.id)}
                className="ml-0.5 hover:text-foreground transition-colors"
                aria-label={`Remove ${u.full_name}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div ref={containerRef} className="relative">
        <div className="relative">
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => { if (results.length > 0) setShowDropdown(true) }}
            placeholder="Search by name or email"
            className="w-full h-11 pl-10 pr-4 bg-card border border-border rounded-xl text-foreground font-body text-sm placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
          {searching && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Dropdown results */}
        {showDropdown && results.length > 0 && (
          <div className="absolute z-50 left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
            {results.map(profile => (
              <button
                key={profile.id}
                onClick={() => addUser(profile)}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-muted/50 transition-colors text-left"
              >
                <Avatar name={profile.full_name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-body font-medium text-foreground truncate">{profile.full_name}</p>
                  <p className="text-xs font-body text-muted-foreground truncate">{profile.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {showDropdown && query.trim().length >= 2 && results.length === 0 && !searching && (
          <div className="absolute z-50 left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-lg px-3.5 py-3">
            <p className="text-sm font-body text-muted-foreground">No users found</p>
          </div>
        )}
      </div>
    </section>
  )
}
