import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getDraft, resetDraft } from '../lib/roundStore'
import { generateShareCode, formatTime, formatDateShort, getTimeWindowLabel } from '../lib/helpers'
import type { TeeTime, Round } from '../lib/types'

export default function StartRoundWho() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const draft = getDraft()

  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([])
  const [loadingTimes, setLoadingTimes] = useState(true)
  const [selectedTimeId, setSelectedTimeId] = useState<string | null>(null)
  const spots = draft.spots
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchTeeTimes() {
      const { data, error } = await supabase
        .from('tee_times')
        .select('*, courses(*)')
        .in('course_id', draft.courseIds)
        .eq('tee_date', draft.date)
        .gte('tee_time', draft.timeStart)
        .lte('tee_time', draft.timeEnd)
        .eq('is_available', true)
        .order('tee_time', { ascending: true })

      if (!error && data) {
        setTeeTimes(data as TeeTime[])
      }
      setLoadingTimes(false)
    }

    fetchTeeTimes()
  }, [draft.courseIds, draft.date, draft.timeStart, draft.timeEnd])

  const selectedTime = teeTimes.find(t => t.id === selectedTimeId)
  const hasAvailability = teeTimes.length > 0

  // Group tee times by course
  const grouped = teeTimes.reduce<Record<string, TeeTime[]>>((acc, tt) => {
    const name = tt.courses?.name ?? 'Unknown'
    if (!acc[name]) acc[name] = []
    acc[name].push(tt)
    return acc
  }, {})
  const courseGroups = Object.entries(grouped)
  const multiCourse = courseGroups.length > 1

  const timeLabel = getTimeWindowLabel(draft.timeStart, draft.timeEnd)

  // Build confirm summary
  const confirmParts: string[] = [
    formatDateShort(draft.date),
    hasAvailability && selectedTime
      ? formatTime(selectedTime.tee_time)
      : timeLabel,
  ]
  if (hasAvailability && selectedTime) {
    confirmParts.push(selectedTime.courses?.name ?? '')
  } else {
    confirmParts.push(draft.courseIds.length > 3 ? 'Multiple courses' : `${draft.courseIds.length} course${draft.courseIds.length !== 1 ? 's' : ''}`)
  }
  confirmParts.push(`${spots} player${spots !== 1 ? 's' : ''}`)
  const confirmText = confirmParts.filter(Boolean).join(' · ')

  const handleSubmit = async (forceWatch = false) => {
    if (!user) return
    setSubmitting(true)
    setError('')

    const shareCode = generateShareCode()
    const creatorName = user.user_metadata?.full_name ?? 'Unknown'
    const hasSpecific = !forceWatch && hasAvailability && !!selectedTime

    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .insert({
        creator_id: user.id,
        round_date: draft.date,
        time_window_start: draft.timeStart,
        time_window_end: draft.timeEnd,
        spots_needed: spots,
        has_specific_time: hasSpecific,
        specific_tee_time: hasSpecific ? selectedTime.tee_time : null,
        specific_course_id: hasSpecific ? selectedTime.course_id : null,
        share_code: shareCode,
        status: forceWatch ? 'watching' : 'open',
      })
      .select('*')
      .single() as unknown as { data: Round | null; error: { message: string } | null }

    if (roundError || !round) {
      setError(roundError?.message ?? 'Failed to create round')
      setSubmitting(false)
      return
    }

    const courseInserts = draft.courseIds.map(courseId => ({
      round_id: round.id,
      course_id: courseId,
    }))

    const { error: coursesError } = await supabase
      .from('round_courses')
      .insert(courseInserts)

    if (coursesError) {
      setError(coursesError.message)
      setSubmitting(false)
      return
    }

    const { error: rsvpError } = await supabase
      .from('rsvps')
      .insert({
        round_id: round.id,
        user_id: user.id,
        name: creatorName,
        status: 'in',
      })

    if (rsvpError) {
      setError(rsvpError.message)
      setSubmitting(false)
      return
    }

    // Insert invited user RSVPs
    if (draft.invitedUsers.length > 0) {
      const inviteInserts = draft.invitedUsers.map(u => ({
        round_id: round.id,
        user_id: u.id,
        name: u.full_name,
        email: u.email?.toLowerCase() ?? null,
        status: 'invited',
      }))
      await supabase.from('rsvps').insert(inviteInserts)

      // Send invite notifications (fire-and-forget)
      fetch('/api/notify-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: round.id,
          invitedUserIds: draft.invitedUsers.map(u => u.id),
        }),
      }).catch(() => {})
    }

    resetDraft()
    navigate(`/round/${round.id}`)
  }

  // Loading state
  if (loadingTimes) {
    return (
      <div className="animate-fade-in space-y-6 px-5 max-w-lg mx-auto pt-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/start')}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-muted/60 hover:bg-muted transition-colors shrink-0 active:scale-95"
            aria-label="Go back"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <h1 className="text-3xl font-display tracking-tight">Available Times</h1>
        </div>
        <p className="text-sm font-body text-muted-foreground">Looking for open tee times...</p>
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton w-full" style={{ height: 64 }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6 px-5 max-w-lg mx-auto pt-4 pb-10">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/start')}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-muted/60 hover:bg-muted transition-colors shrink-0 active:scale-95"
          aria-label="Go back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h1 className="text-3xl font-display tracking-tight">Available Times</h1>
      </div>

      {hasAvailability ? (
        <>
          <p className="text-sm font-body text-muted-foreground">Pick a time and invite your crew</p>

          {courseGroups.map(([courseName, times]) => (
            <section key={courseName} className="space-y-2">
              {multiCourse && (
                <h2 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
                  {courseName}
                </h2>
              )}
              <div className="flex flex-col gap-2">
                {times.map(tt => {
                  const isSelected = selectedTimeId === tt.id
                  return (
                    <button
                      key={tt.id}
                      onClick={() => setSelectedTimeId(isSelected ? null : tt.id)}
                      className={`w-full text-left flex items-center justify-between p-4 rounded-xl border transition-all duration-150 active:scale-[0.98] ${
                        isSelected
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border bg-card hover:border-primary/30'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-display text-[17px] text-foreground">{formatTime(tt.tee_time)}</span>
                        {!multiCourse && (
                          <span className="text-sm font-body text-muted-foreground">{tt.courses?.name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {tt.price_label && (
                          <span className="text-sm font-body text-muted-foreground">{tt.price_label}</span>
                        )}
                        {isSelected && (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </>
      ) : (
        <>
          <p className="text-sm font-body text-muted-foreground">
            No times available right now. We'll watch these courses and notify you when something opens up.
          </p>

          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex justify-between text-sm font-body">
              <span className="text-muted-foreground">Date</span>
              <span className="text-foreground font-medium">{formatDateShort(draft.date)}</span>
            </div>
            <div className="flex justify-between text-sm font-body">
              <span className="text-muted-foreground">Window</span>
              <span className="text-foreground font-medium">{timeLabel}</span>
            </div>
            <div className="flex justify-between text-sm font-body">
              <span className="text-muted-foreground">Courses</span>
              <span className="text-foreground font-medium text-right">{draft.courseIds.length} selected</span>
            </div>
          </div>
        </>
      )}

      {/* ── Confirm summary ── */}
      <section className="space-y-3">
        <h3 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
          Confirm
        </h3>

        <div className="flex items-center gap-3.5 bg-card border border-primary/30 rounded-2xl p-4">
          <div className="w-10 h-10 rounded-full bg-primary/12 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
          </div>
          <span className="text-sm font-body font-medium text-foreground">{confirmText}</span>
        </div>
      </section>

      {error && (
        <p className="text-sm font-body text-destructive text-center">{error}</p>
      )}

      {/* ── Action Button ── */}
      <button
        onClick={() => handleSubmit(false)}
        disabled={submitting || (hasAvailability && !selectedTimeId)}
        className="w-full h-14 flex items-center justify-center gap-2 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-base font-body"
      >
        {submitting ? (
          'Creating\u2026'
        ) : hasAvailability ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Book This Time
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
            Start Watching
          </>
        )}
      </button>

      {hasAvailability && (
        <button
          onClick={() => handleSubmit(true)}
          disabled={submitting}
          className="w-full h-11 flex items-center justify-center gap-2 border border-primary/30 text-primary font-body font-semibold rounded-xl hover:bg-primary/5 transition-colors text-sm disabled:opacity-30"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
          Skip These &middot; Start Watching
        </button>
      )}

      <p className="text-xs font-body text-muted-foreground text-center">
        {hasAvailability
          ? "Pick a time, or start watching to get notified of new openings."
          : "We'll notify you when a matching tee time opens up."}
      </p>
    </div>
  )
}
