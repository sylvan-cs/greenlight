import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatDateShort, formatTime } from '../lib/helpers'
import { SmallAvatarRow, AvatarWithLabel } from '../components/Avatar'
import Avatar from '../components/Avatar'
import StatusBadge from '../components/StatusBadge'
import type { RoundWithDetails, Rsvp } from '../lib/types'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  return 'Evening'
}

function NextRoundCard({ round, onClick }: { round: RoundWithDetails; onClick: () => void }) {
  const courseNames = round.round_courses?.map(rc => rc.courses?.name).filter(Boolean) ?? []
  const courseDisplay = courseNames.length > 0 ? courseNames[0] : formatDateShort(round.round_date)
  const rsvps = round.rsvps ?? []
  const rsvpsIn = rsvps.filter(r => r.status === 'in')

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card border border-border rounded-2xl p-5 transition-all duration-150 hover:border-primary/30 active:scale-[0.99] tap-target"
    >
      {/* Course + badge */}
      <div className="flex items-center gap-2.5 mb-1">
        <p className="font-display text-lg leading-tight text-foreground">
          {courseDisplay}
        </p>
        {round.status === 'booked' && <StatusBadge status="booked" />}
      </div>

      {/* Date / time */}
      <p className="text-sm font-body text-muted-foreground mb-5">
        {formatDateShort(round.round_date)} &middot;{' '}
        {round.has_specific_time && round.specific_tee_time
          ? formatTime(round.specific_tee_time)
          : `${formatTime(round.time_window_start)} – ${formatTime(round.time_window_end)}`}
      </p>

      {/* Large avatars */}
      <div className="flex gap-2 mb-4">
        {rsvpsIn.map((r, i) => (
          <AvatarWithLabel key={i} name={r.name} confirmed={true} />
        ))}
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-primary font-body font-semibold text-xs tracking-wide uppercase">
            {rsvpsIn.length === round.spots_needed
              ? `You're all set \u00B7 ${rsvpsIn.length} playing`
              : `${rsvpsIn.length} of ${round.spots_needed} are in`}
          </span>
        </div>
        {courseNames.length > 0 && round.round_courses?.[0]?.courses?.city && (
          <span className="text-xs font-body text-muted-foreground">
            {round.round_courses[0].courses.city}
          </span>
        )}
      </div>
    </button>
  )
}

function InProgressCard({ round, onClick }: { round: RoundWithDetails; onClick: () => void }) {
  const courseNames = round.round_courses?.map(rc => rc.courses?.name).filter(Boolean) ?? []
  const rsvps = round.rsvps ?? []
  const rsvpsIn = rsvps.filter(r => r.status === 'in')

  const timeDisplay = round.has_specific_time && round.specific_tee_time
    ? formatTime(round.specific_tee_time)
    : `${formatTime(round.time_window_start)} – ${formatTime(round.time_window_end)}`

  return (
    <button
      onClick={onClick}
      className="w-full text-left relative bg-card border border-border rounded-2xl p-5 transition-all duration-150 hover:border-primary/30 active:scale-[0.99] tap-target"
    >
      {/* Arrow */}
      <div className="absolute top-5 right-5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>

      {/* Status badge */}
      <div className="mb-3">
        <StatusBadge status={round.status} />
      </div>

      {/* Course name */}
      {courseNames.length > 0 && (
        <p className="font-display text-[15px] font-medium text-foreground pr-8 mb-1">
          {courseNames.join(' or ')}
        </p>
      )}

      {/* Date / time */}
      <p className="text-sm font-body text-muted-foreground pr-8 mb-3">
        {formatDateShort(round.round_date)} &middot; {timeDisplay}
      </p>

      {/* Avatar row + count */}
      <div className="flex items-center justify-between">
        <SmallAvatarRow
          names={rsvps.map(r => ({ name: r.name, confirmed: r.status === 'in' }))}
          total={round.spots_needed}
        />
        <span className="text-xs font-body text-muted-foreground">
          {rsvpsIn.length} of {round.spots_needed} are in
        </span>
      </div>
    </button>
  )
}

function InvitedRoundCard({
  round,
  userId,
  onClick,
  onRsvpChange,
}: {
  round: RoundWithDetails
  userId: string
  onClick: () => void
  onRsvpChange: (rsvpId: string, status: 'in' | 'maybe' | 'out') => void
}) {
  const courseNames = round.round_courses?.map(rc => rc.courses?.name).filter(Boolean) ?? []
  const rsvps = round.rsvps ?? []
  const rsvpsIn = rsvps.filter(r => r.status === 'in')
  const myRsvp = rsvps.find(r => r.user_id === userId)
  const organizerName = rsvps[0]?.name?.split(' ')[0] ?? 'Someone'

  const timeDisplay = round.has_specific_time && round.specific_tee_time
    ? formatTime(round.specific_tee_time)
    : `${formatTime(round.time_window_start)} \u2013 ${formatTime(round.time_window_end)}`

  return (
    <div className="bg-card border border-border rounded-2xl p-5 transition-all duration-150 hover:border-primary/30">
      {/* Tappable header area */}
      <button onClick={onClick} className="w-full text-left">
        {/* Organizer */}
        <div className="flex items-center gap-2 mb-2">
          <Avatar name={rsvps[0]?.name ?? 'Someone'} confirmed size={24} />
          <span className="text-xs font-body text-muted-foreground">
            {organizerName} invited you
          </span>
        </div>

        {/* Course name */}
        {courseNames.length > 0 && (
          <p className="font-display text-[15px] font-medium text-foreground mb-1">
            {courseNames.join(' or ')}
          </p>
        )}

        {/* Date / time */}
        <p className="text-sm font-body text-muted-foreground mb-3">
          {formatDateShort(round.round_date)} &middot; {timeDisplay}
        </p>

        {/* Avatar row + count */}
        <div className="flex items-center justify-between mb-3">
          <SmallAvatarRow
            names={rsvps.map(r => ({ name: r.name, confirmed: r.status === 'in' }))}
            total={round.spots_needed}
          />
          <span className="text-xs font-body text-muted-foreground">
            {rsvpsIn.length} of {round.spots_needed} are in
          </span>
        </div>
      </button>

      {/* RSVP buttons */}
      {myRsvp && (
        <div className="flex gap-2">
          <button
            onClick={() => onRsvpChange(myRsvp.id, 'in')}
            className={`flex-1 h-9 rounded-lg text-sm font-body font-semibold transition-all duration-150 active:scale-95 border ${
              myRsvp.status === 'in'
                ? 'bg-primary/15 text-primary border-primary/40'
                : 'bg-transparent text-muted-foreground border-border hover:border-foreground/20'
            }`}
          >
            I'm In
          </button>
          <button
            onClick={() => onRsvpChange(myRsvp.id, 'maybe')}
            className={`flex-1 h-9 rounded-lg text-sm font-body font-semibold transition-all duration-150 active:scale-95 border ${
              myRsvp.status === 'maybe'
                ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                : 'bg-transparent text-muted-foreground border-border hover:border-foreground/20'
            }`}
          >
            Maybe
          </button>
          <button
            onClick={() => onRsvpChange(myRsvp.id, 'out')}
            className={`flex-1 h-9 rounded-lg text-sm font-body font-semibold transition-all duration-150 active:scale-95 border ${
              myRsvp.status === 'out'
                ? 'bg-destructive/15 text-destructive border-destructive/30'
                : 'bg-transparent text-muted-foreground border-border hover:border-foreground/20'
            }`}
          >
            Can't Go
          </button>
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rounds, setRounds] = useState<RoundWithDetails[]>([])
  const [invitedRounds, setInvitedRounds] = useState<RoundWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const hasFetched = useRef(false)

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? 'Golfer'

  useEffect(() => {
    async function fetchRounds() {
      if (!user) return

      // Fetch user's own rounds
      const { data, error } = await supabase
        .from('rounds')
        .select(`
          *,
          round_courses(*, courses(*)),
          rsvps(*)
        `)
        .eq('creator_id', user.id)
        .order('round_date', { ascending: true })

      if (error) {
        setFetchError(true)
      } else if (data) {
        setRounds(data as RoundWithDetails[])
      }

      // Fetch rounds the user was invited to
      const { data: rsvpData } = await supabase
        .from('rsvps')
        .select('round_id')
        .eq('user_id', user.id)
        .in('status', ['invited', 'in', 'maybe'])

      if (rsvpData && rsvpData.length > 0) {
        const roundIds = rsvpData.map(r => r.round_id)
        const { data: invData } = await supabase
          .from('rounds')
          .select(`
            *,
            round_courses(*, courses(*)),
            rsvps(*)
          `)
          .in('id', roundIds)
          .neq('creator_id', user.id)
          .neq('status', 'cancelled')
          .order('round_date', { ascending: true })

        if (invData) {
          setInvitedRounds(invData as RoundWithDetails[])
        }
      }

      hasFetched.current = true
      setLoading(false)
    }

    // Only show skeleton on initial fetch, not on auth state re-renders
    if (!hasFetched.current) {
      setLoading(true)
    }
    fetchRounds()
  }, [user])

  // Real-time subscription for invited rounds
  useEffect(() => {
    if (!user || invitedRounds.length === 0) return

    const roundIds = invitedRounds.map(r => r.id)
    const channels = roundIds.map(roundId =>
      supabase
        .channel(`home-invited-${roundId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rsvps', filter: `round_id=eq.${roundId}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setInvitedRounds(prev => prev.map(r =>
                r.id === roundId ? { ...r, rsvps: [...r.rsvps, payload.new as Rsvp] } : r
              ))
            } else if (payload.eventType === 'UPDATE') {
              setInvitedRounds(prev => prev.map(r =>
                r.id === roundId ? {
                  ...r,
                  rsvps: r.rsvps.map(rsvp => rsvp.id === (payload.new as Rsvp).id ? payload.new as Rsvp : rsvp),
                } : r
              ))
            }
          }
        )
        .subscribe()
    )

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch))
    }
  }, [user, invitedRounds.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInvitedRsvpChange = async (rsvpId: string, status: 'in' | 'maybe' | 'out') => {
    // Optimistic update
    setInvitedRounds(prev => prev.map(r => ({
      ...r,
      rsvps: r.rsvps.map(rsvp => rsvp.id === rsvpId ? { ...rsvp, status } : rsvp),
    })))

    await supabase.from('rsvps').update({ status }).eq('id', rsvpId)
  }

  const activeRounds = rounds.filter(r => r.status !== 'cancelled')
  const nextRound = activeRounds.find(r => r.status === 'booked' || r.status === 'found') ?? activeRounds[0]
  const inProgressRounds = activeRounds.filter(r => r !== nextRound)
  const hasContent = rounds.length > 0 || invitedRounds.length > 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Greeting */}
      <h1 className="font-display text-3xl tracking-tight pt-4">
        {getGreeting()}, {firstName}
      </h1>

      {/* Start a Round */}
      <button
        onClick={() => navigate('/start')}
        className="w-full h-14 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors text-base font-body flex items-center justify-center gap-2 tap-target"
      >
        + Start a Round
      </button>

      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="skeleton" style={{ height: 20, width: 140 }} />
          <div className="skeleton w-full" style={{ height: 180 }} />
          <div className="skeleton w-full" style={{ height: 120 }} />
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center text-center py-16">
          <div className="w-16 h-16 rounded-full bg-card border border-border flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="text-sm font-body text-muted-foreground">Something went wrong loading your rounds.</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm font-body text-primary font-medium mt-2 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : !hasContent ? (
        <div className="flex flex-col items-center text-center py-16">
          <div className="w-16 h-16 rounded-full bg-card border border-border flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <p className="text-sm font-body text-muted-foreground">No rounds yet. Start one!</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* YOUR NEXT ROUND */}
          {nextRound && (
            <section className="space-y-2.5">
              <h2 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
                Your Next Round
              </h2>
              <NextRoundCard round={nextRound} onClick={() => navigate(`/round/${nextRound.id}`)} />
            </section>
          )}

          {/* IN PROGRESS */}
          {inProgressRounds.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
                In Progress
              </h2>
              <div className="flex flex-col gap-3">
                {inProgressRounds.map(round => (
                  <InProgressCard
                    key={round.id}
                    round={round}
                    onClick={() => navigate(`/round/${round.id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* INVITED */}
          {invitedRounds.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
                Invited
              </h2>
              <div className="flex flex-col gap-3">
                {invitedRounds.map(round => (
                  <InvitedRoundCard
                    key={round.id}
                    round={round}
                    userId={user!.id}
                    onClick={() => navigate(`/round/${round.id}`)}
                    onRsvpChange={handleInvitedRsvpChange}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
