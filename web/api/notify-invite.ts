export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { roundId, invitedUserIds } = await request.json()
  if (!roundId || !invitedUserIds?.length) {
    return new Response(JSON.stringify({ error: 'Missing roundId or invitedUserIds' }), {
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

  // Fetch the round with courses and RSVPs
  const roundRes = await fetch(
    `${supabaseUrl}/rest/v1/rounds?id=eq.${roundId}&select=*,round_courses(*,courses(*)),rsvps(*)`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }
  )
  const rounds = await roundRes.json()
  const round = rounds?.[0]

  if (!round) {
    return new Response(JSON.stringify({ error: 'Round not found' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Organizer name (first RSVP is always the creator)
  const organizerFullName = round.rsvps?.[0]?.name ?? 'Someone'
  const organizerFirstName = organizerFullName.split(' ')[0]

  // Course names
  const courseNames = (round.round_courses ?? [])
    .map((rc: any) => rc.courses?.name)
    .filter(Boolean)
  const courseList = courseNames.length > 0 ? courseNames.join(', ') : 'TBD'

  // Format date
  const date = new Date(round.round_date + 'T12:00:00')
  const dateLong = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  // Format time window
  const [sh, sm] = (round.time_window_start || '06:00').split(':').map(Number)
  const startStr = `${sh % 12 || 12}:${String(sm).padStart(2, '0')} ${sh < 12 ? 'AM' : 'PM'}`
  const [eh, em] = (round.time_window_end || '10:00').split(':').map(Number)
  const endStr = `${eh % 12 || 12}:${String(em).padStart(2, '0')} ${eh < 12 ? 'AM' : 'PM'}`
  const timeWindow = `${startStr} \u2013 ${endStr}`

  const playerCount = round.spots_needed ?? 0

  // Get emails for invited users from their RSVP records
  const invitedRsvps = (round.rsvps ?? []).filter(
    (r: any) => invitedUserIds.includes(r.user_id) && r.email
  )

  if (invitedRsvps.length === 0) {
    // Fall back: fetch emails from profiles
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=in.(${invitedUserIds.join(',')})&select=id,email`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    )
    const profiles = await profileRes.json()
    if (profiles?.length) {
      for (const p of profiles) {
        if (p.email) invitedRsvps.push({ email: p.email })
      }
    }
  }

  if (invitedRsvps.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const subject = `${organizerFirstName} invited you to a round`

  const body = [
    `${organizerFirstName} is looking for a tee time and wants you in the group.`,
    '',
    courseList,
    `${dateLong} \u00b7 ${timeWindow} \u00b7 ${playerCount} players`,
    '',
    'Open the app to respond:',
    'https://thestarter.golf',
    '',
    '\u2014 The Starter',
  ].join('\n')

  let sent = 0
  for (const rsvp of invitedRsvps) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'The Starter <teetimes@thestarter.golf>',
          to: [rsvp.email],
          subject,
          text: body,
        }),
      })
      if (emailRes.ok) sent++
    } catch {
      // continue sending to remaining recipients
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
