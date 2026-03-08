import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getInitials } from '../lib/helpers'
import { supabase } from '../lib/supabase'
import CourseSelector from '../components/CourseSelector'
import type { Course } from '../lib/types'

export default function Profile() {
  const { user, signOut } = useAuth()
  const [phone, setPhone] = useState('')
  const [smsOptIn, setSmsOptIn] = useState(true)
  const [phoneSaved, setPhoneSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [userCourses, setUserCourses] = useState<Course[]>([])
  const [editingCourses, setEditingCourses] = useState(false)
  const [savingCourses, setSavingCourses] = useState(false)

  const fullName = user?.user_metadata?.full_name ?? 'User'
  const email = user?.email ?? ''
  const initials = getInitials(fullName)

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('phone, sms_opt_in')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.phone) setPhone(data.phone)
        if (data?.sms_opt_in != null) setSmsOptIn(data.sms_opt_in)
      })
  }, [user])

  useEffect(() => {
    if (!user) return
    supabase
      .from('user_courses')
      .select('course_id, courses(*)')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (data) {
          setUserCourses(data.map((uc: any) => uc.courses).filter(Boolean))
        }
      })
  }, [user])

  const saveCoursesEdit = async (selectedIds: Set<string>) => {
    if (!user) return
    setSavingCourses(true)

    await supabase.from('user_courses').delete().eq('user_id', user.id)

    if (selectedIds.size > 0) {
      const rows = Array.from(selectedIds).map(course_id => ({
        user_id: user.id,
        course_id,
      }))
      await supabase.from('user_courses').insert(rows)
    }

    const { data } = await supabase
      .from('user_courses')
      .select('course_id, courses(*)')
      .eq('user_id', user.id)
    if (data) setUserCourses(data.map((uc: any) => uc.courses).filter(Boolean))

    setEditingCourses(false)
    setSavingCourses(false)
  }

  const savePhone = async () => {
    if (!user) return
    setSaving(true)
    setPhoneSaved(false)
    try {
      await supabase
        .from('profiles')
        .update({ phone, sms_opt_in: smsOptIn })
        .eq('id', user.id)
      setPhoneSaved(true)
      setTimeout(() => setPhoneSaved(false), 3000)
    } catch (e) {
      console.error('Failed to save phone:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in pb-8">
      {/* Header */}
      <header className="pt-4 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xl font-display text-muted-foreground shrink-0">
            {initials}
          </div>
          <div>
            <h1 className="text-3xl font-display tracking-tight">{fullName}</h1>
            <p className="text-sm text-muted-foreground font-body mt-0.5">{email}</p>
          </div>
        </div>
      </header>

      <hr className="border-border/40" />

      {/* Phone number */}
      <section className="space-y-3">
        <h2 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
          Phone Number
        </h2>
        <p className="text-xs font-body text-muted-foreground">
          Get SMS alerts when a matching tee time is found.
        </p>
        <div className="flex gap-3">
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+1 (555) 123-4567"
            className="flex-1 h-12 px-4 bg-card border border-border rounded-xl text-foreground font-body placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
          <button
            onClick={savePhone}
            disabled={saving}
            className="h-12 px-5 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-50 text-sm font-body"
          >
            {saving ? 'Saving\u2026' : phoneSaved ? 'Saved!' : 'Save'}
          </button>
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={smsOptIn}
            onChange={e => setSmsOptIn(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-primary"
          />
          <span className="text-sm font-body text-foreground">
            Send me text alerts when a tee time opens up
          </span>
        </label>
        <p className="text-xs font-body text-muted-foreground/60 ml-[26px]">
          Reply STOP anytime to opt out
        </p>
      </section>

      <hr className="border-border/40" />

      {/* My Courses */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
            My Courses
          </h2>
          {!editingCourses && (
            <button
              onClick={() => setEditingCourses(true)}
              className="text-xs font-body font-medium text-primary hover:underline"
            >
              Edit
            </button>
          )}
        </div>

        {editingCourses ? (
          <CourseSelector
            key="profile-course-editor"
            initialSelectedIds={new Set(userCourses.map(c => c.id))}
            onSave={saveCoursesEdit}
            saveLabel="Save"
            isSaving={savingCourses}
          />
        ) : userCourses.length === 0 ? (
          <p className="text-sm font-body text-muted-foreground">
            No courses added yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {userCourses.map(course => (
              <span
                key={course.id}
                className="px-3.5 py-2 rounded-full text-sm font-body font-medium bg-primary/15 text-primary border border-primary/40"
              >
                {course.name}
              </span>
            ))}
          </div>
        )}
      </section>

      <hr className="border-border/40" />

      {/* Sign Out */}
      <section className="pb-4">
        <button
          onClick={signOut}
          className="w-full h-12 flex items-center justify-center gap-2 border border-destructive/30 text-destructive font-medium rounded-xl hover:bg-destructive/10 transition-colors font-body"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign Out
        </button>
      </section>
    </div>
  )
}
