import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatDateShort, formatTime } from '../lib/helpers'
import { SmallAvatarRow, AvatarWithLabel } from '../components/Avatar'
import type { RoundWithDetails } from '../lib/types'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  return 'Evening'
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { text: string; className: string; pulse?: boolean }> = {
    open: {
      text: 'Gathering',
      className: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    },
    watching: {
      text: 'Watching',
      className: 'bg-primary/15 text-primary border-primary/30',
      pulse: true,
    },
    found: {
      text: 'Time Found',
      className: 'bg-primary/20 text-primary border-primary/40 font-semibold',
    },
    booked: {
      text: 'Booked',
      className: 'bg-primary text-primary-foreground border-primary',
    },
    cancelled: {
      text: 'Cancelled',
      className: 'bg-muted text-muted-foreground border-border',
    },
  }
  const c = config[status] ?? config.watching
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body font-medium border ${c.className}`}>
      {c.pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-50" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
      )}
      {c.text}
    </span>
  )
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

export default function Home() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rounds, setRounds] = useState<RoundWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const hasFetched = useRef(false)

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? 'Golfer'

  useEffect(() => {
    async function fetchRounds() {
      if (!user) return

      const { data, error } = await supabase
        .from('rounds')
        .select(`
          *,
          round_courses(*, courses(*)),
          rsvps(*)
        `)
        .eq('creator_id', user.id)
        .order('round_date', { ascending: true })

      if (!error && data) {
        setRounds(data as RoundWithDetails[])
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

  const activeRounds = rounds.filter(r => r.status !== 'cancelled')
  const nextRound = activeRounds.find(r => r.status === 'booked' || r.status === 'found') ?? activeRounds[0]
  const inProgressRounds = activeRounds.filter(r => r !== nextRound)

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
      ) : rounds.length === 0 ? (
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
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
                  In Progress
                </h2>
                <button className="text-[11px] font-body font-medium text-primary uppercase tracking-wide">
                  See All
                </button>
              </div>
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
        </div>
      )}
    </div>
  )
}
