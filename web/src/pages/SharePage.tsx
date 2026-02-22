import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDateLong, formatTime, formatDateShort, getInitials, getTimeWindowLabel } from '../lib/helpers'
import Avatar from '../components/Avatar'
import type { RoundWithDetails, Rsvp } from '../lib/types'

function FlagIcon({ size = 16, color = '#22C55E' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

export default function SharePage() {
  const { shareCode } = useParams<{ shareCode: string }>()
  const [round, setRound] = useState<RoundWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [rsvpDone, setRsvpDone] = useState(false)
  const [rsvpStatus, setRsvpStatus] = useState<'in' | 'maybe' | 'out'>('in')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!shareCode) return

    async function fetchRound() {
      const { data, error } = await supabase
        .from('rounds')
        .select(`
          *,
          round_courses(*, courses(*)),
          rsvps(*)
        `)
        .eq('share_code', shareCode)
        .single()

      if (error || !data) {
        setNotFound(true)
      } else {
        const roundData = data as RoundWithDetails
        const creatorRsvp = roundData.rsvps?.[0]
        if (creatorRsvp) {
          roundData.creator_name = creatorRsvp.name
        }
        setRound(roundData)
      }
      setLoading(false)
    }

    fetchRound()
  }, [shareCode])

  useEffect(() => {
    if (!round?.id) return

    const channel = supabase
      .channel(`share-${round.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rsvps', filter: `round_id=eq.${round.id}` },
        (payload) => {
          setRound(prev => {
            if (!prev) return prev
            return { ...prev, rsvps: [...prev.rsvps, payload.new as Rsvp] }
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `id=eq.${round.id}` },
        (payload) => {
          setRound(prev => prev ? { ...prev, ...payload.new } as RoundWithDetails : prev)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [round?.id])

  const handleRsvp = async (status: 'in' | 'maybe' | 'out', e?: FormEvent) => {
    e?.preventDefault()
    if (!round || !name.trim()) return
    setSubmitting(true)
    setError('')
    setRsvpStatus(status)

    const { error: rsvpError } = await supabase
      .from('rsvps')
      .insert({
        round_id: round.id,
        name: name.trim(),
        status,
      })

    if (rsvpError) {
      setError(rsvpError.message)
      setSubmitting(false)
      return
    }

    setRsvpDone(true)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg px-6 w-full max-w-[480px] mx-auto" style={{ paddingTop: 32 }}>
        <div className="skeleton" style={{ height: 16, width: 96, marginBottom: 32 }} />
        <div className="skeleton" style={{ height: 24, width: 224, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 36, width: 256, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 16, width: 160, marginBottom: 32 }} />
        <div className="skeleton w-full" style={{ height: 140, marginBottom: 16 }} />
        <div className="skeleton w-full" style={{ height: 200 }} />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-dark-bg px-6 w-full max-w-[480px] mx-auto">
        <div
          className="rounded-full flex items-center justify-center"
          style={{ width: 64, height: 64, backgroundColor: '#1A1A1A', border: '1px solid #2E2E2E', marginBottom: 16 }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <p className="text-white font-semibold" style={{ fontSize: 20, marginBottom: 8 }}>Round not found</p>
        <p className="text-text-secondary" style={{ fontSize: 15 }}>This round doesn't exist or has been removed.</p>
      </div>
    )
  }

  if (!round) return null

  const courseNames = round.round_courses?.map(rc => rc.courses?.name).filter(Boolean) ?? []
  const rsvps = round.rsvps ?? []
  const rsvpsIn = rsvps.filter(r => r.status === 'in')
  const creatorName = round.creator_name ?? rsvps[0]?.name ?? 'Someone'
  const isFull = rsvpsIn.length >= round.spots_needed
  const isCancelled = round.status === 'cancelled'
  const timeLabel = getTimeWindowLabel(round.time_window_start, round.time_window_end)

  return (
    <div className="min-h-screen bg-dark-bg px-6 w-full max-w-[480px] mx-auto" style={{ paddingTop: 32, paddingBottom: 40 }}>

      {/* Branding */}
      <p className="font-display text-text-secondary" style={{ fontSize: 14, marginBottom: 32 }}>The Starter</p>

      {/* Hero Header */}
      <p className="text-text-secondary font-semibold" style={{ fontSize: 20, marginBottom: 4 }}>
        {creatorName} wants to play
      </p>
      <h1 className="font-display text-green-primary font-bold leading-tight" style={{ fontSize: 34, marginBottom: 4 }}>
        {formatDateLong(round.round_date)}
      </h1>
      <p className="text-text-secondary" style={{ fontSize: 15, marginBottom: 32 }}>
        {timeLabel}
      </p>

      {/* Details Card */}
      {round.has_specific_time && round.specific_tee_time ? (
        <div
          style={{
            backgroundColor: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 16,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div className="flex items-center" style={{ gap: 8, marginBottom: 12 }}>
            <FlagIcon size={16} />
            <span className="text-green-primary font-semibold" style={{ fontSize: 14 }}>
              {round.status === 'booked' ? 'Booked \u2713' : 'Tee Time'}
            </span>
          </div>
          <p className="text-white font-bold" style={{ fontSize: 17, marginBottom: 4 }}>
            {formatDateShort(round.round_date)} &middot; {formatTime(round.specific_tee_time)}
          </p>
          <p className="text-text-secondary" style={{ fontSize: 14, marginBottom: round.status === 'open' ? 12 : 0 }}>
            {round.round_courses?.find(rc => rc.course_id === round.specific_course_id)?.courses?.name ?? 'TBD'}
          </p>
          {round.status === 'open' && (
            <p className="text-text-secondary" style={{ fontSize: 13, fontStyle: 'italic' }}>
              {creatorName} is booking this time
            </p>
          )}
        </div>
      ) : courseNames.length > 0 && (
        <div
          style={{
            backgroundColor: '#1A1A1A',
            border: '1px solid #2E2E2E',
            borderRadius: 16,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <span className="section-label block" style={{ marginBottom: 8 }}>Courses</span>
          <div className="flex flex-col" style={{ gap: 4 }}>
            {courseNames.map((name, i) => (
              <p key={i} className="text-white font-display" style={{ fontSize: 15, fontWeight: 500 }}>{name}</p>
            ))}
          </div>
        </div>
      )}

      {/* WHO'S IN */}
      <div className="flex items-center justify-between" style={{ marginBottom: 20, marginTop: 12 }}>
        <span className="section-label">Who's In</span>
        <span className="text-text-secondary" style={{ fontSize: 13 }}>
          {rsvpsIn.length} of {round.spots_needed} confirmed
        </span>
      </div>

      <div className="flex flex-col" style={{ marginBottom: 24 }}>
        {rsvps.map((rsvp, i) => {
          const isIn = rsvp.status === 'in'
          const isMaybe = rsvp.status === 'maybe'
          const isOut = rsvp.status === 'out'
          return (
            <div
              key={rsvp.id}
              className="flex items-center"
              style={{ gap: 14, padding: '14px 0', opacity: isOut ? 0.45 : 1, borderBottom: i < rsvps.length - 1 ? '1px solid #1A1A1A' : 'none' }}
            >
              <Avatar name={rsvp.name} confirmed={isIn} size={44} />
              <div className="flex-1" style={{ minWidth: 0 }}>
                <span className="text-white font-semibold" style={{ fontSize: 15 }}>{rsvp.name}</span>
              </div>
              <div className="flex items-center shrink-0" style={{ gap: 5 }}>
                {isIn && (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="font-medium" style={{ fontSize: 13, color: '#22C55E' }}>In</span>
                  </>
                )}
                {isMaybe && (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span className="font-medium" style={{ fontSize: 13, color: '#9CA3AF' }}>Pending</span>
                  </>
                )}
                {isOut && (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    <span className="font-medium" style={{ fontSize: 13, color: '#EF4444' }}>Out</span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* RSVP / Status */}
      {isCancelled ? (
        <div
          style={{
            backgroundColor: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 16,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <p className="text-red-400 font-semibold">This round has been cancelled</p>
        </div>
      ) : rsvpDone ? (
        <div
          style={{
            backgroundColor: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: 16,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div
            className="rounded-full flex items-center justify-center mx-auto"
            style={{
              width: 56,
              height: 56,
              backgroundColor: 'rgba(34,197,94,0.15)',
              border: '2px solid #22C55E',
              marginBottom: 12,
            }}
          >
            <span className="text-green-primary font-bold">{getInitials(name)}</span>
          </div>
          <p className="text-white font-bold" style={{ fontSize: 18, marginBottom: 4 }}>
            {rsvpStatus === 'in' ? "You're in!" : rsvpStatus === 'maybe' ? 'Marked as maybe' : "Got it"}
          </p>
          <p className="text-text-secondary" style={{ fontSize: 14 }}>
            {rsvpStatus === 'in'
              ? `${creatorName} will share the tee time once it's booked.`
              : `${creatorName} will see your response.`
            }
          </p>
        </div>
      ) : isFull ? (
        <div
          style={{
            backgroundColor: '#1A1A1A',
            border: '1px solid #2E2E2E',
            borderRadius: 16,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <p className="text-text-secondary font-semibold">This round is full</p>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#1A1A1A',
            border: '1px solid #2E2E2E',
            borderRadius: 16,
            padding: 20,
          }}
        >
          <p className="text-white font-display font-bold" style={{ fontSize: 18, marginBottom: 16 }}>Join this round</p>
          <div style={{ marginBottom: 16 }}>
            <span className="section-label block" style={{ marginBottom: 8 }}>Your Name</span>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full text-white focus:outline-none transition-colors"
              style={{
                padding: '14px 16px',
                backgroundColor: '#111111',
                border: '1px solid #2E2E2E',
                borderRadius: 12,
                fontSize: 15,
              }}
            />
          </div>

          {error && <p className="text-red-400" style={{ fontSize: 14, marginBottom: 12 }}>{error}</p>}

          <div className="flex flex-col" style={{ gap: 10 }}>
            <button
              onClick={() => handleRsvp('in')}
              disabled={submitting || !name.trim()}
              className="w-full bg-green-primary hover:bg-green-hover text-white font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ height: 52, borderRadius: 14, fontSize: 16 }}
            >
              {submitting && rsvpStatus === 'in' ? 'Submitting...' : "I'm In"}
            </button>
            <div className="flex" style={{ gap: 10 }}>
              <button
                onClick={() => handleRsvp('maybe')}
                disabled={submitting || !name.trim()}
                className="flex-1 text-text-secondary font-semibold hover:bg-dark-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ height: 48, border: '1px solid #2E2E2E', borderRadius: 14 }}
              >
                Maybe
              </button>
              <button
                onClick={() => handleRsvp('out')}
                disabled={submitting || !name.trim()}
                className="flex-1 text-text-secondary font-semibold hover:bg-dark-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ height: 48, borderRadius: 14 }}
              >
                Can't Make It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="text-center text-text-secondary" style={{ fontSize: 12, marginTop: 40 }}>
        Powered by <span className="font-display">The Starter</span>
      </p>
    </div>
  )
}
