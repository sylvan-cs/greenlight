import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getDraft, resetDraft } from '../lib/roundStore'
import { generateShareCode, formatTime, formatDateShort, getTimeWindowLabel } from '../lib/helpers'
import type { TeeTime } from '../lib/types'

function FlagIcon({ size = 16, color = '#22C55E' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

export default function StartRoundWho() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const draft = getDraft()

  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([])
  const [loadingTimes, setLoadingTimes] = useState(true)
  const [selectedTimeId, setSelectedTimeId] = useState<string | null>(null)
  const [spots, setSpots] = useState(draft.spots)
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

  const handleSubmit = async () => {
    if (!user) return
    setSubmitting(true)
    setError('')

    const shareCode = generateShareCode()
    const creatorName = user.user_metadata?.full_name ?? 'Unknown'
    const hasSpecific = hasAvailability && !!selectedTime

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
        status: 'open',
      })
      .select()
      .single()

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

    resetDraft()
    navigate(`/round/${round.id}`)
  }

  // Loading state
  if (loadingTimes) {
    return (
      <div className="px-6 w-full max-w-[480px] mx-auto" style={{ paddingTop: 32 }}>
        <div className="flex items-center" style={{ gap: 12, paddingBottom: 28 }}>
          <button onClick={() => navigate('/start')} className="flex items-center shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <h1 className="font-display font-bold text-white" style={{ fontSize: 24 }}>Available Times</h1>
        </div>
        <p className="text-text-secondary" style={{ fontSize: 14, marginBottom: 24 }}>Looking for open tee times...</p>
        <div className="flex flex-col" style={{ gap: 12 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton w-full" style={{ height: 64 }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 w-full max-w-[480px] mx-auto" style={{ paddingTop: 32, paddingBottom: 40 }}>

      {/* ── Header: ← Available Times ── */}
      <div className="flex items-center" style={{ gap: 12, paddingBottom: 28 }}>
        <button onClick={() => navigate('/start')} className="flex items-center shrink-0">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h1 className="font-display font-bold text-white" style={{ fontSize: 24 }}>Available Times</h1>
      </div>

      {hasAvailability ? (
        <>
          <p className="text-text-secondary" style={{ fontSize: 14, marginBottom: 20 }}>Pick a time and invite your crew</p>

          {courseGroups.map(([courseName, times]) => (
            <div key={courseName} style={{ marginBottom: 20 }}>
              {multiCourse && (
                <span className="section-label block" style={{ marginBottom: 10 }}>{courseName}</span>
              )}
              <div className="flex flex-col" style={{ gap: 8 }}>
                {times.map(tt => {
                  const isSelected = selectedTimeId === tt.id
                  return (
                    <button
                      key={tt.id}
                      onClick={() => setSelectedTimeId(isSelected ? null : tt.id)}
                      className="w-full text-left flex items-center justify-between transition-colors"
                      style={{
                        padding: '16px 20px',
                        borderRadius: 16,
                        border: isSelected ? '1px solid rgba(34,197,94,0.4)' : '1px solid #2E2E2E',
                        backgroundColor: isSelected ? 'rgba(34,197,94,0.06)' : '#1A1A1A',
                      }}
                    >
                      <div className="flex items-center" style={{ gap: 16 }}>
                        <span className="text-white font-bold" style={{ fontSize: 17 }}>{formatTime(tt.tee_time)}</span>
                        {!multiCourse && (
                          <span className="text-text-secondary" style={{ fontSize: 14 }}>{tt.courses?.name}</span>
                        )}
                      </div>
                      <div className="flex items-center" style={{ gap: 12 }}>
                        {tt.price_label && (
                          <span className="text-text-secondary" style={{ fontSize: 14 }}>{tt.price_label}</span>
                        )}
                        {isSelected && (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          <p className="text-text-secondary" style={{ fontSize: 14, marginBottom: 20 }}>
            No times available right now. We'll watch these courses and notify you when something opens up.
          </p>

          <div
            style={{
              backgroundColor: '#1A1A1A',
              border: '1px solid #2E2E2E',
              borderRadius: 16,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div className="flex flex-col" style={{ gap: 12, fontSize: 14 }}>
              <div className="flex justify-between">
                <span className="text-text-secondary">Date</span>
                <span className="text-white font-medium">{formatDateShort(draft.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Window</span>
                <span className="text-white font-medium">{timeLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Courses</span>
                <span className="text-white font-medium text-right">{draft.courseIds.length} selected</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Players ── */}
      <div style={{ marginBottom: 28 }}>
        <span className="section-label block" style={{ marginBottom: 12 }}>Players</span>
        <div className="flex" style={{ gap: 8 }}>
          {[2, 3, 4].map(n => (
            <button
              key={n}
              onClick={() => setSpots(n)}
              className="flex-1 font-bold transition-colors"
              style={{
                fontSize: 18,
                padding: '12px 0',
                borderRadius: 12,
                border: spots === n ? '1px solid rgba(34,197,94,0.4)' : '1px solid #2E2E2E',
                backgroundColor: spots === n ? 'rgba(34,197,94,0.06)' : '#1A1A1A',
                color: spots === n ? '#22C55E' : '#9CA3AF',
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONFIRM ── */}
      <span className="section-label block" style={{ marginBottom: 12 }}>Confirm</span>

      <div
        className="flex items-center"
        style={{
          gap: 14,
          backgroundColor: '#1A1A1A',
          border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 16,
          padding: '16px 20px',
          marginBottom: 16,
        }}
      >
        <div
          className="rounded-full flex items-center justify-center shrink-0"
          style={{ width: 40, height: 40, backgroundColor: 'rgba(34,197,94,0.12)' }}
        >
          <FlagIcon size={18} />
        </div>
        <span className="text-white font-medium" style={{ fontSize: 14 }}>{confirmText}</span>
      </div>

      {error && (
        <p className="text-red-400 text-center" style={{ fontSize: 14, marginBottom: 12 }}>{error}</p>
      )}

      {/* ── Action Button ── */}
      <button
        onClick={handleSubmit}
        disabled={submitting || (hasAvailability && !selectedTimeId)}
        className="w-full flex items-center justify-center bg-green-primary hover:bg-green-hover text-white font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ gap: 10, height: 56, borderRadius: 16, fontSize: 16, marginBottom: 10 }}
      >
        {submitting ? (
          'Creating...'
        ) : hasAvailability ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Book This Time
          </>
        ) : (
          <>
            <FlagIcon size={16} color="white" />
            Start Watching
          </>
        )}
      </button>

      <p className="text-text-secondary text-center" style={{ fontSize: 13 }}>
        {hasAvailability
          ? "We'll create the round and send the invite link."
          : "We'll notify you when a matching tee time opens up."
        }
      </p>
    </div>
  )
}
