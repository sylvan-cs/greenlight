import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDateShort, formatTime, getTimeWindowLabel, generateDateChips } from '../lib/helpers'
import { DAY_PARTS, DAY_PART_META, computeTimeRange, type DayPart } from '../lib/roundStore'
import Avatar from '../components/Avatar'
import StatusBadge from '../components/StatusBadge'
import InviteFromGroups from '../components/InviteFromGroups'
import type { RoundWithDetails, Rsvp, TeeTime, Course } from '../lib/types'

// Generate time options from 6:00 AM to 6:00 PM in 30-min increments
const TIME_OPTIONS: { value: string; label: string }[] = []
for (let h = 6; h <= 18; h++) {
  for (const m of [0, 30]) {
    if (h === 18 && m === 30) break
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    TIME_OPTIONS.push({ value, label: formatTime(value) })
  }
}

const dateChips = generateDateChips()

/** Detect which day parts a time window maps to */
function detectDayParts(start: string, end: string): { parts: Set<DayPart>; isCustom: boolean } {
  for (const combo of [
    ['morning'] as DayPart[],
    ['midday'] as DayPart[],
    ['afternoon'] as DayPart[],
    ['morning', 'midday'] as DayPart[],
    ['midday', 'afternoon'] as DayPart[],
    ['morning', 'midday', 'afternoon'] as DayPart[],
    ['morning', 'afternoon'] as DayPart[],
  ]) {
    const range = computeTimeRange(combo)
    if (range.start === start && range.end === end) {
      return { parts: new Set(combo), isCustom: false }
    }
  }
  return { parts: new Set<DayPart>(), isCustom: true }
}

export default function RoundDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [round, setRound] = useState<RoundWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [bookingTimeId, setBookingTimeId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [availableTimes, setAvailableTimes] = useState<TeeTime[]>([])
  const [loadingTimes, setLoadingTimes] = useState(true)
  const [collapsedCourses, setCollapsedCourses] = useState<Set<string>>(new Set())
  const [startingWatch, setStartingWatch] = useState(false)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editDate, setEditDate] = useState('')
  const [editDayParts, setEditDayParts] = useState<Set<DayPart>>(new Set())
  const [editUseCustomTime, setEditUseCustomTime] = useState(false)
  const [editCustomStart, setEditCustomStart] = useState('08:00')
  const [editCustomEnd, setEditCustomEnd] = useState('12:00')
  const [editSpots, setEditSpots] = useState(4)
  const [editCourseIds, setEditCourseIds] = useState<Set<string>>(new Set())
  const [editAllCourses, setEditAllCourses] = useState(false)
  const [userCourses, setUserCourses] = useState<Course[]>([])
  const [loadingUserCourses, setLoadingUserCourses] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [togglingWatch, setTogglingWatch] = useState(false)

  // Restore booking-in-progress state from localStorage on mount/return
  useEffect(() => {
    if (!id) return
    const stored = localStorage.getItem(`booking_${id}`)
    if (!stored) return
    try {
      const { teeTimeId, startedAt } = JSON.parse(stored)
      // Expire after 24 hours
      if (Date.now() - startedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(`booking_${id}`)
        return
      }
      setBookingTimeId(teeTimeId)
    } catch {
      localStorage.removeItem(`booking_${id}`)
    }
  }, [id])

  // Fetch available tee times matching this round's criteria
  const fetchAvailableTimes = useCallback(async (roundData: RoundWithDetails) => {
    const courseIds = roundData.round_courses?.map(rc => rc.course_id) ?? []
    if (courseIds.length === 0) {
      setAvailableTimes([])
      setLoadingTimes(false)
      return
    }

    const { data, error } = await supabase
      .from('tee_times')
      .select('*, courses(*)')
      .in('course_id', courseIds)
      .eq('tee_date', roundData.round_date)
      .gte('tee_time', roundData.time_window_start)
      .lte('tee_time', roundData.time_window_end)
      .eq('is_available', true)
      .order('tee_time', { ascending: true })

    if (!error && data) {
      setAvailableTimes(data as TeeTime[])
    }
    setLoadingTimes(false)
  }, [])

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
        fetchAvailableTimes(roundData)
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
  }, [id, fetchAvailableTimes])

  // Poll for available times every 60 seconds while watching
  useEffect(() => {
    if (!round || round.status === 'booked' || round.status === 'cancelled') return

    const interval = setInterval(() => {
      fetchAvailableTimes(round)
    }, 60_000)

    return () => clearInterval(interval)
  }, [round, fetchAvailableTimes])

  // Default all courses to collapsed when multiple courses
  useEffect(() => {
    const grouped = availableTimes.reduce<Record<string, TeeTime[]>>((acc, tt) => {
      const name = tt.courses?.name ?? 'Unknown'
      if (!acc[name]) acc[name] = []
      acc[name].push(tt)
      return acc
    }, {})
    const groups = Object.entries(grouped)
    if (groups.length > 1 && collapsedCourses.size === 0) {
      setCollapsedCourses(new Set(groups.map(([name]) => name)))
    }
  }, [availableTimes.length]) // eslint-disable-line react-hooks/exhaustive-deps

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
      navigate('/home')
    }
    setCancelling(false)
  }

  const handleBook = (teeTime: TeeTime) => {
    const url = teeTime.courses?.booking_url
    if (url) window.open(url, '_blank', 'noopener')
    setBookingTimeId(teeTime.id)
    // Store booking-in-progress flag for return detection
    localStorage.setItem(`booking_${id}`, JSON.stringify({ teeTimeId: teeTime.id, startedAt: Date.now() }))
  }

  const handleConfirmBooking = async () => {
    if (!round || !bookingTimeId) return
    setConfirming(true)
    const bookedTime = availableTimes.find(t => t.id === bookingTimeId)
    if (!bookedTime) {
      setConfirming(false)
      return
    }

    const { error } = await supabase
      .from('rounds')
      .update({
        status: 'booked',
        has_specific_time: true,
        specific_tee_time: bookedTime.tee_time,
        specific_course_id: bookedTime.course_id,
        matched_tee_time_id: bookedTime.id,
        matched_at: new Date().toISOString(),
      })
      .eq('id', round.id)

    if (!error) {
      localStorage.removeItem(`booking_${id}`)
      setRound(prev => prev ? {
        ...prev,
        status: 'booked',
        has_specific_time: true,
        specific_tee_time: bookedTime.tee_time,
        specific_course_id: bookedTime.course_id,
        matched_tee_time_id: bookedTime.id,
      } : prev)

      // Send booking notification emails (fire-and-forget)
      fetch('/api/notify-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId: round.id, bookerId: user?.id }),
      }).catch(() => {})
    }
    setConfirming(false)
    setBookingTimeId(null)
  }

  const handleStartWatching = async () => {
    if (!round) return
    setStartingWatch(true)
    const { error } = await supabase
      .from('rounds')
      .update({ status: 'watching', has_specific_time: false, matched_tee_time_id: null })
      .eq('id', round.id)
    if (!error) {
      setRound(prev => prev ? { ...prev, status: 'watching', has_specific_time: false, matched_tee_time_id: null } : prev)
    }
    setStartingWatch(false)
  }

  const toggleCourseCollapse = (courseName: string) => {
    setCollapsedCourses(prev => {
      const next = new Set(prev)
      if (next.has(courseName)) next.delete(courseName)
      else next.add(courseName)
      return next
    })
  }

  // ── Edit handlers ──

  const startEditing = async () => {
    if (!round || !user) return

    // Pre-populate form from current round values
    setEditDate(round.round_date)
    setEditSpots(round.spots_needed)

    const detected = detectDayParts(round.time_window_start, round.time_window_end)
    setEditDayParts(detected.parts)
    setEditUseCustomTime(detected.isCustom)
    setEditCustomStart(round.time_window_start)
    setEditCustomEnd(round.time_window_end)

    const currentCourseIds = new Set(round.round_courses?.map(rc => rc.course_id) ?? [])
    setEditCourseIds(currentCourseIds)
    setEditError('')

    // Fetch user's courses for the selector
    setLoadingUserCourses(true)
    const { data } = await supabase
      .from('user_courses')
      .select('course_id, courses(*)')
      .eq('user_id', user.id)

    if (data) {
      const myCourses = data
        .map((uc: any) => uc.courses)
        .filter(Boolean) as Course[]
      myCourses.sort((a, b) =>
        a.region.localeCompare(b.region) || a.name.localeCompare(b.name)
      )
      setUserCourses(myCourses)
      setEditAllCourses(currentCourseIds.size === myCourses.length && myCourses.every(c => currentCourseIds.has(c.id)))
    }
    setLoadingUserCourses(false)
    setEditing(true)
  }

  const toggleEditDayPart = (part: DayPart) => {
    setEditDayParts(prev => {
      const next = new Set(prev)
      if (next.has(part)) next.delete(part)
      else next.add(part)
      return next
    })
    setEditUseCustomTime(false)
  }

  const toggleEditCourse = (courseId: string) => {
    setEditCourseIds(prev => {
      const next = new Set(prev)
      if (next.has(courseId)) next.delete(courseId)
      else next.add(courseId)
      setEditAllCourses(next.size === userCourses.length)
      return next
    })
  }

  const toggleEditAllCourses = () => {
    if (editAllCourses) {
      setEditAllCourses(false)
      setEditCourseIds(new Set())
    } else {
      setEditAllCourses(true)
      setEditCourseIds(new Set(userCourses.map(c => c.id)))
    }
  }

  const editTimeError = editUseCustomTime && editCustomEnd <= editCustomStart
    ? 'End time must be after start time'
    : ''

  const canSaveEdit = editCourseIds.size > 0 && (editUseCustomTime || editDayParts.size > 0) && !editTimeError

  const handleSaveEdit = async () => {
    if (!round || !canSaveEdit) return
    setSaving(true)
    setEditError('')

    const parts = Array.from(editDayParts)
    const timeRange = editUseCustomTime
      ? { start: editCustomStart, end: editCustomEnd }
      : computeTimeRange(parts)

    const courseIds = Array.from(editCourseIds)

    // Update the round
    const { error: roundError } = await supabase
      .from('rounds')
      .update({
        round_date: editDate,
        time_window_start: timeRange.start,
        time_window_end: timeRange.end,
        spots_needed: editSpots,
        matched_tee_time_id: null,
        matched_at: null,
        has_specific_time: false,
        specific_tee_time: null,
        specific_course_id: null,
        status: 'watching',
      })
      .eq('id', round.id)

    if (roundError) {
      setEditError(roundError.message)
      setSaving(false)
      return
    }

    // Replace round_courses
    await supabase.from('round_courses').delete().eq('round_id', round.id)
    const { error: coursesError } = await supabase
      .from('round_courses')
      .insert(courseIds.map(course_id => ({ round_id: round.id, course_id })))

    if (coursesError) {
      setEditError(coursesError.message)
      setSaving(false)
      return
    }

    // Re-fetch full round to get updated round_courses with course details
    const { data: freshRound } = await supabase
      .from('rounds')
      .select('*, round_courses(*, courses(*)), rsvps(*)')
      .eq('id', round.id)
      .single()

    if (freshRound) {
      const updated = freshRound as unknown as RoundWithDetails
      setRound(updated)
      fetchAvailableTimes(updated)
    }

    // Send update notification email (fire-and-forget)
    fetch('/api/notify-round-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId: round.id }),
    }).catch(() => {})

    setEditing(false)
    setSaving(false)
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
  const rsvps = round.rsvps ?? []
  const rsvpsIn = rsvps.filter(r => r.status === 'in')
  const shareUrl = `${window.location.origin}/r/${round.share_code}`
  const timeLabel = getTimeWindowLabel(round.time_window_start, round.time_window_end)
  const isOrganizer = !!(user && round.creator_id === user.id)

  // Group available times by course
  const groupedTimes = availableTimes.reduce<Record<string, TeeTime[]>>((acc, tt) => {
    const name = tt.courses?.name ?? 'Unknown'
    if (!acc[name]) acc[name] = []
    acc[name].push(tt)
    return acc
  }, {})
  const courseGroups = Object.entries(groupedTimes)
  const multiCourse = courseGroups.length > 1

  // For booked rounds, find the specific course
  const bookedCourse = round.has_specific_time && round.specific_course_id
    ? round.round_courses?.find(rc => rc.course_id === round.specific_course_id)?.courses
    : null

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
            {round.has_specific_time && bookedCourse
              ? bookedCourse.name
              : courseNames.length > 0 ? courseNames.join(' or ') : 'No courses selected'}
          </h2>
          <p className="text-sm font-body text-muted-foreground mt-1">
            {round.has_specific_time && round.specific_tee_time
              ? `${formatDateShort(round.round_date)} \u00b7 ${formatTime(round.specific_tee_time)}`
              : `${formatDateShort(round.round_date)} \u00b7 ${timeLabel}`}
          </p>
        </div>
      </section>

      {/* ── Booked Card ── */}
      {round.status === 'booked' && round.has_specific_time && round.specific_tee_time && (
        <div className="bg-primary/5 border border-primary/25 rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-sm font-body font-semibold text-primary">Booked</span>
          </div>
          <p className="font-display text-lg leading-tight">
            {formatTime(round.specific_tee_time)} at {bookedCourse?.name ?? 'TBD'}
          </p>
          <p className="text-sm font-body text-muted-foreground">
            {formatDateShort(round.round_date)}
          </p>
        </div>
      )}

      {/* ── Edit Round Form ── */}
      {editing && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
          <h3 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
            Edit Round
          </h3>

          {/* Date */}
          <div className="space-y-2">
            <span className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">Date</span>
            <div className="relative -mx-5">
              <div className="flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar">
                {dateChips.map(chip => {
                  const isSelected = editDate === chip.date
                  return (
                    <button
                      key={chip.date}
                      onClick={() => setEditDate(chip.date)}
                      className={`shrink-0 flex flex-col items-center w-14 py-2 rounded-xl text-center transition-all duration-150 active:scale-95 select-none ${
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <span className="text-[10px] font-body font-semibold uppercase tracking-wider">
                        {chip.dayLabel}
                      </span>
                      <span className="text-lg font-display leading-tight mt-0.5">{chip.dateNum}</span>
                    </button>
                  )
                })}
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent" />
            </div>
          </div>

          {/* Time */}
          <div className="space-y-2">
            <span className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">Time</span>
            <div className="flex gap-2">
              {DAY_PARTS.map(key => {
                const isSelected = !editUseCustomTime && editDayParts.has(key)
                return (
                  <button
                    key={key}
                    onClick={() => toggleEditDayPart(key)}
                    className={`flex-1 flex items-center justify-center gap-1 h-10 rounded-xl text-xs font-body font-medium transition-all duration-150 active:scale-95 select-none border ${
                      isSelected
                        ? 'bg-primary/15 text-primary border-primary/40'
                        : 'bg-transparent text-muted-foreground border-border hover:border-foreground/20'
                    }`}
                  >
                    {DAY_PART_META[key].label}
                  </button>
                )
              })}
              <button
                onClick={() => setEditUseCustomTime(true)}
                className={`flex-1 flex items-center justify-center gap-1 h-10 rounded-xl text-xs font-body font-medium transition-all duration-150 active:scale-95 select-none border ${
                  editUseCustomTime
                    ? 'bg-primary/15 text-primary border-primary/40'
                    : 'bg-transparent text-muted-foreground border-border hover:border-foreground/20'
                }`}
              >
                Custom
              </button>
            </div>
            {editUseCustomTime && (
              <>
                <div className="flex gap-3">
                  <div className="flex-1 flex flex-col gap-1.5">
                    <span className="text-xs font-body text-muted-foreground">From</span>
                    <select
                      value={editCustomStart}
                      onChange={e => setEditCustomStart(e.target.value)}
                      className="h-11 rounded-xl border border-border bg-background text-foreground font-body text-sm px-3 focus:outline-none focus:border-primary transition-colors appearance-none"
                    >
                      {TIME_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 flex flex-col gap-1.5">
                    <span className="text-xs font-body text-muted-foreground">To</span>
                    <select
                      value={editCustomEnd}
                      onChange={e => setEditCustomEnd(e.target.value)}
                      className="h-11 rounded-xl border border-border bg-background text-foreground font-body text-sm px-3 focus:outline-none focus:border-primary transition-colors appearance-none"
                    >
                      {TIME_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {editTimeError && (
                  <p className="text-xs font-body text-destructive">End time must be after start time</p>
                )}
              </>
            )}
          </div>

          {/* Players */}
          <div className="space-y-2">
            <span className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">Players</span>
            <div className="flex gap-2">
              {[2, 3, 4].map(n => (
                <button
                  key={n}
                  onClick={() => setEditSpots(n)}
                  className={`flex-1 py-2.5 rounded-xl text-lg font-display font-bold transition-all duration-150 active:scale-95 select-none border text-center ${
                    editSpots === n
                      ? 'bg-primary/15 text-primary border-primary/40'
                      : 'bg-transparent text-muted-foreground border-border hover:border-foreground/20'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Courses */}
          <div className="space-y-2">
            <span className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">Courses</span>
            {loadingUserCourses ? (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="skeleton" style={{ height: 36, width: 112 }} />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={toggleEditAllCourses}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-body font-medium transition-all duration-150 active:scale-95 select-none border ${
                    editAllCourses
                      ? 'bg-primary/15 text-primary border-primary/40'
                      : 'bg-transparent text-muted-foreground border-border hover:border-foreground/20'
                  }`}
                >
                  {editAllCourses && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  Any of my courses
                </button>
                {userCourses.map(course => {
                  const isSelected = editCourseIds.has(course.id) && !editAllCourses
                  return (
                    <button
                      key={course.id}
                      onClick={() => {
                        if (editAllCourses) {
                          setEditAllCourses(false)
                          setEditCourseIds(new Set([course.id]))
                        } else {
                          toggleEditCourse(course.id)
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-body font-medium transition-all duration-150 active:scale-95 select-none border ${
                        isSelected
                          ? 'bg-primary/15 text-primary border-primary/40'
                          : 'bg-transparent text-muted-foreground border-border hover:border-foreground/20'
                      }`}
                    >
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {course.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {editError && (
            <p className="text-sm font-body text-destructive">{editError}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setEditing(false)}
              className="flex-1 h-11 border border-border text-foreground font-body font-semibold rounded-xl hover:bg-muted/50 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={!canSaveEdit || saving}
              className="flex-1 h-11 bg-primary hover:bg-green-hover text-primary-foreground font-body font-bold rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm"
            >
              {saving ? 'Saving\u2026' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* ── Edit Round button (organizer only, non-booked/cancelled) ── */}
      {isOrganizer && !editing && round.status !== 'booked' && round.status !== 'cancelled' && (
        <button
          onClick={startEditing}
          className="w-full flex items-center justify-center gap-2 h-11 border border-border text-foreground font-body font-medium rounded-xl hover:bg-muted/50 transition-colors text-sm"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Edit Round
        </button>
      )}

      {/* ── Available Now / Watching ── */}
      {(round.status === 'watching' || round.status === 'open' || round.status === 'found') && (
        <>
          {loadingTimes ? (
            <div className="space-y-2">
              <div className="skeleton" style={{ height: 16, width: 120 }} />
              <div className="skeleton w-full" style={{ height: 64 }} />
              <div className="skeleton w-full" style={{ height: 64 }} />
            </div>
          ) : availableTimes.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
                Available Now
              </h2>

              {courseGroups.map(([courseName, times]) => {
                const isCollapsed = collapsedCourses.has(courseName)
                return (
                <div key={courseName} className="space-y-2">
                  {multiCourse && (
                    <button
                      onClick={() => toggleCourseCollapse(courseName)}
                      className="flex items-center justify-between w-full text-left py-1"
                    >
                      <p className="text-xs font-body font-medium text-muted-foreground uppercase tracking-wide">
                        {courseName}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-body text-muted-foreground/60">{times.length} times</span>
                        <svg
                          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          className={`text-muted-foreground transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </button>
                  )}
                  {!isCollapsed && times.map(tt => {
                    const isBooking = bookingTimeId === tt.id
                    return (
                      <div
                        key={tt.id}
                        className={`bg-card border rounded-2xl p-4 space-y-3 transition-all duration-150 ${
                          isBooking ? 'border-primary/40 bg-primary/5' : 'border-border'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-display text-[17px] text-foreground">
                              {formatTime(tt.tee_time)}
                            </span>
                            {!multiCourse && (
                              <span className="text-sm font-body text-muted-foreground ml-3">
                                {tt.courses?.name}
                              </span>
                            )}
                          </div>
                          {tt.price_label && (
                            <span className="text-sm font-body text-muted-foreground">{tt.price_label}</span>
                          )}
                        </div>

                        {!isBooking ? (
                          <button
                            onClick={() => handleBook(tt)}
                            className="w-full h-11 flex items-center justify-center gap-2 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors text-sm font-body"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                            Book This Time
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <button
                              onClick={handleConfirmBooking}
                              disabled={confirming}
                              className="w-full h-11 flex items-center justify-center gap-2 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-50 text-sm font-body"
                            >
                              {confirming ? 'Confirming\u2026' : (
                                <>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  Confirm Booking
                                </>
                              )}
                            </button>
                            <p className="text-xs font-body text-muted-foreground text-center">
                              Done booking on {tt.courses?.name ?? 'the course'}'s site? Confirm to let your crew know.
                            </p>
                            <button
                              onClick={() => {
                                setBookingTimeId(null)
                                localStorage.removeItem(`booking_${id}`)
                              }}
                              className="w-full text-xs font-body text-muted-foreground/60 hover:text-foreground transition-colors"
                            >
                              Not this one
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                )
              })}

              {/* Start Watching button */}
              {isOrganizer && round.status === 'open' && (
                <button
                  onClick={handleStartWatching}
                  disabled={startingWatch}
                  className="w-full h-12 flex items-center justify-center gap-2 border border-primary/30 text-primary font-body font-semibold rounded-xl hover:bg-primary/5 transition-colors text-sm"
                >
                  {startingWatch ? 'Starting...' : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                        <line x1="4" y1="22" x2="4" y2="15" />
                      </svg>
                      Skip These &middot; Start Watching
                    </>
                  )}
                </button>
              )}

              <p className="text-xs font-body text-muted-foreground text-center">
                {round.status === 'watching'
                  ? "We're watching and will notify you when a match is found"
                  : "Pick a time above, or start watching to get notified"}
              </p>
            </section>
          ) : (
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
        </>
      )}

      {/* ── Co-watcher toggle (non-organizer, status 'in') ── */}
      {!isOrganizer && round.status !== 'cancelled' && round.status !== 'booked' && (() => {
        const myRsvp = rsvps.find(r => r.user_id === user?.id && r.status === 'in')
        if (!myRsvp) return null
        return (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={myRsvp.is_watching ?? false}
                disabled={togglingWatch}
                onChange={async (e) => {
                  const val = e.target.checked
                  setTogglingWatch(true)
                  await (supabase as any).from('rsvps').update({ is_watching: val }).eq('id', myRsvp.id)
                  setRound(prev => prev ? {
                    ...prev,
                    rsvps: prev.rsvps.map(r => r.id === myRsvp.id ? { ...r, is_watching: val } : r),
                  } : prev)
                  setTogglingWatch(false)
                }}
                className="w-4 h-4 rounded border-border accent-primary mt-0.5"
              />
              <div>
                <span className="text-sm font-body text-foreground font-medium">
                  Watch for tee times
                </span>
                <p className="text-xs font-body text-muted-foreground mt-0.5">
                  If we find a time, we'll notify you — and you can book it if the organizer hasn't yet.
                </p>
              </div>
            </label>
          </div>
        )
      })()}

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
            const isInvited = rsvp.status === 'invited'
            return (
              <div
                key={rsvp.id}
                className={`flex items-center gap-3 py-3 px-3 rounded-lg transition-all duration-200 ${
                  isOut ? 'opacity-40' : isInvited ? 'opacity-70' : 'opacity-100'
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
                  {isInvited && (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                      <span className="text-blue-400">Invited</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Invite Friends (organizer only) ── */}
      {isOrganizer && round.status !== 'cancelled' && (
        <InviteFromGroups
          selectedUsers={[]}
          onSelectionChange={(users) => {
            // Immediately invite each new user
            users.forEach(async (u) => {
              const { error } = await supabase.from('rsvps').insert({
                round_id: round.id,
                user_id: u.id,
                name: u.full_name,
                email: u.email,
                status: 'invited',
              })
              if (!error) {
                fetch('/api/notify-invite', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ roundId: round.id, invitedUserIds: [u.id] }),
                }).catch(() => {})
              }
            })
          }}
          existingUserIds={rsvps.filter(r => r.user_id).map(r => r.user_id!)}
        />
      )}

      {/* ── Cancel ── */}
      {round.status !== 'cancelled' && (
        <>
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="w-full text-center text-sm font-body text-muted-foreground/60 hover:text-destructive transition-colors py-2"
          >
            Cancel Round
          </button>

          {showCancelConfirm && (
            <div className="bg-card border border-destructive/30 rounded-2xl p-5 space-y-3">
              <p className="text-sm font-body text-foreground font-medium">
                Are you sure you want to cancel this round?
              </p>
              <p className="text-xs font-body text-muted-foreground">
                This can't be undone. Your group will see the round as cancelled.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 h-11 border border-border text-foreground font-body font-semibold rounded-xl hover:bg-muted/50 transition-colors text-sm"
                >
                  Keep Round
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 h-11 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-body font-bold rounded-xl transition-colors disabled:opacity-50 text-sm"
                >
                  {cancelling ? 'Cancelling\u2026' : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
