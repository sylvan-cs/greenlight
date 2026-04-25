export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { roundId, bookerId } = await request.json()
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
    const missing = [
      !supabaseUrl && 'SUPABASE_URL',
      !supabaseKey && 'SUPABASE_SERVICE_KEY',
      !resendKey && 'RESEND_API_KEY',
    ].filter(Boolean)
    return new Response(JSON.stringify({ error: 'Missing server configuration', missing }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  }

  // Telnyx env vars (optional — SMS skipped if not configured)
  const telnyxApiKey = process.env.TELNYX_API_KEY
  const telnyxPhone = process.env.TELNYX_PHONE_NUMBER
  const telnyxConfigured = !!(telnyxApiKey && telnyxPhone)

  // Fetch the round with courses and RSVPs
  const roundRes = await fetch(
    `${supabaseUrl}/rest/v1/rounds?id=eq.${roundId}&select=*,round_courses(*,courses(*)),rsvps(*)`,
    { headers }
  )
  const rounds = await roundRes.json()
  const round = rounds?.[0]

  if (!round) {
    return new Response(JSON.stringify({ error: 'Round not found' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // If round is already booked by someone else, return conflict
  if (round.status === 'booked') {
    return new Response(JSON.stringify({ error: 'Someone already booked this round' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Get booker's name
  let bookerName = 'Your group organizer'
  if (bookerId) {
    const bookerRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${bookerId}&select=full_name`,
      { headers }
    )
    const bookers = await bookerRes.json()
    if (bookers?.[0]?.full_name) {
      bookerName = bookers[0].full_name.split(' ')[0]
    }
  } else {
    // Fall back to organizer name
    const organizerFullName = round.rsvps?.[0]?.name ?? 'Your group organizer'
    bookerName = organizerFullName.split(' ')[0]
  }

  // Get course info
  const courseRecord = round.specific_course_id
    ? round.round_courses?.find((rc: any) => rc.course_id === round.specific_course_id)?.courses
    : round.round_courses?.[0]?.courses
  const courseName = courseRecord?.name
  const courseDisplay = courseName ?? 'the course'
  const bookingUrl = courseRecord?.booking_url ?? ''

  // Format date
  const date = new Date(round.round_date + 'T12:00:00')
  const dateLong = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const dateShort = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  // Format tee time
  const teeTime = round.specific_tee_time || round.time_window_start
  const [h, m] = teeTime.split(':').map(Number)
  const timeStr = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`

  const playerCount = round.spots_needed ?? 0

  // Collect emails from RSVPs who are "in" and provided an email
  const recipients: string[] = (round.rsvps ?? [])
    .filter((r: any) => r.status === 'in' && r.email)
    .map((r: any) => r.email)

  if (recipients.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, sms: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const subject = `\u2705 ${bookerName} locked it in \u2014 ${courseDisplay} on ${dateStr}`

  const body = [
    `\u2705 ${bookerName} locked it in.`,
    '',
    `${courseDisplay} \u00b7 ${dateLong} \u00b7 ${timeStr}`,
    `${playerCount} players`,
    '',
    bookingUrl ? `Book: ${bookingUrl}` : '',
    bookingUrl ? `\u2192 Select ${dateShort} \u00b7 ${playerCount} players \u00b7 ${timeStr}` : '',
    '',
    'See you out there.',
    '\u2014 The Starter',
  ].filter(Boolean).join('\n')

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

  // Send SMS via Telnyx to RSVPs who are "in" and have opted in
  let smsSent = 0
  if (telnyxConfigured) {
    const smsBody = `\u2705 ${bookerName} locked it in. ${timeStr} at ${courseDisplay} on ${dateLong}. See you out there.\n\u2014 The Starter`

    const inRsvps = (round.rsvps ?? []).filter((r: any) => r.status === 'in' && r.user_id)

    for (const rsvp of inRsvps) {
      try {
        const profileRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${rsvp.user_id}&select=phone,sms_opt_in`,
          { headers }
        )
        const profiles = await profileRes.json()
        const profile = profiles?.[0]

        if (profile?.sms_opt_in && profile?.phone) {
          await fetch('https://api.telnyx.com/v2/messages', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${telnyxApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: telnyxPhone!,
              to: profile.phone,
              text: smsBody,
            }),
          })
          smsSent++
        }
      } catch {
        // continue sending to remaining recipients
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, sms: smsSent }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
