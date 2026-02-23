import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDateShort, formatTime, getTimeWindowLabel } from '../lib/helpers'
import Avatar from '../components/Avatar'
import type { RoundWithDetails, Rsvp, TeeTime } from '../lib/types'

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { text: string; bg: string; color: string; border?: string }> = {
    open: { text: 'Gathering', bg: '#F59E0B', color: '#000' },
    watching: { text: 'Watching', bg: 'transparent', color: '#22C55E', border: '1px solid #22C55E' },
    found: { text: 'Time Found', bg: '#22C55E', color: '#fff' },
    booked: { text: 'Booked', bg: '#22C55E', color: '#fff' },
    cancelled: { text: 'Cancelled', bg: '#2E2E2E', color: '#9CA3AF' },
  }
  const c = config[status] ?? config.watching
  return (
    <span
      className="inline-block font-semibold rounded-full"
      style={{
        fontSize: 12,
        padding: '5px 14px',
        lineHeight: '1',
        backgroundColor: c.bg,
        color: c.color,
        border: c.border ?? 'none',
      }}
    >
      {c.text}
    </span>
  )
}

function FlagIcon({ size = 16, color = '#22C55E' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
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
        .eq('id', id)
        .single()

      if (!error && data) {
        setRound(data as RoundWithDetails)

        // Fetch matched tee time if available
        if (data.matched_tee_time_id) {
          const { data: ttData, error: ttError } = await supabase
            .from('tee_times')
            .select('*, courses(*)')
            .eq('id', data.matched_tee_time_id)
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
      <div className="px-6 w-full max-w-[480px] mx-auto" style={{ paddingTop: 32 }}>
        <div className="skeleton" style={{ height: 28, width: 220, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 24, width: 100, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 24, width: 280, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 16, width: 180, marginBottom: 24 }} />
        <div className="skeleton w-full" style={{ height: 200, marginBottom: 24 }} />
        <div className="skeleton w-full" style={{ height: 160 }} />
      </div>
    )
  }

  if (!round) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 w-full max-w-[480px] mx-auto">
        <p className="text-text-secondary" style={{ marginBottom: 16, fontSize: 15 }}>Round not found</p>
        <button onClick={() => navigate('/home')} className="text-green-primary font-semibold" style={{ fontSize: 15 }}>Go Home</button>
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
    <div className="px-6 w-full max-w-[480px] mx-auto" style={{ paddingBottom: 40 }}>

      {/* ── Header: ← Round Details ── */}
      <div className="flex items-center" style={{ gap: 12, paddingTop: 32, paddingBottom: 28 }}>
        <button onClick={() => navigate('/home')} className="flex items-center shrink-0">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h1 className="font-display font-bold text-white" style={{ fontSize: 24 }}>Round Details</h1>
      </div>

      {/* ── Status Badge ── */}
      <div style={{ marginBottom: 20 }}>
        <StatusBadge status={round.status} />
      </div>

      {/* ── Course Names ── */}
      <p className="text-white font-display font-bold" style={{ fontSize: 20, marginBottom: 4 }}>
        {matchedTeeTime?.courses?.name ?? (courseNames.length > 0 ? courseNames.join(' or ') : 'No courses selected')}
      </p>

      {/* ── Date · Time (matched time or search window) ── */}
      <p className="text-text-secondary" style={{ fontSize: 14, marginBottom: 24 }}>
        {matchedTeeTime
          ? `${formatDateShort(matchedTeeTime.tee_date)} \u00b7 ${formatTime(matchedTeeTime.tee_time)}`
          : `${formatDateShort(round.round_date)} \u00b7 ${timeLabel}`}
      </p>

      {/* ── Match Found Card (auto-matched tee time) ── */}
      {round.status === 'found' && matchedTeeTime && !round.has_specific_time && (
        <div
          style={{
            backgroundColor: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 16,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div className="flex items-center" style={{ gap: 8, marginBottom: 16 }}>
            <FlagIcon size={16} />
            <span className="text-green-primary font-semibold" style={{ fontSize: 14 }}>
              Match Found!
            </span>
          </div>

          <p className="text-white font-bold" style={{ fontSize: 17, marginBottom: 4 }}>
            {formatTime(matchedTeeTime.tee_time)} at {matchedTeeTime.courses?.name ?? 'Unknown Course'}
          </p>
          <p className="text-text-secondary" style={{ fontSize: 14, marginBottom: 20 }}>
            {formatDateShort(matchedTeeTime.tee_date)}
            {matchedTeeTime.price_label ? ` \u00b7 ${matchedTeeTime.price_label}` : ''}
          </p>

          {!bookingClicked ? (
            <>
              <button
                onClick={() => matchedTeeTime.courses?.booking_url && handleBook(matchedTeeTime.courses.booking_url)}
                disabled={!matchedTeeTime.courses?.booking_url}
                className="w-full flex items-center justify-center bg-green-primary hover:bg-green-hover text-white font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ gap: 8, height: 52, borderRadius: 14, fontSize: 16, marginBottom: 8 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Book This Time
              </button>
              <p className="text-text-secondary text-center" style={{ fontSize: 13 }}>
                You'll complete the booking on {matchedTeeTime.courses?.name ?? 'the course'}'s site
              </p>
            </>
          ) : (
            <>
              <button
                onClick={handleConfirmBooking}
                disabled={confirming}
                className="w-full flex items-center justify-center bg-green-primary hover:bg-green-hover text-white font-bold transition-colors disabled:opacity-50"
                style={{ gap: 8, height: 52, borderRadius: 14, fontSize: 16, marginBottom: 8 }}
              >
                {confirming ? 'Confirming...' : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Confirm Booking
                  </>
                )}
              </button>
              <p className="text-text-secondary text-center" style={{ fontSize: 13 }}>
                Done booking? Confirm to let your crew know.
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Tee Time Card (specific time selected or found) ── */}
      {round.has_specific_time && round.specific_tee_time && round.status !== 'cancelled' && (
        <div
          style={{
            backgroundColor: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 16,
            padding: 20,
            marginBottom: 24,
          }}
        >
          {/* Flag + Status label */}
          <div className="flex items-center" style={{ gap: 8, marginBottom: 16 }}>
            <FlagIcon size={16} />
            <span className="text-green-primary font-semibold" style={{ fontSize: 14 }}>
              {round.status === 'booked' ? 'Booked' : round.status === 'found' ? 'Time Found' : 'Tee Time'}
            </span>
          </div>

          {/* Date · Time */}
          <p className="text-white font-bold" style={{ fontSize: 17, marginBottom: 4 }}>
            {formatDateShort(round.round_date)} &middot; {formatTime(round.specific_tee_time)}
          </p>

          {/* Course name */}
          <p className="text-text-secondary" style={{ fontSize: 14, marginBottom: round.status === 'booked' ? 0 : 20 }}>
            {specificCourse?.name ?? 'TBD'}
          </p>

          {/* Booking actions (not shown if already booked) */}
          {round.status !== 'booked' && (
            <>
              {!bookingClicked ? (
                <>
                  <button
                    onClick={() => bookingUrl && handleBook(bookingUrl)}
                    disabled={!bookingUrl}
                    className="w-full flex items-center justify-center bg-green-primary hover:bg-green-hover text-white font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ gap: 8, height: 52, borderRadius: 14, fontSize: 16, marginBottom: 8 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    Book This Time
                  </button>
                  <p className="text-text-secondary text-center" style={{ fontSize: 13 }}>
                    You'll complete the booking on {specificCourse?.name ?? 'the course'}'s site
                  </p>
                </>
              ) : (
                <>
                  <button
                    onClick={handleConfirmBooking}
                    disabled={confirming}
                    className="w-full flex items-center justify-center bg-green-primary hover:bg-green-hover text-white font-bold transition-colors disabled:opacity-50"
                    style={{ gap: 8, height: 52, borderRadius: 14, fontSize: 16, marginBottom: 8 }}
                  >
                    {confirming ? 'Confirming...' : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Confirm Booking
                      </>
                    )}
                  </button>
                  <p className="text-text-secondary text-center" style={{ fontSize: 13 }}>
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
        <div
          style={{
            backgroundColor: '#1A1A1A',
            border: '1px solid #2E2E2E',
            borderRadius: 16,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div className="flex items-center" style={{ gap: 8, marginBottom: 12 }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-primary" />
            </span>
            <span className="text-green-primary font-semibold" style={{ fontSize: 14 }}>
              Watching for times...
            </span>
          </div>
          <p className="text-text-secondary" style={{ fontSize: 14 }}>
            {formatTime(round.time_window_start)} – {formatTime(round.time_window_end)} &middot;{' '}
            {courseNames.join(', ')}
          </p>
        </div>
      )}

      {/* ── Share Link ── */}
      <div
        style={{
          backgroundColor: '#1A1A1A',
          border: '1px solid #2E2E2E',
          borderRadius: 16,
          padding: 20,
          marginBottom: 28,
        }}
      >
        <span className="section-label block" style={{ marginBottom: 8 }}>Share Link</span>
        <div className="flex items-center" style={{ gap: 8 }}>
          <code
            className="flex-1 text-text-secondary truncate"
            style={{ fontSize: 13, backgroundColor: '#111111', borderRadius: 12, padding: '10px 12px' }}
          >
            {shareUrl}
          </code>
          <button
            onClick={handleCopy}
            className="shrink-0 bg-green-primary hover:bg-green-hover text-white font-semibold transition-colors"
            style={{ fontSize: 14, padding: '10px 16px', borderRadius: 12 }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* ── WHO'S IN ── */}
      <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
        <span className="section-label">Who's In</span>
        <span className="text-text-secondary" style={{ fontSize: 13 }}>
          {rsvpsIn.length} of {round.spots_needed} confirmed
        </span>
      </div>

      <div className="flex flex-col" style={{ gap: 0, marginBottom: 32 }}>
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
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span className="text-white font-semibold" style={{ fontSize: 15 }}>{rsvp.name}</span>
                  {i === 0 && (
                    <span className="font-bold" style={{ fontSize: 10, color: '#22C55E', letterSpacing: 0.5 }}>ANCHOR</span>
                  )}
                </div>
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

      {/* ── Cancel ── */}
      {round.status !== 'cancelled' && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="w-full text-center text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
          style={{ fontSize: 14, padding: '8px 0' }}
        >
          {cancelling ? 'Cancelling...' : 'Cancel Round'}
        </button>
      )}
    </div>
  )
}
