import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getInitials } from '../lib/helpers'
import { supabase } from '../lib/supabase'
import CourseSelector from '../components/CourseSelector'
import Avatar from '../components/Avatar'
import type { Course, GroupWithMembers } from '../lib/types'

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '')
  // Remove leading 1 for US numbers
  const d = digits.startsWith('1') && digits.length > 10 ? digits.slice(1) : digits
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`
}

function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))
}

export default function Profile() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [emailOptIn, setEmailOptIn] = useState(true)
  const [flexibilityMinutes, setFlexibilityMinutes] = useState(60)
  const [courseRadiusMiles, setCourseRadiusMiles] = useState(25)
  const [phoneSaved, setPhoneSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [coursesLoading, setCoursesLoading] = useState(true)
  const [userCourses, setUserCourses] = useState<Course[]>([])
  const [editingCourses, setEditingCourses] = useState(false)
  const [savingCourses, setSavingCourses] = useState(false)
  const [groups, setGroups] = useState<GroupWithMembers[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [copiedGroupId, setCopiedGroupId] = useState<string | null>(null)

  const fullName = user?.user_metadata?.full_name ?? 'User'
  const email = user?.email ?? ''
  const initials = getInitials(fullName)

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('phone, sms_opt_in, email_opt_in, flexibility_minutes, course_radius_miles')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          supabase
            .from('profiles')
            .select('phone')
            .eq('id', user.id)
            .single()
            .then(({ data: d }) => {
              if (d?.phone) setPhone(d.phone)
              setProfileLoading(false)
            })
          return
        }
        if (data?.phone) setPhone(data.phone)
        if (data?.sms_opt_in != null) setSmsOptIn(data.sms_opt_in)
        if (data?.email_opt_in != null) setEmailOptIn(data.email_opt_in)
        if (data?.flexibility_minutes != null) setFlexibilityMinutes(data.flexibility_minutes)
        if (data?.course_radius_miles != null) setCourseRadiusMiles(data.course_radius_miles)
        setProfileLoading(false)
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
        setCoursesLoading(false)
      })
  }, [user])

  useEffect(() => {
    if (!user) return
    async function fetchGroups() {
      // Get group IDs the user is a member of
      const { data: memberData, error: memErr } = await (supabase as any)
        .from('group_members')
        .select('group_id')
        .eq('user_id', user!.id)
      if (memErr || !memberData || memberData.length === 0) {
        setGroupsLoading(false)
        return
      }
      const groupIds = memberData.map((m: any) => m.group_id)
      // Fetch groups with members — try with profiles join first, fall back without
      const { data, error: groupErr } = await (supabase as any)
        .from('groups')
        .select('*, group_members(id, group_id, user_id, role, joined_at, profiles:user_id(id, full_name, email))')
        .in('id', groupIds) as unknown as { data: GroupWithMembers[] | null; error: any }
      if (groupErr) {
        // Fallback: fetch without profiles join
        const { data: fallback } = await (supabase as any)
          .from('groups')
          .select('*, group_members(*)')
          .in('id', groupIds) as unknown as { data: GroupWithMembers[] | null }
        if (fallback) setGroups(fallback)
      } else if (data) {
        setGroups(data)
      }
      setGroupsLoading(false)
    }
    fetchGroups()
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

  const handleCreateGroup = async () => {
    if (!user || !newGroupName.trim()) return
    setCreatingGroup(true)
    const { data: group, error } = await (supabase as any)
      .from('groups')
      .insert({ name: newGroupName.trim(), created_by: user.id })
      .select('*')
      .single()

    if (!error && group) {
      // Add creator as owner member
      await (supabase as any).from('group_members').insert({
        group_id: group.id,
        user_id: user.id,
        role: 'owner',
      })

      // Optimistically add to state while refetching
      setGroups(prev => [...prev, { ...group, group_members: [{ id: 'temp', group_id: group.id, user_id: user.id, role: 'owner' as const, joined_at: new Date().toISOString(), profiles: { id: user.id, full_name: user.user_metadata?.full_name ?? 'You', email: user.email ?? '' } }] }])

      // Refetch groups for accurate data
      const { data: memberData } = await (supabase as any)
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id)
      if (memberData && memberData.length > 0) {
        const groupIds = memberData.map((m: any) => m.group_id)
        const { data } = await (supabase as any)
          .from('groups')
          .select('*, group_members(id, group_id, user_id, role, joined_at, profiles:user_id(id, full_name, email))')
          .in('id', groupIds) as unknown as { data: GroupWithMembers[] | null }
        if (data) setGroups(data)
      }
    }
    setNewGroupName('')
    setShowCreateGroup(false)
    setCreatingGroup(false)
  }

  const handleCopyGroupInvite = async (group: GroupWithMembers) => {
    const url = `${window.location.origin}/join/${group.invite_code}`
    await navigator.clipboard.writeText(url)
    setCopiedGroupId(group.id)
    setTimeout(() => setCopiedGroupId(null), 2000)
  }

  const savePhone = async () => {
    if (!user) return
    setSaving(true)
    setPhoneSaved(false)
    try {
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ phone, sms_opt_in: smsOptIn, email_opt_in: emailOptIn, flexibility_minutes: flexibilityMinutes, course_radius_miles: courseRadiusMiles })
        .eq('id', user.id)
      // If columns don't exist yet, save phone only
      if (updateErr) {
        await supabase.from('profiles').update({ phone }).eq('id', user.id)
      }
      setPhoneSaved(true)
      setTimeout(() => setPhoneSaved(false), 3000)
    } catch {
      setSaveError('Failed to save. Please try again.')
      setTimeout(() => setSaveError(''), 3000)
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

      {/* Notifications */}
      <section className="space-y-3">
        <h2 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
          Notifications
        </h2>

        {profileLoading ? (
          <div className="space-y-3">
            <div className="skeleton h-5 w-64 rounded" />
            <div className="skeleton h-12 w-full rounded-xl" />
            <div className="skeleton h-5 w-56 rounded" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={smsOptIn}
                  onChange={e => setSmsOptIn(e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
                <span className="text-sm font-body text-foreground">
                  Text me when a tee time opens up
                </span>
              </label>
              <div className="flex gap-3 ml-[26px]">
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(formatPhoneNumber(e.target.value))}
                  placeholder="(555) 123-4567"
                  className="flex-1 h-12 px-4 bg-card border border-border rounded-xl text-foreground font-body placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                />
              </div>
              {phone && !isValidPhone(phone) && (
                <p className="text-xs font-body text-destructive ml-[26px]">Enter a valid 10-digit phone number</p>
              )}
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={emailOptIn}
                onChange={e => setEmailOptIn(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-primary"
              />
              <span className="text-sm font-body text-foreground">
                Email me when a tee time opens up
              </span>
            </label>

            <p className="text-xs font-body text-muted-foreground/60 ml-[26px]">
              Reply STOP to any text to opt out
            </p>

            {saveError && (
              <p className="text-sm font-body text-destructive">{saveError}</p>
            )}

            <button
              onClick={savePhone}
              disabled={saving || (smsOptIn && phone !== '' && !isValidPhone(phone))}
              className="h-12 px-5 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors disabled:opacity-50 text-sm font-body"
            >
              {saving ? 'Saving\u2026' : phoneSaved ? 'Saved!' : 'Save'}
            </button>
          </>
        )}
      </section>

      <hr className="border-border/40" />

      {/* Preferences */}
      <section className="space-y-5">
        <h2 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
          Preferences
        </h2>

        {/* Time Flexibility */}
        <div className="space-y-2">
          <label className="text-sm font-body text-foreground">
            How far outside my preferred window should we look?
          </label>
          <div className="flex gap-2">
            {[
              { label: '30 min', value: 30 },
              { label: '1 hour', value: 60 },
              { label: '2 hours', value: 120 },
              { label: 'Any time', value: 0 },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setFlexibilityMinutes(opt.value)}
                className={`flex-1 h-10 rounded-xl text-xs font-body font-medium border transition-colors ${
                  flexibilityMinutes === opt.value
                    ? 'bg-primary/15 text-primary border-primary/40'
                    : 'bg-card border-border text-muted-foreground hover:border-primary/30'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Course Radius */}
        <div className="space-y-2">
          <label className="text-sm font-body text-foreground">
            Suggest nearby courses I haven't selected?
          </label>
          <div className="flex gap-2">
            {[
              { label: 'Off', value: 0 },
              { label: '10 mi', value: 10 },
              { label: '25 mi', value: 25 },
              { label: '50 mi', value: 50 },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setCourseRadiusMiles(opt.value)}
                className={`flex-1 h-10 rounded-xl text-xs font-body font-medium border transition-colors ${
                  courseRadiusMiles === opt.value
                    ? 'bg-primary/15 text-primary border-primary/40'
                    : 'bg-card border-border text-muted-foreground hover:border-primary/30'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs font-body text-muted-foreground/60">
            We'll suggest available times at courses near your selected ones
          </p>
        </div>
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

        {coursesLoading ? (
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton h-9 w-28 rounded-full" />
            ))}
          </div>
        ) : editingCourses ? (
          <CourseSelector
            key="profile-course-editor"
            initialSelectedIds={new Set(userCourses.map(c => c.id))}
            onSave={saveCoursesEdit}
            saveLabel="Save"
            isSaving={savingCourses}
            showAllActive
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

      {/* My Groups */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
            My Groups
          </h2>
          <button
            onClick={() => setShowCreateGroup(true)}
            className="text-xs font-body font-medium text-primary hover:underline"
          >
            + Create
          </button>
        </div>

        {/* Create group modal */}
        {showCreateGroup && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h3 className="font-display text-lg">Create a Group</h3>
            <input
              type="text"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="Group name (e.g. Saturday Crew)"
              className="w-full h-12 px-4 bg-background border border-border rounded-xl text-foreground font-body placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateGroup}
                disabled={creatingGroup || !newGroupName.trim()}
                className="flex-1 h-10 bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl text-sm font-body disabled:opacity-50"
              >
                {creatingGroup ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => { setShowCreateGroup(false); setNewGroupName('') }}
                className="flex-1 h-10 border border-border text-foreground font-semibold rounded-xl text-sm font-body"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {groupsLoading ? (
          <div className="space-y-2">
            <div className="skeleton h-16 w-full rounded-2xl" />
            <div className="skeleton h-16 w-full rounded-2xl" />
          </div>
        ) : groups.length === 0 && !showCreateGroup ? (
          <p className="text-sm font-body text-muted-foreground">
            No groups yet. Create one to easily invite your crew to rounds.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map(group => {
              const members = group.group_members ?? []
              return (
                <div
                  key={group.id}
                  className="bg-card border border-border rounded-2xl p-4 transition-all duration-150 hover:border-primary/30"
                >
                  <button
                    onClick={() => navigate(`/group/${group.id}`)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-display text-[15px] font-medium text-foreground">
                        {group.name}
                      </p>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {members.slice(0, 5).map((m, i) => (
                          <Avatar key={i} name={m.profiles?.full_name ?? '?'} size={24} />
                        ))}
                        {members.length > 5 && (
                          <span className="text-xs font-body text-muted-foreground ml-1">
                            +{members.length - 5}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-body text-muted-foreground">
                        {members.length} member{members.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </button>
                  <div className="mt-2 pt-2 border-t border-border/40">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopyGroupInvite(group) }}
                      className="text-xs font-body font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      {copiedGroupId === group.id ? 'Copied!' : 'Copy invite link'}
                    </button>
                  </div>
                </div>
              )
            })}
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
