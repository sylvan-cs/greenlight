import { useEffect, useState } from 'react'
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
  const config: Record<string, { text: string; className: string }> = {
    open: { text: 'Gathering', className: 'bg-badge-gathering text-black' },
    watching: { text: 'Watching', className: 'border border-green-primary text-green-primary bg-transparent' },
    found: { text: 'Time Found', className: 'bg-badge-alert text-white' },
    booked: { text: 'Booked', className: 'bg-green-primary text-white' },
    cancelled: { text: 'Cancelled', className: 'bg-dark-border text-text-secondary' },
  }
  const c = config[status] ?? config.watching
  return (
    <span
      className={`inline-block font-semibold rounded-full ${c.className}`}
      style={{ fontSize: 12, padding: '5px 14px', lineHeight: '1' }}
    >
      {c.text}
    </span>
  )
}

/** Featured "next round" card — large avatars with names, richer layout */
function NextRoundCard({ round, onClick }: { round: RoundWithDetails; onClick: () => void }) {
  const courseNames = round.round_courses?.map(rc => rc.courses?.name).filter(Boolean) ?? []
  const courseDisplay = courseNames.length > 0 ? courseNames[0] : formatDateShort(round.round_date)
  const rsvps = round.rsvps ?? []
  const rsvpsIn = rsvps.filter(r => r.status === 'in')

  return (
    <button
      onClick={onClick}
      className="w-full text-left transition"
      style={{
        backgroundColor: '#1A1A1A',
        border: '1px solid #2E2E2E',
        borderRadius: 16,
        padding: 20,
      }}
    >
      {/* Status badge + Course name */}
      <div className="flex items-center" style={{ gap: 10, marginBottom: 4 }}>
        <p className="text-white font-display" style={{ fontSize: 18, fontWeight: 700 }}>
          {courseDisplay}
        </p>
        {round.status === 'booked' && (
          <StatusBadge status="booked" />
        )}
      </div>

      {/* Date / time */}
      <p className="text-text-secondary" style={{ fontSize: 14, marginBottom: 20 }}>
        {formatDateShort(round.round_date)} &middot;{' '}
        {round.has_specific_time && round.specific_tee_time
          ? formatTime(round.specific_tee_time)
          : `${formatTime(round.time_window_start)} – ${formatTime(round.time_window_end)}`
        }
      </p>

      {/* Large avatars with names */}
      <div className="flex" style={{ gap: 8, marginBottom: 16 }}>
        {rsvpsIn.map((r, i) => (
          <AvatarWithLabel key={i} name={r.name} confirmed={true} />
        ))}
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center" style={{ gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-green-primary font-semibold" style={{ fontSize: 12, letterSpacing: 0.5 }}>
            {rsvpsIn.length === round.spots_needed
              ? `YOU'RE ALL SET \u00B7 ${rsvpsIn.length} PLAYING`
              : `${rsvpsIn.length} OF ${round.spots_needed} ARE IN`
            }
          </span>
        </div>
        {courseNames.length > 0 && round.round_courses?.[0]?.courses?.city && (
          <span className="text-text-secondary" style={{ fontSize: 12 }}>
            {round.round_courses[0].courses.city}
          </span>
        )}
      </div>
    </button>
  )
}

/** Compact "in progress" card — small avatars, one-line layout */
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
      className="w-full text-left relative transition"
      style={{
        backgroundColor: '#1A1A1A',
        border: '1px solid #2E2E2E',
        borderRadius: 16,
        padding: 20,
      }}
    >
      {/* Arrow */}
      <div className="absolute top-5 right-5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>

      {/* Status badge */}
      <div style={{ marginBottom: 12 }}>
        <StatusBadge status={round.status} />
      </div>

      {/* Course name */}
      {courseNames.length > 0 && (
        <p className="text-white font-display pr-8" style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>
          {courseNames.join(' or ')}
        </p>
      )}

      {/* Date · time */}
      <p className="text-text-secondary pr-8" style={{ fontSize: 14, marginBottom: 12 }}>
        {formatDateShort(round.round_date)} &middot; {timeDisplay}
      </p>

      {/* Small avatar row + RSVP count */}
      <div className="flex items-center justify-between">
        <SmallAvatarRow
          names={rsvps.map(r => ({ name: r.name, confirmed: r.status === 'in' }))}
          total={round.spots_needed}
        />
        <span className="text-text-secondary" style={{ fontSize: 13 }}>
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
      setLoading(false)
    }

    fetchRounds()
  }, [user])

  const activeRounds = rounds.filter(r => r.status !== 'cancelled')
  const nextRound = activeRounds.find(r => r.status === 'booked' || r.status === 'found') ?? activeRounds[0]
  const inProgressRounds = activeRounds.filter(r => r !== nextRound)

  return (
    <div>
      {/* Greeting */}
      <h1 className="font-display font-bold italic" style={{ fontSize: 30, paddingTop: 32, marginBottom: 20 }}>
        {getGreeting()}, {firstName}
      </h1>

      {/* Start a Round */}
      <button
        onClick={() => navigate('/start')}
        className="w-full bg-green-primary hover:bg-green-hover text-white transition-colors"
        style={{ height: 52, fontSize: 16, fontWeight: 600, borderRadius: 12, marginBottom: 32 }}
      >
        +&nbsp;&nbsp;Start a Round
      </button>

      {loading ? (
        <div className="flex flex-col" style={{ gap: 12 }}>
          <div className="skeleton" style={{ height: 20, width: 140, marginBottom: 4 }} />
          <div className="skeleton w-full" style={{ height: 180 }} />
          <div className="skeleton w-full" style={{ height: 120 }} />
        </div>
      ) : rounds.length === 0 ? (
        <div className="flex flex-col items-center text-center" style={{ paddingTop: 64, paddingBottom: 64 }}>
          <div
            className="rounded-full flex items-center justify-center"
            style={{ width: 64, height: 64, backgroundColor: '#1A1A1A', border: '1px solid #2E2E2E', marginBottom: 16 }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <p className="text-text-secondary" style={{ fontSize: 15 }}>No rounds yet. Start one!</p>
        </div>
      ) : (
        <>
          {/* YOUR NEXT ROUND */}
          {nextRound && (
            <div style={{ marginBottom: 32 }}>
              <span className="section-label block" style={{ marginBottom: 10 }}>Your Next Round</span>
              <NextRoundCard round={nextRound} onClick={() => navigate(`/round/${nextRound.id}`)} />
            </div>
          )}

          {/* IN PROGRESS */}
          {inProgressRounds.length > 0 && (
            <div>
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <span className="section-label">In Progress</span>
                <button className="text-green-primary font-semibold" style={{ fontSize: 12, letterSpacing: 0.5 }}>SEE ALL</button>
              </div>
              <div className="flex flex-col" style={{ gap: 12 }}>
                {inProgressRounds.map(round => (
                  <InProgressCard
                    key={round.id}
                    round={round}
                    onClick={() => navigate(`/round/${round.id}`)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
