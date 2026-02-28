import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import CourseSelector from '../components/CourseSelector'

export default function OnboardCourses() {
  const { user, setNeedsOnboarding } = useAuth()
  const navigate = useNavigate()
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async (selectedIds: Set<string>) => {
    if (!user) return
    setIsSaving(true)

    const rows = Array.from(selectedIds).map(course_id => ({
      user_id: user.id,
      course_id,
    }))

    const { error } = await supabase.from('user_courses').insert(rows)

    if (!error) {
      setNeedsOnboarding(false)
      navigate('/home')
    } else {
      console.error('Failed to save courses:', error)
    }
    setIsSaving(false)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col px-5 pt-14 pb-10 animate-fade-in">
      <div className="w-full max-w-sm mx-auto flex flex-col gap-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-display tracking-tight">Your Courses</h1>
          <p className="text-sm font-body text-muted-foreground">
            Pick the courses you play. You can always change these later.
          </p>
        </div>

        <CourseSelector
          onSave={handleSave}
          saveLabel="Continue"
          isSaving={isSaving}
        />
      </div>
    </div>
  )
}
