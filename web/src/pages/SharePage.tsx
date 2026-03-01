import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDateLong, formatTime, formatDateShort, getInitials, getTimeWindowLabel } from '../lib/helpers'
import Avatar from '../components/Avatar'
import type { RoundWithDetails, Rsvp } from '../lib/types'

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
        .eq('share_code', shareCode!)
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
      <div className="min-h-screen bg-background px-5 max-w-lg mx-auto pt-8">
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-5 max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-full bg-card border border-border flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <p className="font-display text-xl font-bold text-foreground mb-2">Round not found</p>
        <p className="text-sm font-body text-muted-foreground">This round doesn't exist or has been removed.</p>
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
    <div className="min-h-screen bg-background px-5 max-w-lg mx-auto pt-8 pb-10 animate-fade-in">

      {/* Branding */}
      <p className="font-display text-sm text-muted-foreground mb-8">The Starter</p>

      {/* Hero Header */}
      <p className="text-xl font-body font-semibold text-muted-foreground mb-1">
        {creatorName} wants to play
      </p>
      <h1 className="font-display text-primary text-[34px] leading-tight mb-1">
        {formatDateLong(round.round_date)}
      </h1>
      <p className="text-sm font-body text-muted-foreground mb-8">
        {timeLabel}
      </p>

      {/* Details Card */}
      {round.has_specific_time && round.specific_tee_time ? (
        <div className="bg-primary/5 border border-primary/25 rounded-2xl p-5 space-y-3 mb-4">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
            <span className="text-sm font-body font-semibold text-primary">
              {round.status === 'booked' ? 'Booked \u2713' : 'Tee Time'}
            </span>
          </div>
          <div>
            <p className="font-display text-lg leading-tight">
              {formatDateShort(round.round_date)} &middot; {formatTime(round.specific_tee_time)}
            </p>
            <p className="text-sm font-body text-muted-foreground mt-1">
              {round.round_courses?.find(rc => rc.course_id === round.specific_course_id)?.courses?.name ?? 'TBD'}
            </p>
          </div>
          {round.status === 'open' && (
            <p className="text-xs font-body text-muted-foreground italic">
              {creatorName} is booking this time
            </p>
          )}
        </div>
      ) : courseNames.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-2 mb-4">
          <h3 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
            Courses
          </h3>
          <div className="flex flex-col gap-1">
            {courseNames.map((name, i) => (
              <p key={i} className="font-display text-[15px] font-medium text-foreground">{name}</p>
            ))}
          </div>
        </div>
      )}

      {/* WHO'S IN */}
      <section className="space-y-3 mt-3 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
            Who's In
          </h2>
          <span className="text-xs font-body text-muted-foreground">
            {rsvpsIn.length} of {round.spots_needed} confirmed
          </span>
        </div>

        <div className="space-y-1">
          {rsvps.map((rsvp) => {
            const isIn = rsvp.status === 'in'
            const isMaybe = rsvp.status === 'maybe'
            const isOut = rsvp.status === 'out'
            return (
              <div
                key={rsvp.id}
                className={`flex items-center gap-3 py-3 px-3 rounded-lg transition-all duration-200 ${
                  isOut ? 'opacity-40' : 'opacity-100'
                } ${isIn ? 'bg-primary/5' : ''}`}
              >
                <Avatar name={rsvp.name} confirmed={isIn} size={40} />
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-body font-medium truncate ${isIn ? 'text-foreground' : 'text-foreground/70'}`}>
                    {rsvp.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-body font-medium shrink-0">
                  {isIn && (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span className="text-primary">In</span>
                    </>
                  )}
                  {isMaybe && (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span className="text-muted-foreground">Pending</span>
                    </>
                  )}
                  {isOut && (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      <span className="text-destructive">Out</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* RSVP / Status */}
      {isCancelled ? (
        <div className="bg-destructive/8 border border-destructive/20 rounded-2xl p-6 text-center">
          <p className="text-destructive font-body font-semibold">This round has been cancelled</p>
        </div>
      ) : rsvpDone ? (
        <div className="bg-primary/8 border border-primary/20 rounded-2xl p-6 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-primary/15 border-2 border-primary flex items-center justify-center mx-auto">
            <span className="text-primary font-body font-bold">{getInitials(name)}</span>
          </div>
          <p className="font-display text-lg text-foreground">
            {rsvpStatus === 'in' ? "You're in!" : rsvpStatus === 'maybe' ? 'Marked as maybe' : "Got it"}
          </p>
          <p className="text-sm font-body text-muted-foreground">
            {rsvpStatus === 'in'
              ? `${creatorName} will share the tee time once it's booked.`
              : `${creatorName} will see your response.`}
          </p>
        </div>
      ) : isFull ? (
        <div className="bg-card border border-border rounded-2xl p-6 text-center">
          <p className="text-muted-foreground font-body font-semibold">This round is full</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <p className="font-display text-lg">Join this round</p>

          <div className="space-y-2">
            <h3 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
              Your Name
            </h3>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full h-12 px-4 bg-background border border-border rounded-xl text-foreground font-body placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          {error && <p className="text-sm font-body text-destructive">{error}</p>}

          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => handleRsvp('in')}
              disabled={submitting || !name.trim()}
              className="w-full h-14 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-base font-body"
            >
              {submitting && rsvpStatus === 'in' ? 'Submitting\u2026' : "I'm In"}
            </button>
            <div className="flex gap-2.5">
              <button
                onClick={() => handleRsvp('maybe')}
                disabled={submitting || !name.trim()}
                className="flex-1 h-12 border border-border text-muted-foreground font-body font-semibold rounded-xl hover:bg-muted/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Maybe
              </button>
              <button
                onClick={() => handleRsvp('out')}
                disabled={submitting || !name.trim()}
                className="flex-1 h-12 text-muted-foreground font-body font-semibold rounded-xl hover:bg-muted/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Can't Make It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="text-center text-xs font-body text-muted-foreground mt-10">
        Powered by <span className="font-display">The Starter</span>
      </p>
    </div>
  )
}
