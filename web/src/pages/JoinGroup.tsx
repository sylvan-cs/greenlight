import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Avatar from '../components/Avatar'

interface GroupInfo {
  id: string
  name: string
  created_by: string
  group_members: { user_id: string; role: string; profiles?: { full_name: string } }[]
}

export default function JoinGroup() {
  const { inviteCode } = useParams<{ inviteCode: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState('')
  const [alreadyMember, setAlreadyMember] = useState(false)

  useEffect(() => {
    if (!inviteCode) return

    async function fetchGroup() {
      const { data, error } = await (supabase as any)
        .from('groups')
        .select('id, name, created_by, group_members(user_id, role, profiles(full_name))')
        .eq('invite_code', inviteCode!)
        .single() as unknown as { data: GroupInfo | null; error: any }

      if (error || !data) {
        setNotFound(true)
      } else {
        setGroup(data)
        if (user && data.group_members.some(m => m.user_id === user.id)) {
          setAlreadyMember(true)
        }
      }
      setLoading(false)
    }

    if (!authLoading) fetchGroup()
  }, [inviteCode, user, authLoading])

  const handleJoin = async () => {
    if (!group || !user) {
      // Not logged in — store invite code and redirect to signup
      localStorage.setItem('pending_group_invite', inviteCode ?? '')
      navigate('/signup')
      return
    }

    setJoining(true)
    setError('')

    const { error: joinError } = await (supabase as any)
      .from('group_members')
      .insert({
        group_id: group.id,
        user_id: user.id,
        role: 'member',
      })

    if (joinError) {
      if (joinError.message.includes('duplicate') || joinError.message.includes('unique')) {
        setAlreadyMember(true)
      } else {
        setError(joinError.message)
      }
      setJoining(false)
      return
    }

    // Send notification to group owner (fire-and-forget)
    fetch('/api/notify-group-join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: group.id, newUserId: user.id }),
    }).catch(e => console.error('notify-group-join failed:', e))

    setJoined(true)
    setJoining(false)

    // Redirect to home after a brief moment
    setTimeout(() => navigate('/home'), 1500)
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background px-5 max-w-lg mx-auto pt-8">
        <div className="skeleton" style={{ height: 16, width: 96, marginBottom: 32 }} />
        <div className="skeleton" style={{ height: 36, width: 256, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 16, width: 160, marginBottom: 32 }} />
        <div className="skeleton w-full" style={{ height: 56 }} />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-5 max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-full bg-card border border-border flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <p className="font-display text-xl font-bold text-foreground mb-2">Group not found</p>
        <p className="text-sm font-body text-muted-foreground">This invite link is invalid or has expired.</p>
      </div>
    )
  }

  if (!group) return null

  const ownerMember = group.group_members.find(m => m.role === 'owner')
  const ownerName = ownerMember?.profiles?.full_name ?? 'Someone'
  const memberCount = group.group_members.length

  return (
    <div className="min-h-screen bg-background px-5 max-w-lg mx-auto pt-8 pb-10 animate-fade-in">

      {/* Branding */}
      <p className="font-display text-sm text-muted-foreground mb-8">The Starter</p>

      {/* Group Info */}
      <p className="text-sm font-body text-muted-foreground mb-1">
        {ownerName}'s group
      </p>
      <h1 className="font-display text-primary text-[34px] leading-tight mb-2">
        {group.name}
      </h1>
      <p className="text-sm font-body text-muted-foreground mb-8">
        {memberCount} member{memberCount !== 1 ? 's' : ''}
      </p>

      {/* Member preview */}
      <div className="flex gap-1.5 mb-8">
        {group.group_members.slice(0, 5).map((m, i) => (
          <Avatar key={i} name={m.profiles?.full_name ?? '?'} confirmed={m.role === 'owner'} size={36} />
        ))}
        {memberCount > 5 && (
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-body text-muted-foreground">
            +{memberCount - 5}
          </div>
        )}
      </div>

      {/* Action */}
      {joined ? (
        <div className="bg-primary/8 border border-primary/20 rounded-2xl p-6 text-center space-y-2">
          <p className="font-display text-lg text-foreground">You're in!</p>
          <p className="text-sm font-body text-muted-foreground">
            Redirecting to your home screen...
          </p>
        </div>
      ) : alreadyMember ? (
        <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
          <p className="font-display text-lg text-foreground">You're already a member</p>
          <button
            onClick={() => navigate('/home')}
            className="text-primary font-body font-medium text-sm"
          >
            Go to Home
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full h-14 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-50 text-base font-body"
          >
            {joining ? 'Joining...' : user ? 'Join Group' : 'Join Group'}
          </button>

          {!user && (
            <p className="text-xs font-body text-muted-foreground text-center">
              You'll need to create an account or log in to join
            </p>
          )}

          {error && (
            <p className="text-sm font-body text-destructive text-center">{error}</p>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="text-center text-xs font-body text-muted-foreground mt-10">
        Powered by <span className="font-display">The Starter</span>
      </p>
    </div>
  )
}
