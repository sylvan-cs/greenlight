import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
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
  const [courses, setCourses] = useState<Course[]>([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelectedIds))

  useEffect(() => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const future = new Date(today)
    future.setDate(future.getDate() + 30)
    const futureStr = future.toISOString().split('T')[0]

    supabase
      .from('courses')
      .select('*, tee_times!inner(id)')
      .eq('tee_times.is_available', true)
      .gte('tee_times.tee_date', todayStr)
      .lte('tee_times.tee_date', futureStr)
      .order('region')
      .order('name')
      .then(({ data, error }) => {
        if (error) console.error('Failed to load courses:', error)
        if (data) setCourses(data.map((row: any) => { const { tee_times, ...course } = row; return course; }) as Course[])
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
