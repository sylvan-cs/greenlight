import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDateShort, formatTime, getTimeWindowLabel } from '../lib/helpers'
import Avatar from '../components/Avatar'
import type { RoundWithDetails, Rsvp, TeeTime } from '../lib/types'

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

export default function RoundDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [round, setRound] = useState<RoundWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [bookingClicked, setBookingClicked] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [matchedTeeTime, setMatchedTeeTime] = useState<TeeTime | null>(null)

  useEffect(() => {
    if (!id) return

    async function fetchRound() {
      const { data, error } = await supabase
        .from('rounds')
        .select(`
          *,
          round_courses(*, courses(*)),
          rsvps(*)
        `)
        .eq('id', id!)
        .single()

      if (!error && data) {
        const roundData = data as unknown as RoundWithDetails
        setRound(roundData)

        if (roundData.matched_tee_time_id) {
          const { data: ttData, error: ttError } = await supabase
            .from('tee_times')
            .select('*, courses(*)')
            .eq('id', roundData.matched_tee_time_id)
            .single()
          if (ttError) console.error('Failed to fetch matched tee time:', ttError)
          if (ttData) setMatchedTeeTime(ttData as TeeTime)
        }
      }
      setLoading(false)
    }

    fetchRound()

    const channel = supabase
      .channel(`round-detail-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rsvps', filter: `round_id=eq.${id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setRound(prev => {
              if (!prev) return prev
              return { ...prev, rsvps: [...prev.rsvps, payload.new as Rsvp] }
            })
          } else if (payload.eventType === 'UPDATE') {
            setRound(prev => {
              if (!prev) return prev
              return {
                ...prev,
                rsvps: prev.rsvps.map(r => r.id === (payload.new as Rsvp).id ? payload.new as Rsvp : r),
              }
            })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `id=eq.${id}` },
        (payload) => {
          setRound(prev => prev ? { ...prev, ...payload.new } as RoundWithDetails : prev)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id])

  const handleCopy = async () => {
    if (!round) return
    const url = `${window.location.origin}/r/${round.share_code}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCancel = async () => {
    if (!round) return
    setCancelling(true)
    const { error } = await supabase
      .from('rounds')
      .update({ status: 'cancelled' })
      .eq('id', round.id)

    if (!error) {
      setRound(prev => prev ? { ...prev, status: 'cancelled' } : prev)
    }
    setCancelling(false)
  }

  const handleBook = (bookingUrl: string) => {
    window.open(bookingUrl, '_blank', 'noopener')
    setBookingClicked(true)
  }

  const handleConfirmBooking = async () => {
    if (!round) return
    setConfirming(true)
    const { error } = await supabase
      .from('rounds')
      .update({ status: 'booked' })
      .eq('id', round.id)

    if (!error) {
      setRound(prev => prev ? { ...prev, status: 'booked' } : prev)
    }
    setConfirming(false)
  }

  if (loading) {
    return (
      <div className="animate-fade-in space-y-6 pt-4 px-5 max-w-lg mx-auto">
        <div className="skeleton" style={{ height: 28, width: 220 }} />
        <div className="skeleton" style={{ height: 24, width: 100 }} />
        <div className="skeleton" style={{ height: 24, width: 280 }} />
        <div className="skeleton" style={{ height: 16, width: 180 }} />
        <div className="skeleton w-full" style={{ height: 200 }} />
        <div className="skeleton w-full" style={{ height: 160 }} />
      </div>
    )
  }

  if (!round) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground font-body">Round not found.</p>
          <button onClick={() => navigate('/home')} className="text-primary font-body font-medium">Go Home</button>
        </div>
      </div>
    )
  }

  const courseNames = round.round_courses?.map(rc => rc.courses?.name).filter(Boolean) ?? []
  const specificCourse = round.specific_course_id
    ? round.round_courses?.find(rc => rc.course_id === round.specific_course_id)?.courses
    : null
  const bookingUrl = specificCourse?.booking_url ?? null
  const rsvps = round.rsvps ?? []
  const rsvpsIn = rsvps.filter(r => r.status === 'in')
  const shareUrl = `${window.location.origin}/r/${round.share_code}`
  const timeLabel = getTimeWindowLabel(round.time_window_start, round.time_window_end)

  return (
    <div className="animate-fade-in space-y-6 pb-8 px-5 max-w-lg mx-auto">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 pt-4">
        <button
          onClick={() => navigate('/home')}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-muted/60 hover:bg-muted transition-colors shrink-0 active:scale-95"
          aria-label="Go back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h1 className="text-3xl font-display tracking-tight">Round Details</h1>
      </div>

      {/* ── Status + summary ── */}
      <section className="space-y-3">
        <StatusBadge status={round.status} />
        <div>
          <h2 className="font-display text-xl leading-tight">
            {matchedTeeTime?.courses?.name ?? (courseNames.length > 0 ? courseNames.join(' or ') : 'No courses selected')}
          </h2>
          <p className="text-sm font-body text-muted-foreground mt-1">
            {matchedTeeTime
              ? `${formatDateShort(matchedTeeTime.tee_date)} \u00b7 ${formatTime(matchedTeeTime.tee_time)}`
              : `${formatDateShort(round.round_date)} \u00b7 ${timeLabel}`}
          </p>
        </div>
      </section>

      {/* ── Match Found Card ── */}
      {round.status === 'found' && matchedTeeTime && !round.has_specific_time && (
        <div className="bg-primary/5 border border-primary/25 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
            <span className="text-sm font-body font-semibold text-primary">Match Found!</span>
          </div>

          <div>
            <p className="font-display text-lg leading-tight">
              {formatTime(matchedTeeTime.tee_time)} at {matchedTeeTime.courses?.name ?? 'Unknown Course'}
            </p>
            <p className="text-sm font-body text-muted-foreground mt-1">
              {formatDateShort(matchedTeeTime.tee_date)}
              {matchedTeeTime.price_label ? ` \u00b7 ${matchedTeeTime.price_label}` : ''}
            </p>
          </div>

          {!bookingClicked ? (
            <>
              <button
                onClick={() => matchedTeeTime.courses?.booking_url && handleBook(matchedTeeTime.courses.booking_url)}
                disabled={!matchedTeeTime.courses?.booking_url}
                className="w-full h-14 flex items-center justify-center gap-2 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-base font-body"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Book This Time
              </button>
              <p className="text-xs font-body text-muted-foreground text-center">
                You'll complete the booking on {matchedTeeTime.courses?.name ?? 'the course'}'s site
              </p>
            </>
          ) : (
            <>
              <button
                onClick={handleConfirmBooking}
                disabled={confirming}
                className="w-full h-14 flex items-center justify-center gap-2 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-50 text-base font-body"
              >
                {confirming ? 'Confirming\u2026' : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Confirm Booking
                  </>
                )}
              </button>
              <p className="text-xs font-body text-muted-foreground text-center">
                Done booking? Confirm to let your crew know.
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Tee Time Card (specific time) ── */}
      {round.has_specific_time && round.specific_tee_time && round.status !== 'cancelled' && (
        <div className="bg-primary/5 border border-primary/25 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
            <span className="text-sm font-body font-semibold text-primary">
              {round.status === 'booked' ? 'Booked' : round.status === 'found' ? 'Time Found' : 'Tee Time'}
            </span>
          </div>

          <div>
            <p className="font-display text-lg leading-tight">
              {formatDateShort(round.round_date)} &middot; {formatTime(round.specific_tee_time)}
            </p>
            <p className="text-sm font-body text-muted-foreground mt-1">
              {specificCourse?.name ?? 'TBD'}
            </p>
          </div>

          {round.status !== 'booked' && (
            <>
              {!bookingClicked ? (
                <>
                  <button
                    onClick={() => bookingUrl && handleBook(bookingUrl)}
                    disabled={!bookingUrl}
                    className="w-full h-14 flex items-center justify-center gap-2 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-base font-body"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    Book This Time
                  </button>
                  <p className="text-xs font-body text-muted-foreground text-center">
                    You'll complete the booking on {specificCourse?.name ?? 'the course'}'s site
                  </p>
                </>
              ) : (
                <>
                  <button
                    onClick={handleConfirmBooking}
                    disabled={confirming}
                    className="w-full h-14 flex items-center justify-center gap-2 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-50 text-base font-body"
                  >
                    {confirming ? 'Confirming\u2026' : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Confirm Booking
                      </>
                    )}
                  </button>
                  <p className="text-xs font-body text-muted-foreground text-center">
                    Done booking? Confirm to let your crew know.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Watching Card ── */}
      {!round.has_specific_time && round.status === 'watching' && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-sm font-body font-semibold text-primary">
              Watching for times...
            </span>
          </div>
          <p className="text-sm font-body text-muted-foreground">
            {formatTime(round.time_window_start)} – {formatTime(round.time_window_end)} &middot;{' '}
            {courseNames.join(', ')}
          </p>
        </div>
      )}

      {/* ── Share Link ── */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-2">
        <h3 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
          Share Link
        </h3>
        <p className="text-sm font-body text-muted-foreground">
          Send this link to invite people to your round
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-muted-foreground truncate text-[13px] font-body bg-background rounded-xl px-3 py-2.5">
            {shareUrl}
          </code>
          <button
            onClick={handleCopy}
            className="shrink-0 h-10 px-4 bg-primary hover:bg-green-hover text-primary-foreground font-semibold rounded-xl transition-colors text-sm font-body"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs font-body text-muted-foreground/70">
          Friends don't need an account to join
        </p>
      </div>

      {/* ── Who's In ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
            Who's In
          </h2>
          <span className="text-xs font-body text-muted-foreground">
            {rsvpsIn.length} of {round.spots_needed} confirmed
          </span>
        </div>

        <div className="space-y-1">
          {rsvps.map((rsvp, i) => {
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
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-body font-medium truncate ${isIn ? 'text-foreground' : 'text-foreground/70'}`}>
                      {rsvp.name}
                    </span>
                    {i === 0 && (
                      <span className="text-[10px] font-body text-primary uppercase tracking-wider font-semibold">
                        Organizer
                      </span>
                    )}
                  </div>
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

      {/* ── Cancel ── */}
      {round.status !== 'cancelled' && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="w-full text-center text-sm font-body text-muted-foreground/60 hover:text-destructive transition-colors py-2 disabled:opacity-50"
        >
          {cancelling ? 'Cancelling\u2026' : 'Cancel Round'}
        </button>
      )}
    </div>
  )
}
