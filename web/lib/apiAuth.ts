// Shared auth guards for the /api/notify-* edge functions.
//
// These endpoints hold the Supabase SERVICE ROLE key, which bypasses RLS and
// can email/SMS any user. They previously accepted any unauthenticated POST,
// so anyone who learned a roundId could spam a group (and notify-invite would
// email arbitrary caller-supplied user ids). Every endpoint now requires the
// caller's Supabase session JWT and verifies they actually belong to the
// round/group they are acting on.
//
// Lives outside api/ so Vercel's file-system routing can't expose it as an
// endpoint; it is bundled into each function that imports it.

export type AuthOk = { ok: true; userId: string }
export type AuthErr = { ok: false; status: number; error: string }
export type AuthResult = AuthOk | AuthErr

/** Verify the caller's Supabase JWT. Returns their user id, or an error. */
export async function requireUser(
  request: Request,
  supabaseUrl: string,
  apiKey: string
): Promise<AuthResult> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    return { ok: false, status: 401, error: 'Sign in required' }
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      return { ok: false, status: 401, error: 'Invalid or expired session' }
    }
    const user = await res.json()
    if (!user?.id) {
      return { ok: false, status: 401, error: 'Invalid session' }
    }
    return { ok: true, userId: user.id }
  } catch {
    return { ok: false, status: 503, error: 'Could not verify session' }
  }
}

/** True if the user created the round or has an RSVP row on it. */
export async function userIsOnRound(
  supabaseUrl: string,
  serviceKey: string,
  roundId: string,
  userId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/rounds?id=eq.${encodeURIComponent(roundId)}&select=creator_id,rsvps(user_id)`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
    if (!res.ok) return false
    const rows = await res.json()
    const round = rows?.[0]
    if (!round) return false
    if (round.creator_id === userId) return true
    return (round.rsvps ?? []).some((r: { user_id?: string }) => r.user_id === userId)
  } catch {
    return false
  }
}

/** True if the user created the round (stricter than membership). */
export async function userOwnsRound(
  supabaseUrl: string,
  serviceKey: string,
  roundId: string,
  userId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/rounds?id=eq.${encodeURIComponent(roundId)}&select=creator_id`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
    if (!res.ok) return false
    const rows = await res.json()
    return rows?.[0]?.creator_id === userId
  } catch {
    return false
  }
}

/** True if the user is a member of every group id supplied. */
export async function userIsInGroups(
  supabaseUrl: string,
  serviceKey: string,
  groupIds: string[],
  userId: string
): Promise<boolean> {
  if (!groupIds.length) return false
  try {
    const list = groupIds.map(encodeURIComponent).join(',')
    const res = await fetch(
      `${supabaseUrl}/rest/v1/group_members?group_id=in.(${list})&user_id=eq.${encodeURIComponent(userId)}&select=group_id`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
    if (!res.ok) return false
    const rows = await res.json()
    const mine = new Set((rows ?? []).map((r: { group_id: string }) => r.group_id))
    return groupIds.every(id => mine.has(id))
  } catch {
    return false
  }
}

/** Standard JSON error response. */
export function authFailure(err: AuthErr): Response {
  return new Response(JSON.stringify({ error: err.error }), {
    status: err.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
