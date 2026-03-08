import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Course } from '../lib/types'

interface CourseSelectorProps {
  initialSelectedIds?: Set<string>
  onSave: (selectedIds: Set<string>) => Promise<void>
  saveLabel?: string
  isSaving?: boolean
}

export default function CourseSelector({
  initialSelectedIds = new Set(),
  onSave,
  saveLabel = 'Continue',
  isSaving = false,
}: CourseSelectorProps) {
  const { user } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [njCourses, setNjCourses] = useState<Course[]>([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelectedIds))
  const [requestName, setRequestName] = useState('')
  const [requestStatus, setRequestStatus] = useState<'idle' | 'sending' | 'sent'>('idle')

  useEffect(() => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const future = new Date(today)
    future.setDate(future.getDate() + 30)
    const futureStr = future.toISOString().split('T')[0]

    const activeFetch = supabase
      .from('courses')
      .select('*, tee_times!inner(id)')
      .eq('tee_times.is_available', true)
      .gte('tee_times.tee_date', todayStr)
      .lte('tee_times.tee_date', futureStr)
      .neq('region', 'nj')
      .order('region')
      .order('name')

    const njFetch = supabase
      .from('courses')
      .select('id, name, city, region, booking_url')
      .eq('region', 'nj')
      .order('name')

    Promise.all([activeFetch, njFetch]).then(([activeRes, njRes]) => {
      if (activeRes.error) console.error('Failed to load courses:', activeRes.error)
      if (activeRes.data) setCourses(activeRes.data.map((row: any) => { const { tee_times, ...course } = row; return course; }) as Course[])
      if (njRes.data) setNjCourses(njRes.data as Course[])
      setLoadingCourses(false)
    })
  }, [])

  const coursesByRegion = useMemo(() => {
    const map = new Map<string, Course[]>()
    for (const course of courses) {
      if (!map.has(course.region)) map.set(course.region, [])
      map.get(course.region)!.push(course)
    }
    return map
  }, [courses])

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canSave = selectedIds.size > 0

  if (loadingCourses) {
    return (
      <div className="flex flex-col gap-6">
        {[1, 2].map(i => (
          <div key={i} className="space-y-2.5">
            <div className="skeleton h-3 w-32 rounded" />
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3].map(j => (
                <div key={j} className="skeleton h-9 w-28 rounded-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {Array.from(coursesByRegion.entries()).map(([region, regionCourses]) => (
        <section key={region} className="space-y-2.5">
          <h3 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
            {region}
          </h3>
          <div className="flex flex-wrap gap-2">
            {regionCourses.map(course => {
              const isSelected = selectedIds.has(course.id)
              return (
                <button
                  key={course.id}
                  onClick={() => toggle(course.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-body font-medium transition-all duration-150 active:scale-95 select-none border ${
                    isSelected
                      ? 'bg-primary/15 text-primary border-primary/40'
                      : 'bg-transparent text-muted-foreground border-border hover:border-foreground/20'
                  }`}
                >
                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {course.name}
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {njCourses.length > 0 && (
        <section className="space-y-2.5 opacity-50">
          <h3 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
            🌱 New Jersey · Opening Spring 2026
          </h3>
          <div className="flex flex-wrap gap-2">
            {njCourses.map(course => (
              <span
                key={course.id}
                className="flex items-center px-3.5 py-2 rounded-full text-sm font-body font-medium border border-border text-muted-foreground cursor-default"
              >
                {course.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Course request */}
      <section className="space-y-2.5 pt-2">
        <h3 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
          Don't see your course?
        </h3>
        {requestStatus === 'sent' ? (
          <p className="text-sm font-body text-primary">Got it! We'll add it soon.</p>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={requestName}
              onChange={e => setRequestName(e.target.value)}
              placeholder="Course name"
              className="flex-1 h-10 px-3 rounded-lg bg-card border border-border text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
            />
            <button
              onClick={async () => {
                if (!requestName.trim() || !user) return
                setRequestStatus('sending')
                await supabase.from('course_requests').insert({
                  course_name: requestName.trim(),
                  user_id: user.id,
                })
                setRequestStatus('sent')
                setRequestName('')
              }}
              disabled={!requestName.trim() || requestStatus === 'sending'}
              className="h-10 px-4 rounded-lg bg-card border border-border text-sm font-body font-medium text-foreground hover:border-foreground/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Request It
            </button>
          </div>
        )}
      </section>

      <button
        onClick={() => onSave(selectedIds)}
        disabled={!canSave || isSaving}
        className="w-full h-14 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-base font-body mt-2"
      >
        {isSaving ? 'Saving\u2026' : saveLabel}
      </button>
    </div>
  )
}
