export const config = { runtime: 'edge' }

/**
 * Soft-broadcast notification: tells every member of the selected group(s)
 * that the round creator is playing, with a link to opt in.
 *
 * Differs from notify-invite in two ways:
 *   1. Recipients are NOT pre-RSVP'd to the round (no row in `rsvps`).
 *   2. Tone of the email is "Sylvan is playing — want to join?" rather than
 *      "You're invited to a round."
 *
 * Recipients are filtered:
 *   - Excludes the round's creator
 *   - Excludes anyone already on the round (any rsvps row, regardless of status)
 */
export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { roundId, groupIds } = await request.json()
  if (!roundId || !Array.isArray(groupIds) || groupIds.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing roundId or groupIds' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  const resendKey = process.env.RESEND_API_KEY

  if (!supabaseUrl || !supabaseKey || !resendKey) {
    return new Response(JSON.stringify({ error: 'Missing server configuration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const sbHeaders = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }

  // Fetch round + courses + existing RSVPs
  const roundRes = await fetch(
    `${supabaseUrl}/rest/v1/rounds?id=eq.${roundId}&select=*,round_courses(courses(name)),rsvps(user_id,email)`,
    { headers: sbHeaders },
  )
  const rounds = await roundRes.json()
  const round = rounds?.[0]
  if (!round) {
    return new Response(JSON.stringify({ error: 'Round not found' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Course names
  const courseNames = (round.round_courses ?? [])
    .map((rc: any) => rc.courses?.name)
    .filter(Boolean)
  const courseList = courseNames.length > 0 ? courseNames.join(', ') : 'TBD'

  // Date + time window for the body
  const date = new Date(round.round_date + 'T12:00:00')
  const dateLong = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const [sh, sm] = (round.time_window_start || '06:00').split(':').map(Number)
  const startStr = `${sh % 12 || 12}:${String(sm).padStart(2, '0')} ${sh < 12 ? 'AM' : 'PM'}`
  const [eh, em] = (round.time_window_end || '10:00').split(':').map(Number)
  const endStr = `${eh % 12 || 12}:${String(em).padStart(2, '0')} ${eh < 12 ? 'AM' : 'PM'}`
  const timeWindow = `${startStr} – ${endStr}`

  // Creator info — full_name (for the email body) and email (to exclude self)
  let creatorFirstName = 'Someone'
  let creatorEmail = ''
  if (round.creator_id) {
    const creatorRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${round.creator_id}&select=full_name,email`,
      { headers: sbHeaders },
    )
    const creators = await creatorRes.json()
    if (creators?.[0]) {
      creatorFirstName = (creators[0].full_name || 'Someone').split(' ')[0]
      creatorEmail = (creators[0].email || '').toLowerCase()
    }
  }

  // Already on the round — exclude these people from the broadcast
  const alreadyOnRoundUserIds = new Set(
    (round.rsvps ?? []).map((r: any) => r.user_id).filter(Boolean),
  )
  const alreadyOnRoundEmails = new Set(
    (round.rsvps ?? []).map((r: any) => (r.email || '').toLowerCase()).filter(Boolean),
  )
  if (creatorEmail) alreadyOnRoundEmails.add(creatorEmail)

  // Names of any "in" RSVPs to enrich the subject (e.g. "Sylvan and Matt are playing")
  const inNames = (round.rsvps ?? [])
    .filter((r: any) => r.status === 'in' && r.name)
    .map((r: any) => (r.name as string).split(' ')[0])
  let playingPhrase = `${creatorFirstName} is playing`
  if (inNames.length === 2) playingPhrase = `${inNames[0]} and ${inNames[1]} are playing`
  else if (inNames.length > 2) playingPhrase = `${inNames[0]}, ${inNames[1]} and others are playing`

  // Fetch group members (with their profiles, for email)
  const groupIdList = groupIds.map((g: string) => `"${g}"`).join(',')
  const membersRes = await fetch(
    `${supabaseUrl}/rest/v1/group_members?group_id=in.(${groupIdList})&select=user_id,profiles(id,full_name,email)`,
    { headers: sbHeaders },
  )
  const memberRows = await membersRes.json()

  // Dedupe recipients across multiple groups, exclude self + already-on-round
  const recipients = new Map<string, { email: string; name: string }>()
  for (const m of (memberRows ?? [])) {
    const p = m.profiles
    if (!p?.email) continue
    const email = p.email.toLowerCase()
    if (email === creatorEmail) continue
    if (alreadyOnRoundUserIds.has(p.id)) continue
    if (alreadyOnRoundEmails.has(email)) continue
    if (recipients.has(p.id)) continue
    recipients.set(p.id, { email, name: p.full_name ?? '' })
  }

  if (recipients.size === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, skipped: 'no_eligible_recipients' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const shareLink = round.share_code ? `https://thestarter.golf/r/${round.share_code}` : 'https://thestarter.golf'
  const subject = `${playingPhrase} ${dateLong.split(',')[0]} — want to join?`

  const body = [
    `${playingPhrase} ${dateLong}.`,
    `${courseList} · ${timeWindow}`,
    '',
    `Want to join? Tap to RSVP:`,
    shareLink,
    '',
    '— The Starter',
  ].join('\n')

  let sent = 0
  for (const r of recipients.values()) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'The Starter <teetimes@thestarter.golf>',
          to: [r.email],
          subject,
          text: body,
        }),
      })
      if (emailRes.ok) sent++
    } catch {
      // continue
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, eligible: recipients.size }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
