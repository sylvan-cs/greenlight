import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import CourseSelector from '../components/CourseSelector'

export default function OnboardCourses() {
  const { user, setNeedsOnboarding } = useAuth()
  const navigate = useNavigate()
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [existingIds, setExistingIds] = useState<Set<string> | null>(null)
  const hasLinkedRsvps = !!localStorage.getItem('linked_rsvps')

  // Load any previously saved courses so the UI stays in sync
  useEffect(() => {
    if (!user) return
    supabase
      .from('user_courses')
      .select('course_id')
      .eq('user_id', user.id)
      .then(({ data }) => {
        setExistingIds(new Set((data ?? []).map(r => r.course_id)))
      })
  }, [user])

  const handleSave = async (selectedIds: Set<string>) => {
    if (!user) return
    setIsSaving(true)

    // Delete existing rows first, then insert — avoids unique constraint conflicts
    await supabase.from('user_courses').delete().eq('user_id', user.id)

    const rows = Array.from(selectedIds).map(course_id => ({
      user_id: user.id,
      course_id,
    }))

    const { error } = await supabase.from('user_courses').insert(rows)

    if (!error) {
      setNeedsOnboarding(false)
      navigate('/home')
    } else {
      setSaveError('Something went wrong saving your courses. Please try again.')
    }
    setIsSaving(false)
  }

  // Wait for existing courses to load before rendering the selector
  if (existingIds === null) {
    return (
      <div className="min-h-screen bg-background flex flex-col px-5 pt-14 pb-10 animate-fade-in">
        <div className="w-full max-w-sm mx-auto flex flex-col gap-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-display tracking-tight">Your Courses</h1>
            <p className="text-sm font-body text-muted-foreground">
              Pick the courses you play. You can always change these later.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col px-5 pt-14 pb-10 animate-fade-in">
      <div className="w-full max-w-sm mx-auto flex flex-col gap-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-display tracking-tight">Your Courses</h1>
          <p className="text-sm font-body text-muted-foreground">
            {hasLinkedRsvps
              ? 'Pick the courses you play, or skip for now \u2014 you have rounds waiting for you.'
              : 'Pick the courses you play. You can always change these later.'}
          </p>
        </div>

        {saveError && (
          <p className="text-sm font-body text-destructive">{saveError}</p>
        )}

        <CourseSelector
          initialSelectedIds={existingIds}
          onSave={handleSave}
          saveLabel="Continue"
          isSaving={isSaving}
        />

        {hasLinkedRsvps && (
          <button
            onClick={() => {
              setNeedsOnboarding(false)
              navigate('/home')
            }}
            className="w-full text-center text-sm font-body text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  )
}
