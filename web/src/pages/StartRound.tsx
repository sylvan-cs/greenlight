import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getDraft, updateDraft, computeTimeRange, DAY_PARTS, DAY_PART_META, type DayPart } from '../lib/roundStore'
import { generateDateChips, formatTime } from '../lib/helpers'
import InviteFromGroups from '../components/InviteFromGroups'
import type { Course, ProfileSearchResult } from '../lib/types'

const dateChips = generateDateChips()

function SunriseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 18a5 5 0 0 0-10 0" />
      <line x1="12" y1="9" x2="12" y2="2" />
      <line x1="4.22" y1="10.22" x2="5.64" y2="11.64" />
      <line x1="1" y1="18" x2="3" y2="18" />
      <line x1="21" y1="18" x2="23" y2="18" />
      <line x1="18.36" y1="11.64" x2="19.78" y2="10.22" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      <line x1="4.22" y1="18.36" x2="5.64" y2="19.78" />
    </svg>
  )
}

function SunsetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 18a5 5 0 0 0-10 0" />
      <line x1="12" y1="2" x2="12" y2="9" />
      <line x1="4.22" y1="10.22" x2="5.64" y2="11.64" />
      <line x1="1" y1="18" x2="3" y2="18" />
      <line x1="21" y1="18" x2="23" y2="18" />
      <line x1="18.36" y1="11.64" x2="19.78" y2="10.22" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

const dayPartIcons: Record<DayPart, () => React.ReactElement> = {
  morning: SunriseIcon,
  midday: SunIcon,
  afternoon: SunsetIcon,
}

// Generate time options from 6:00 AM to 6:00 PM in 30-min increments
const TIME_OPTIONS: { value: string; label: string }[] = []
for (let h = 6; h <= 18; h++) {
  for (const m of [0, 30]) {
    if (h === 18 && m === 30) break
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    TIME_OPTIONS.push({ value, label: formatTime(value) })
  }
}

export default function StartRound() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const draft = getDraft()

  const [selectedDate, setSelectedDate] = useState(draft.date)
  const [selectedDayParts, setSelectedDayParts] = useState<Set<DayPart>>(new Set(draft.dayParts))
  const [useCustomTime, setUseCustomTime] = useState(draft.useCustomTime)
  const [customStart, setCustomStart] = useState(draft.useCustomTime ? draft.timeStart : '08:00')
  const [customEnd, setCustomEnd] = useState(draft.useCustomTime ? draft.timeEnd : '12:00')
  const [spots, setSpots] = useState(draft.spots)
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set(draft.courseIds))
  const [allCourses, setAllCourses] = useState(draft.courseIds.length === 0)
  const [loadingCourses, setLoadingCourses] = useState(true)
  const hasFetchedCourses = useRef(false)
  const [invitedUsers, setInvitedUsers] = useState<ProfileSearchResult[]>(draft.invitedUsers)
  const [error] = useState('')

  useEffect(() => {
    async function fetchCourses() {
      if (!user) return

      const { data, error } = await supabase
        .from('user_courses')
        .select('course_id, courses(*)')
        .eq('user_id', user.id)

      if (!error && data) {
        const myCourses = data
          .map((uc: any) => uc.courses)
          .filter(Boolean) as Course[]
        myCourses.sort((a, b) =>
          a.region.localeCompare(b.region) || a.name.localeCompare(b.name)
        )
        setCourses(myCourses)
        if (allCourses) {
          setSelectedCourseIds(new Set(myCourses.map(c => c.id)))
        }
      }
      hasFetchedCourses.current = true
      setLoadingCourses(false)
    }

    // Only show skeleton on initial fetch, not on auth state re-renders
    if (!hasFetchedCourses.current) {
      setLoadingCourses(true)
    }
    fetchCourses()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAllCourses = () => {
    if (allCourses) {
      setAllCourses(false)
      setSelectedCourseIds(new Set())
    } else {
      setAllCourses(true)
      setSelectedCourseIds(new Set(courses.map(c => c.id)))
    }
  }

  const toggleCourse = (id: string) => {
    setSelectedCourseIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      setAllCourses(next.size === courses.length)
      return next
    })
  }

  const toggleDayPart = (part: DayPart) => {
    setSelectedDayParts(prev => {
      const next = new Set(prev)
      if (next.has(part)) {
        next.delete(part)
      } else {
        next.add(part)
      }
      return next
    })
    setUseCustomTime(false)
  }

  const timeError = useCustomTime && customEnd <= customStart
    ? 'End time must be after start time'
    : ''

  const handleNext = () => {
    if (!user) return
    if (timeError) return

    const parts = Array.from(selectedDayParts)
    const timeRange = useCustomTime
      ? { start: customStart, end: customEnd }
      : computeTimeRange(parts)

    updateDraft({
      date: selectedDate,
      dayParts: parts,
      useCustomTime,
      timeStart: timeRange.start,
      timeEnd: timeRange.end,
      courseIds: Array.from(selectedCourseIds),
      spots,
      invitedUsers,
    })

    navigate('/start/available')
  }

  const canProceed = selectedCourseIds.size > 0 && (useCustomTime || selectedDayParts.size > 0) && !timeError

  const confirmDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const confirmTime = useCustomTime
    ? `${formatTime(customStart)} – ${formatTime(customEnd)}`
    : selectedDayParts.size === 3
      ? 'All Day'
      : DAY_PARTS.filter(p => selectedDayParts.has(p)).map(p => DAY_PART_META[p].label).join(' & ')
  const confirmCourses = allCourses
    ? 'Any of your courses'
    : selectedCourseIds.size === 0
      ? 'No courses'
      : selectedCourseIds.size <= 2
        ? courses.filter(c => selectedCourseIds.has(c.id)).map(c => c.name).join(', ')
        : `${selectedCourseIds.size} courses`
  const confirmPlayers = `${spots} player${spots !== 1 ? 's' : ''}`
  const confirmText = `${confirmDate} · ${confirmTime} · ${confirmPlayers} · ${confirmCourses}`

  return (
    <div className="animate-fade-in space-y-6 px-5 max-w-lg mx-auto pt-4 pb-10">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
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
        <h1 className="text-3xl font-display tracking-tight">Start a Round</h1>
      </div>

      {/* ── Date ── */}
      <section className="space-y-2.5">
        <h3 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
          Date
        </h3>
        <div className="relative -mx-5">
          <div className="flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar">
            {dateChips.map(chip => {
              const isSelected = selectedDate === chip.date
              return (
                <button
                  key={chip.date}
                  onClick={() => setSelectedDate(chip.date)}
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
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
        </div>
      </section>

      {/* ── Time ── */}
      <section className="space-y-2.5">
        <h3 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
          Time
        </h3>
        <div className="flex gap-2">
          {DAY_PARTS.map(key => {
            const isSelected = !useCustomTime && selectedDayParts.has(key)
            const Icon = dayPartIcons[key]
            return (
              <button
                key={key}
                onClick={() => toggleDayPart(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-body font-medium transition-all duration-150 active:scale-95 select-none border ${
                  isSelected
                    ? 'bg-primary/15 text-primary border-primary/40'
                    : 'bg-transparent text-muted-foreground border-border hover:border-foreground/20'
                }`}
              >
                <Icon />
                {DAY_PART_META[key].label}
              </button>
            )
          })}
          <button
            onClick={() => setUseCustomTime(true)}
            className={`flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-body font-medium transition-all duration-150 active:scale-95 select-none border ${
              useCustomTime
                ? 'bg-primary/15 text-primary border-primary/40'
                : 'bg-transparent text-muted-foreground border-border hover:border-foreground/20'
            }`}
          >
            <ClockIcon />
            Custom
          </button>
        </div>

        {useCustomTime && (
          <>
            <div className="flex gap-3">
              <div className="flex-1 flex flex-col gap-1.5">
                <span className="text-xs font-body text-muted-foreground">From</span>
                <select
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="h-11 rounded-xl border border-border bg-card text-foreground font-body text-sm px-3 focus:outline-none focus:border-primary transition-colors appearance-none"
                >
                  {TIME_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <span className="text-xs font-body text-muted-foreground">To</span>
                <select
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="h-11 rounded-xl border border-border bg-card text-foreground font-body text-sm px-3 focus:outline-none focus:border-primary transition-colors appearance-none"
                >
                  {TIME_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {timeError && (
              <p className="text-xs font-body text-destructive">End time must be after start time</p>
            )}
          </>
        )}
      </section>

      {/* ── Players ── */}
      <section className="space-y-2.5">
        <h3 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
          Players
        </h3>
        <div className="flex gap-2">
          {[2, 3, 4].map(n => (
            <button
              key={n}
              onClick={() => setSpots(n)}
              className={`flex-1 py-3 rounded-xl text-lg font-display font-bold transition-all duration-150 active:scale-95 select-none border text-center ${
                spots === n
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-transparent text-muted-foreground border-border hover:border-foreground/20'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      {/* ── Courses ── */}
      <section className="space-y-2.5">
        <h3 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
          Courses
        </h3>
        {loadingCourses ? (
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="skeleton" style={{ height: 36, width: 112 }} />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <p className="text-sm font-body text-muted-foreground">
            No courses added yet.{' '}
            <button onClick={() => navigate('/profile')} className="text-primary underline">
              Add courses
            </button>{' '}
            in your profile.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={toggleAllCourses}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-body font-medium transition-all duration-150 active:scale-95 select-none border ${
                allCourses
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-transparent text-muted-foreground border-border hover:border-foreground/20'
              }`}
            >
              {allCourses && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              Any of my courses
            </button>

            {courses.map(course => {
              const isSelected = selectedCourseIds.has(course.id) && !allCourses
              return (
                <button
                  key={course.id}
                  onClick={() => {
                    if (allCourses) {
                      setAllCourses(false)
                      setSelectedCourseIds(new Set([course.id]))
                    } else {
                      toggleCourse(course.id)
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
      </section>

      {/* ── Invite Friends ── */}
      <InviteFromGroups
        selectedUsers={invitedUsers}
        onSelectionChange={setInvitedUsers}
      />

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

      {/* ── Next Button ── */}
      <button
        onClick={handleNext}
        disabled={!canProceed}
        className="w-full h-14 flex items-center justify-center gap-2 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-base font-body"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
        Check Availability
      </button>

      <p className="text-xs font-body text-muted-foreground text-center">
        We'll check for open tee times matching your preferences.
      </p>
    </div>
  )
}
