import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Avatar from './Avatar'
import type { ProfileSearchResult, GroupWithMembers } from '../lib/types'

interface InviteFromGroupsProps {
  selectedUsers: ProfileSearchResult[]
  onSelectionChange: (users: ProfileSearchResult[]) => void
  existingUserIds?: string[]
}

export default function InviteFromGroups({ selectedUsers, onSelectionChange, existingUserIds = [] }: InviteFromGroupsProps) {
  const { user } = useAuth()
  const [groups, setGroups] = useState<GroupWithMembers[]>([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<(ProfileSearchResult & { groupName?: string })[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // All group members aggregated (excluding self)
  const [allMembers, setAllMembers] = useState<(ProfileSearchResult & { groupName: string })[]>([])

  // Fetch user's groups with members
  useEffect(() => {
    if (!user) return
    async function fetchGroups() {
      const { data: memberData } = await (supabase as any)
        .from('group_members')
        .select('group_id')
        .eq('user_id', user!.id)
      if (!memberData || memberData.length === 0) {
        setLoadingGroups(false)
        return
      }
      const groupIds = memberData.map((m: any) => m.group_id)
      const { data } = await (supabase as any)
        .from('groups')
        .select('*, group_members(*, profiles(id, full_name, email))')
        .in('id', groupIds) as unknown as { data: GroupWithMembers[] | null }
      if (data) {
        setGroups(data)
        // Build aggregate member pool
        const memberMap = new Map<string, ProfileSearchResult & { groupName: string }>()
        for (const g of data) {
          for (const m of g.group_members ?? []) {
            if (m.user_id === user!.id) continue
            if (!m.profiles?.full_name) continue
            if (!memberMap.has(m.user_id)) {
              memberMap.set(m.user_id, {
                id: m.user_id,
                full_name: m.profiles.full_name,
                email: m.profiles.email ?? '',
                groupName: g.name,
              })
            }
          }
        }
        setAllMembers(Array.from(memberMap.values()))
      }
      setLoadingGroups(false)
    }
    fetchGroups()
  }, [user])

  // Search within group members
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.trim().length < 1) {
      setResults([])
      setShowDropdown(false)
      return
    }

    debounceRef.current = setTimeout(() => {
      setSearching(true)
      const q = query.trim().toLowerCase()
      const excludeSet = new Set([
        ...existingUserIds,
        ...selectedUsers.map(u => u.id),
      ])
      const filtered = allMembers.filter(m =>
        !excludeSet.has(m.id) &&
        (m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      )
      setResults(filtered)
      setShowDropdown(true)
      setSearching(false)
    }, 150)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, allMembers]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
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

  const inviteGroup = (group: GroupWithMembers) => {
    const excludeSet = new Set([
      user?.id ?? '',
      ...existingUserIds,
      ...selectedUsers.map(u => u.id),
    ])
    const newMembers: ProfileSearchResult[] = (group.group_members ?? [])
      .filter(m => !excludeSet.has(m.user_id) && m.profiles?.full_name)
      .map(m => ({
        id: m.user_id,
        full_name: m.profiles!.full_name,
        email: m.profiles!.email ?? '',
      }))
    if (newMembers.length > 0) {
      onSelectionChange([...selectedUsers, ...newMembers])
    }
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

      {/* Invite a group */}
      {!loadingGroups && groups.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-body text-muted-foreground">Invite a group</p>
          <div className="flex flex-wrap gap-2">
            {groups.map(g => {
              const memberCount = (g.group_members ?? []).filter(m => m.user_id !== user?.id).length
              return (
                <button
                  key={g.id}
                  onClick={() => inviteGroup(g)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-body font-medium border border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-all duration-150 active:scale-95"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  {g.name} ({memberCount})
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Search individuals */}
      <div ref={containerRef} className="relative">
        <p className="text-xs font-body text-muted-foreground mb-1.5">
          {groups.length > 0 ? 'Or invite individuals' : 'Search by name or email'}
        </p>
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
            placeholder={groups.length > 0 ? 'Search group members' : 'Search by name or email'}
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
          <div className="absolute z-50 left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
            {results.map(profile => (
              <button
                key={profile.id}
                onClick={() => addUser(profile)}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-muted/50 transition-colors text-left"
              >
                <Avatar name={profile.full_name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-body font-medium text-foreground truncate">{profile.full_name}</p>
                  {profile.groupName && (
                    <p className="text-xs font-body text-muted-foreground truncate">{profile.groupName}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {showDropdown && query.trim().length >= 1 && results.length === 0 && !searching && (
          <div className="absolute z-50 left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-lg px-3.5 py-3">
            <p className="text-sm font-body text-muted-foreground">No members found</p>
          </div>
        )}
      </div>
    </section>
  )
}
