import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Avatar from '../components/Avatar'
import type { GroupWithMembers } from '../lib/types'

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [group, setGroup] = useState<GroupWithMembers | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    async function fetchGroup() {
      const { data, error } = await (supabase as any)
        .from('groups')
        .select('*, group_members(id, group_id, user_id, role, joined_at, profiles:user_id(id, full_name, email))')
        .eq('id', id!)
        .single() as unknown as { data: GroupWithMembers | null; error: any }

      console.log('GroupDetail fetch:', { data, error })
      if (data?.group_members) {
        console.log('Members raw:', JSON.stringify(data.group_members, null, 2))
      }
      if (!error && data) {
        setGroup(data)
        setNameInput(data.name)
      }
      setLoading(false)
    }

    fetchGroup()
  }, [id])

  const isOwner = !!(user && group && group.created_by === user.id)

  const handleCopy = async () => {
    if (!group) return
    const url = `${window.location.origin}/join/${group.invite_code}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveName = async () => {
    if (!group || !nameInput.trim()) return
    setSavingName(true)
    const { error } = await (supabase as any)
      .from('groups')
      .update({ name: nameInput.trim() })
      .eq('id', group.id)
    if (!error) {
      setGroup(prev => prev ? { ...prev, name: nameInput.trim() } : prev)
      setEditingName(false)
    }
    setSavingName(false)
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!group) return
    setRemovingId(memberId)
    const { error } = await (supabase as any)
      .from('group_members')
      .delete()
      .eq('id', memberId)
    if (!error) {
      setGroup(prev => prev ? {
        ...prev,
        group_members: prev.group_members.filter(m => m.id !== memberId),
      } : prev)
    }
    setRemovingId(null)
  }

  const handleLeave = async () => {
    if (!group || !user) return
    setLeaving(true)
    await (supabase as any)
      .from('group_members')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', user.id)
    navigate('/profile')
  }

  const handleDelete = async () => {
    if (!group) return
    setDeleting(true)
    // Delete members first, then group (avoids FK constraint issues)
    await (supabase as any).from('group_members').delete().eq('group_id', group.id)
    await (supabase as any).from('groups').delete().eq('id', group.id)
    // Small delay to let Supabase commit before Profile refetches
    await new Promise(r => setTimeout(r, 300))
    navigate('/profile')
  }

  if (loading) {
    return (
      <div className="animate-fade-in space-y-6 px-5 max-w-lg mx-auto pt-4">
        <div className="skeleton" style={{ height: 28, width: 200 }} />
        <div className="skeleton w-full" style={{ height: 120 }} />
        <div className="skeleton w-full" style={{ height: 200 }} />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground font-body">Group not found.</p>
          <button onClick={() => navigate('/profile')} className="text-primary font-body font-medium">Go Back</button>
        </div>
      </div>
    )
  }

  const members = group.group_members ?? []
  return (
    <div className="animate-fade-in space-y-6 px-5 max-w-lg mx-auto pt-4 pb-10">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/profile')}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-muted/60 hover:bg-muted transition-colors shrink-0 active:scale-95"
          aria-label="Go back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        {editingName ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              className="flex-1 h-10 px-3 bg-card border border-border rounded-xl text-foreground font-display text-xl focus:outline-none focus:border-primary transition-colors"
              autoFocus
            />
            <button
              onClick={handleSaveName}
              disabled={savingName || !nameInput.trim()}
              className="h-10 px-4 bg-primary text-primary-foreground font-bold rounded-xl text-sm font-body disabled:opacity-50"
            >
              {savingName ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => { setEditingName(false); setNameInput(group.name) }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <h1 className="text-3xl font-display tracking-tight">{group.name}</h1>
            {isOwner && (
              <button
                onClick={() => setEditingName(true)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Edit name"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Invite Link ── */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-2">
        <h3 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
          Invite Link
        </h3>
        <p className="text-sm font-body text-muted-foreground">
          Share this link to invite people to your group
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-muted-foreground truncate text-[13px] font-body bg-background rounded-xl px-3 py-2.5">
            {`${window.location.origin}/join/${group.invite_code}`}
          </code>
          <button
            onClick={handleCopy}
            className="shrink-0 h-10 px-4 bg-primary hover:bg-green-hover text-primary-foreground font-semibold rounded-xl transition-colors text-sm font-body"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* ── Members ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
            Members
          </h2>
          <span className="text-xs font-body text-muted-foreground">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="space-y-1">
          {members.map(member => {
            const name = member.profiles?.full_name ?? 'Unknown'
            const isSelf = member.user_id === user?.id
            return (
              <div
                key={member.id}
                className="flex items-center gap-3 py-3 px-3 rounded-lg"
              >
                <Avatar name={name} confirmed={member.role === 'owner'} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-body font-medium text-foreground truncate">
                      {name}{isSelf ? ' (you)' : ''}
                    </span>
                    {member.role === 'owner' && (
                      <span className="text-[10px] font-body text-primary uppercase tracking-wider font-semibold">
                        Owner
                      </span>
                    )}
                  </div>
                </div>
                {isOwner && !isSelf && member.role !== 'owner' && (
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    disabled={removingId === member.id}
                    className="text-xs font-body text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Delete Group (owner) ── */}
      {isOwner && (
        <>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full text-center text-sm font-body text-muted-foreground/60 hover:text-destructive transition-colors py-2"
          >
            Delete Group
          </button>

          {showDeleteConfirm && (
            <div className="bg-card border border-destructive/30 rounded-2xl p-5 space-y-3">
              <p className="text-sm font-body text-foreground">Delete "{group.name}"? This will remove all members.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 h-10 bg-destructive text-white font-semibold rounded-xl text-sm font-body disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 h-10 border border-border text-foreground font-semibold rounded-xl text-sm font-body"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Leave Group (non-owner) ── */}
      {!isOwner && (
        <>
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="w-full text-center text-sm font-body text-muted-foreground/60 hover:text-destructive transition-colors py-2"
          >
            Leave Group
          </button>

          {showLeaveConfirm && (
            <div className="bg-card border border-destructive/30 rounded-2xl p-5 space-y-3">
              <p className="text-sm font-body text-foreground">Leave "{group.name}"?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleLeave}
                  disabled={leaving}
                  className="flex-1 h-10 bg-destructive text-white font-semibold rounded-xl text-sm font-body disabled:opacity-50"
                >
                  {leaving ? 'Leaving...' : 'Leave'}
                </button>
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 h-10 border border-border text-foreground font-semibold rounded-xl text-sm font-body"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
