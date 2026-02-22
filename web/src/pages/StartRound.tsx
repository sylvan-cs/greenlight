import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { updateDraft, getDraft, type TimeWindow, TIME_WINDOWS } from '../lib/roundStore'
import { generateDateChips } from '../lib/helpers'
import type { Course } from '../lib/types'

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

function FlagIcon({ size = 16, color = '#22C55E' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

const timeIcons: Record<TimeWindow, () => React.ReactElement> = {
  morning: SunriseIcon,
  midday: SunIcon,
  afternoon: SunsetIcon,
}

export default function StartRound() {
  const navigate = useNavigate()
  const draft = getDraft()

  const [selectedDate, setSelectedDate] = useState(draft.date)
  const [selectedTime, setSelectedTime] = useState<TimeWindow>(draft.timeWindow)
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set(draft.courseIds))
  const [allCourses, setAllCourses] = useState(draft.courseIds.length === 0)
  const [loadingCourses, setLoadingCourses] = useState(true)

  useEffect(() => {
    async function fetchCourses() {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .order('region')
        .order('name')

      if (!error && data) {
        setCourses(data as Course[])
        if (allCourses) {
          setSelectedCourseIds(new Set((data as Course[]).map(c => c.id)))
        }
      }
      setLoadingCourses(false)
    }

    fetchCourses()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleNext = () => {
    updateDraft({
      date: selectedDate,
      timeWindow: selectedTime,
      courseIds: Array.from(selectedCourseIds),
    })
    navigate('/start/times')
  }

  const canProceed = selectedCourseIds.size > 0

  // Build confirm summary text like "Feb 23 · Midday · Any of your courses"
  const confirmDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const confirmTime = TIME_WINDOWS[selectedTime].label
  const confirmCourses = allCourses
    ? 'Any of your courses'
    : selectedCourseIds.size === 0
      ? 'No courses'
      : selectedCourseIds.size <= 2
        ? courses.filter(c => selectedCourseIds.has(c.id)).map(c => c.name).join(', ')
        : `${selectedCourseIds.size} courses`
  const confirmText = `${confirmDate} · ${confirmTime} · ${confirmCourses}`

  return (
    <div className="px-6 w-full max-w-[480px] mx-auto" style={{ paddingTop: 32, paddingBottom: 40 }}>

      {/* ── Header: ← Start a Round ── */}
      <div className="flex items-center" style={{ gap: 12, paddingBottom: 28 }}>
        <button onClick={() => navigate('/home')} className="flex items-center shrink-0">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h1 className="font-display font-bold text-white" style={{ fontSize: 24 }}>Start a Round</h1>
      </div>

      {/* ── Date ── */}
      <span className="section-label block" style={{ marginBottom: 12 }}>Date</span>
      <div style={{ marginBottom: 24 }}>
        <div className="flex overflow-x-auto no-scrollbar -mx-6 px-6 pb-1" style={{ gap: 8 }}>
          {dateChips.map(chip => {
            const isSelected = selectedDate === chip.date
            return (
              <button
                key={chip.date}
                onClick={() => setSelectedDate(chip.date)}
                className="flex flex-col items-center justify-center shrink-0 rounded-xl transition-colors"
                style={{
                  width: 56,
                  height: 64,
                  border: `1px solid ${isSelected ? '#22C55E' : '#2E2E2E'}`,
                  backgroundColor: isSelected ? 'rgba(34,197,94,0.1)' : '#1A1A1A',
                }}
              >
                <span
                  className="font-semibold tracking-wider"
                  style={{ fontSize: 10, color: isSelected ? '#22C55E' : '#9CA3AF' }}
                >
                  {chip.dayLabel}
                </span>
                <span className="text-white font-bold leading-tight" style={{ fontSize: 18 }}>
                  {chip.dateNum}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Time ── */}
      <span className="section-label block" style={{ marginBottom: 12 }}>Time</span>
      <div className="flex" style={{ gap: 8, marginBottom: 24 }}>
        {(Object.keys(TIME_WINDOWS) as TimeWindow[]).map(key => {
          const isSelected = selectedTime === key
          const Icon = timeIcons[key]
          return (
            <button
              key={key}
              onClick={() => setSelectedTime(key)}
              className="flex-1 flex items-center justify-center rounded-xl text-sm font-medium transition-colors"
              style={{
                gap: 6,
                height: 44,
                border: `1px solid ${isSelected ? '#22C55E' : '#2E2E2E'}`,
                backgroundColor: isSelected ? 'rgba(34,197,94,0.1)' : '#1A1A1A',
                color: isSelected ? '#22C55E' : '#9CA3AF',
              }}
            >
              <Icon />
              {TIME_WINDOWS[key].label}
            </button>
          )
        })}
      </div>

      {/* ── Courses ── */}
      <span className="section-label block" style={{ marginBottom: 12 }}>Courses</span>
      {loadingCourses ? (
        <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 28 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton" style={{ height: 36, width: 112 }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 28 }}>
          {/* "Any of my courses" chip */}
          <button
            onClick={toggleAllCourses}
            className="flex items-center transition-colors"
            style={{
              gap: 6,
              padding: '8px 16px',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 500,
              border: `1px solid ${allCourses ? '#22C55E' : '#2E2E2E'}`,
              color: allCourses ? '#22C55E' : '#9CA3AF',
              backgroundColor: allCourses ? 'rgba(34,197,94,0.1)' : '#1A1A1A',
            }}
          >
            {allCourses && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                className="flex items-center transition-colors"
                style={{
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 20,
                  fontSize: 14,
                  fontWeight: 500,
                  border: `1px solid ${isSelected ? '#22C55E' : '#2E2E2E'}`,
                  color: isSelected ? '#22C55E' : '#9CA3AF',
                  backgroundColor: isSelected ? 'rgba(34,197,94,0.1)' : '#1A1A1A',
                }}
              >
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {course.name}
              </button>
            )
          })}
        </div>
      )}

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

      {/* ── Start Watching Button ── */}
      <button
        onClick={handleNext}
        disabled={!canProceed}
        className="w-full flex items-center justify-center bg-green-primary hover:bg-green-hover text-white font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ gap: 10, height: 56, borderRadius: 16, fontSize: 16, marginBottom: 12 }}
      >
        <FlagIcon size={16} color="white" />
        Start Watching
      </button>

      <p className="text-text-secondary text-center" style={{ fontSize: 13 }}>
        We'll notify you when a matching tee time opens up.
      </p>
    </div>
  )
}
