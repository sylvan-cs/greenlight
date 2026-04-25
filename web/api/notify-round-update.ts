export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { roundId, editorId } = await request.json()
  if (!roundId) {
    return new Response(JSON.stringify({ error: 'Missing roundId' }), {
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
  const dateShort = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  // Format time window
  const [sh, sm] = (round.time_window_start || '06:00').split(':').map(Number)
  const startStr = `${sh % 12 || 12}:${String(sm).padStart(2, '0')} ${sh < 12 ? 'AM' : 'PM'}`
  const [eh, em] = (round.time_window_end || '10:00').split(':').map(Number)
  const endStr = `${eh % 12 || 12}:${String(em).padStart(2, '0')} ${eh < 12 ? 'AM' : 'PM'}`
  const timeWindow = `${startStr} – ${endStr}`

  // Player count
  const playerCount = round.spots_needed ?? 0

  // Editor first name — fall back to organizer (first RSVP) if no editorId
  let editorFirstName = 'Your organizer'
  if (editorId) {
    const editorRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${editorId}&select=full_name`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    )
    const editors = await editorRes.json()
    if (editors?.[0]?.full_name) {
      editorFirstName = editors[0].full_name.split(' ')[0]
    }
  } else {
    const organizerFullName = round.rsvps?.[0]?.name ?? 'Your organizer'
    editorFirstName = organizerFullName.split(' ')[0]
  }

  // Collect emails from RSVPs who are "in" and provided an email
  // Exclude the editor — they made the change
  const recipients: string[] = (round.rsvps ?? [])
    .filter((r: any) => r.status === 'in' && r.email && r.user_id !== editorId)
    .map((r: any) => r.email)

  if (recipients.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const subject = `Round updated — ${courseList} on ${dateShort}`

  const body = [
    `${editorFirstName} updated the round details.`,
    '',
    'What changed:',
    `${dateLong} \u00b7 ${timeWindow} \u00b7 ${playerCount} players`,
    courseList,
    '',
    'Your RSVP is still active \u2014 we\u2019ll let you know when a time is found.',
    '',
    '\u2014 The Starter',
  ].join('\n')

  let sent = 0
  for (const to of recipients) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'The Starter <teetimes@thestarter.golf>',
          to: [to],
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
