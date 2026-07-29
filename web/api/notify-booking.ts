export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { roundId, bookerId, teeTimeId } = await request.json()
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

  // This endpoint is the SINGLE WRITER for the booked transition. Clients must
  // not flip rounds.status themselves: doing so used to make the guard below
  // see an already-'booked' round and 409 on every call, so the "locked it in"
  // notification never sent. Claiming here keeps it race-safe and idempotent —
  // whoever wins the conditional update is the one who notifies.

  // Resolve the tee time server-side rather than trusting client-sent values.
  let slot: { id: string; tee_time: string; course_id: string } | null = null
  if (teeTimeId) {
    const ttRes = await fetch(
      `${supabaseUrl}/rest/v1/tee_times?id=eq.${teeTimeId}&select=id,tee_time,course_id`,
      { headers }
    )
    const tts = await ttRes.json()
    slot = tts?.[0] ?? null
  }

  const claim: Record<string, unknown> = {
    status: 'booked',
    updated_at: new Date().toISOString(),
  }
  if (slot) {
    claim.has_specific_time = true
    claim.specific_tee_time = slot.tee_time
    claim.specific_course_id = slot.course_id
    claim.matched_tee_time_id = slot.id
    claim.matched_at = new Date().toISOString()
  }

  // Only a non-terminal round can be claimed. 'found' MUST be included — it is
  // the normal state after the matcher finds a time, i.e. the common case.
  const claimRes = await fetch(
    `${supabaseUrl}/rest/v1/rounds?id=eq.${roundId}&status=in.(open,watching,found)`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(claim),
    }
  )
  const claimed = await claimRes.json()

  if (!Array.isArray(claimed) || claimed.length === 0) {
    // Either already booked/cancelled (genuine race) or the id doesn't exist.
    const existsRes = await fetch(
      `${supabaseUrl}/rest/v1/rounds?id=eq.${roundId}&select=id,status`,
      { headers }
    )
    const existing = await existsRes.json()
    if (!existing?.[0]) {
      return new Response(JSON.stringify({ error: 'Round not found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(
      JSON.stringify({ error: 'Someone already booked this round', status: existing[0].status }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // We won the claim — load the full round (with embeds) to build notifications.
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
    return new Response(JSON.stringify({ ok: true, sent: 0, sms: 0, round }), {
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

  return new Response(JSON.stringify({ ok: true, sent, sms: smsSent, round }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
